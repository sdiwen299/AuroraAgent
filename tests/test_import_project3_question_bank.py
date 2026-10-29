"""Regression tests for the SmartFace (project3) question-bank import script.

The script bridges project3's MySQL ``questions`` table and AuroraAgent's
``POST /api/questions/import`` endpoint. These tests pin the normalization
boundaries (difficulty mapping, type filter, minimum length, in-batch dedup),
the env-file parsing, the accepted JSON export shapes, and the 1000-question
upload batching — all in memory, without MySQL or network access.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path
from typing import Any

import pytest

ROOT = Path(__file__).parents[1]
SCRIPT = ROOT / "scripts" / "import_project3_question_bank.py"


def _load_script() -> Any:
    spec = importlib.util.spec_from_file_location("import_project3_question_bank", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _normalize_args(**overrides: Any) -> argparse.Namespace:
    values: dict[str, Any] = {"type": None, "topic": "", "category": ""}
    values.update(overrides)
    return argparse.Namespace(**values)


def _mysql_row(**overrides: Any) -> dict[str, Any]:
    row: dict[str, Any] = {
        "id": 1,
        "question_id": "Q-001",
        "type": "数据库",
        "content": "什么是事务的 ACID 特性？",
        "answer": "原子性、一致性、隔离性和持久性。",
        "difficulty": "简单",
        "source": "八股文",
        "created_at": "2025-07-01 10:00:00",
    }
    row.update(overrides)
    return row


def test_difficulty_matches_backend_normalization() -> None:
    module = _load_script()
    assert module._difficulty("easy") == "easy"
    assert module._difficulty("简单") == "easy"
    assert module._difficulty("难") == "hard"
    assert module._difficulty("困难") == "hard"
    assert module._difficulty("") == "medium"
    assert module._difficulty("中等") == "medium"


def test_mysql_row_normalized_shape() -> None:
    module = _load_script()
    normalized, stats = module._normalize_rows([_mysql_row()], _normalize_args())
    assert stats == {"filtered": 0, "too_short": 0, "duplicate": 0}
    assert len(normalized) == 1
    item = normalized[0]
    assert item["topic"] == "数据库"
    assert item["category"] == "智面未来题库"
    assert item["difficulty"] == "easy"
    assert item["question"] == "什么是事务的 ACID 特性？"
    assert item["reference_answer"] == "原子性、一致性、隔离性和持久性。"
    assert item["source_question_id"] == "Q-001"
    assert "SmartFace" in item["tags"]
    assert "数据库" in item["tags"]
    assert "八股文" in item["tags"]


def test_type_filter_too_short_and_duplicate() -> None:
    module = _load_script()
    rows = [
        _mysql_row(),
        _mysql_row(id=2, question_id="Q-002", type="Java", content="HashMap 的底层实现是什么？"),
        _mysql_row(id=3, question_id="Q-003", content="短题"),
        _mysql_row(id=4, question_id="Q-004", content="什么是 事务的 ACID 特性？"),
    ]
    normalized, stats = module._normalize_rows(rows, _normalize_args(type=["数据库"]))
    assert [item["source_question_id"] for item in normalized] == ["Q-001"]
    assert stats["filtered"] == 1
    assert stats["too_short"] == 1
    assert stats["duplicate"] == 1


def test_topic_and_category_overrides() -> None:
    module = _load_script()
    normalized, _ = module._normalize_rows(
        [_mysql_row()], _normalize_args(topic="MySQL", category="自建题库")
    )
    assert normalized[0]["topic"] == "MySQL"
    assert normalized[0]["category"] == "自建题库"


def test_env_file_parsing(tmp_path: Path) -> None:
    module = _load_script()
    env_file = tmp_path / ".env"
    env_file.write_text(
        "# 注释行\n"
        "OTHER_API_KEY=ignored\n"
        "DB_HOST=localhost\n"
        "DB_PORT=3306\n"
        "DB_USER=root\n"
        "DB_PASSWORD=secret\n"
        "DB_NAME=mydb\n",
        encoding="utf-8",
    )
    values = module._load_env_file(env_file)
    assert values["DB_HOST"] == "localhost"
    assert values["DB_PORT"] == "3306"
    assert values["DB_USER"] == "root"
    assert values["DB_PASSWORD"] == "secret"
    assert values["DB_NAME"] == "mydb"


def test_read_input_accepts_array_and_questions_object(tmp_path: Path) -> None:
    module = _load_script()
    array_file = tmp_path / "array.json"
    array_file.write_text(json.dumps([_mysql_row()], ensure_ascii=False), encoding="utf-8")
    assert len(module._read_input(array_file)) == 1

    object_file = tmp_path / "object.json"
    payload = {
        "source_type": "template",
        "origin_url": "mysql://localhost:3306/mydb/questions",
        "questions": [_mysql_row()],
    }
    object_file.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    assert len(module._read_input(object_file)) == 1


def test_read_input_rejects_invalid_root(tmp_path: Path) -> None:
    module = _load_script()
    bad_file = tmp_path / "bad.json"
    bad_file.write_text(json.dumps({"questions": "not-a-list"}), encoding="utf-8")
    with pytest.raises(ValueError):
        module._read_input(bad_file)


def test_upload_batches_by_max_batch(monkeypatch: pytest.MonkeyPatch) -> None:
    module = _load_script()
    calls: list[dict[str, Any]] = []

    def fake_post_json(api_base: str, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        batch = payload["questions"]
        calls.append({"api_base": api_base, "path": path, "size": len(batch)})
        return {"count": len(batch), "skipped": 1 if len(batch) < module.MAX_BATCH else 0}

    monkeypatch.setattr(module, "_post_json", fake_post_json)
    questions = [{"question": f"题目 {index}", "tags": []} for index in range(module.MAX_BATCH + 1)]
    saved, skipped = module._upload("http://127.0.0.1:8080", questions)

    assert len(calls) == 2
    assert calls[0]["path"] == "/api/questions/import"
    assert calls[0]["size"] == module.MAX_BATCH
    assert calls[1]["size"] == 1
    assert saved == module.MAX_BATCH + 1
    assert skipped == 1
