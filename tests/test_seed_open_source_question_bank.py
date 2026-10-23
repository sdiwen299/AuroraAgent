"""Regression tests for offline seeding of the open-source default question bank.

``insert_template_questions`` writes template questions directly into a workspace
database so the crawler output can reach the default bank without a running
server. These tests pin schema creation, cross-run ``question_hash`` dedup, tag
serialization, blank filtering, and the propagation path that makes seeded
questions visible to every account (root -> primary -> secondary).
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from typing import Any

from auroraagent.accounts.workspaces import (
    ensure_account_workspace,
    insert_template_questions,
    seed_public_template_questions,
    seed_targets,
    workspace_dir,
)
from auroraagent.db import init_database_engine

ROOT = Path(__file__).parents[1]
SCRIPT = ROOT / "scripts" / "seed_open_source_question_bank.py"


def _load_script() -> Any:
    spec = importlib.util.spec_from_file_location("seed_open_source_question_bank", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _sample(question: str, **overrides: Any) -> dict[str, Any]:
    payload = {
        "topic": "java",
        "category": "后端",
        "difficulty": "hard",
        "question": question,
        "reference_answer": "参考答案",
        "tags": ["java", "concurrency"],
    }
    payload.update(overrides)
    return payload


def test_insert_creates_schema_and_serializes_tags(tmp_path: Path) -> None:
    db_path = tmp_path / "data.db"
    inserted, skipped = insert_template_questions(db_path, [_sample("什么是 JVM？")])

    assert (inserted, skipped) == (1, 0)
    assert db_path.exists()

    engine = init_database_engine(db_path)
    engine.dispose()
    import json
    import sqlite3

    with sqlite3.connect(db_path) as connection:
        rows = connection.execute(
            "SELECT category, difficulty, source_type, status, practice_count, tags "
            "FROM questions"
        ).fetchall()
    assert len(rows) == 1
    category, difficulty, source_type, status, practice_count, tags = rows[0]
    assert (category, difficulty, source_type, status, practice_count) == (
        "后端",
        "hard",
        "template",
        "new",
        0,
    )
    assert json.loads(tags) == ["java", "concurrency"]


def test_insert_dedups_across_calls_and_skips_blanks(tmp_path: Path) -> None:
    db_path = tmp_path / "data.db"
    first = insert_template_questions(
        db_path, [_sample("重复题"), _sample("   "), {"question": ""}]
    )
    assert first == (1, 2)

    second = insert_template_questions(
        db_path,
        [
            _sample("重复题"),
            _sample("  重复题  "),
            _sample("新题", category="数据库"),
        ],
    )
    # 已存在与空白/规范化后重复的都被跳过，只新增“新题”。
    assert second == (1, 2)

    engine = init_database_engine(db_path)
    engine.dispose()
    import sqlite3

    with sqlite3.connect(db_path) as connection:
        count = connection.execute("SELECT COUNT(*) FROM questions").fetchone()[0]
    assert count == 2


def test_seed_propagates_root_primary_secondary(tmp_path: Path) -> None:
    questions = [_sample(f"第 {index} 题", category="后端") for index in range(3)]
    insert_template_questions(tmp_path / "data.db", questions)

    # 主账号首次创建时会整库复制根工作区，因此无需再次播种。
    primary = ensure_account_workspace(tmp_path, 1, primary=True)
    assert seed_public_template_questions(tmp_path, primary) == 0

    secondary = ensure_account_workspace(tmp_path, 2, primary=False)
    assert seed_public_template_questions(primary, secondary) == 3

    engine = init_database_engine(secondary / "data.db")
    engine.dispose()
    import sqlite3

    with sqlite3.connect(secondary / "data.db") as connection:
        rows = connection.execute(
            "SELECT source_type, COUNT(*) FROM questions GROUP BY source_type"
        ).fetchall()
    assert rows == [("template", 3)]


def test_seed_targets_includes_root_and_all_existing_workspaces(tmp_path: Path) -> None:
    assert seed_targets(tmp_path) == [tmp_path]

    insert_template_questions(tmp_path / "data.db", [_sample("占位题")])
    for account_id in (2, 5):
        workspace = workspace_dir(tmp_path, account_id)
        workspace.mkdir(parents=True)
        init_database_engine(workspace / "data.db").dispose()

    targets = seed_targets(tmp_path)
    assert targets == [tmp_path, workspace_dir(tmp_path, 2), workspace_dir(tmp_path, 5)]


def test_seed_default_questions_fills_root_and_existing_workspaces(tmp_path: Path) -> None:
    from auroraagent.accounts.workspaces import seed_default_questions

    # 账号工作区已存在（含自身题目），根工作区已有 1 道题。
    insert_template_questions(tmp_path / "data.db", [_sample("根已有题")])
    workspace = workspace_dir(tmp_path, 7)
    workspace.mkdir(parents=True)
    init_database_engine(workspace / "data.db").dispose()

    questions = [_sample("根已有题"), _sample("新题 A"), _sample("新题 B")]
    results = seed_default_questions(tmp_path, questions)

    assert results[0][0] == tmp_path
    assert results[0][1] == 2 and results[0][2] == 1  # 新增 2，跳过 1 重复
    assert results[1][0] == workspace
    assert results[1][1] == 3  # 账号工作区补齐根工作区的全部 3 道模板题

    import sqlite3

    with sqlite3.connect(workspace / "data.db") as connection:
        count = connection.execute("SELECT COUNT(*) FROM questions").fetchone()[0]
    assert count == 3


def test_script_load_questions_accepts_both_shapes(tmp_path: Path) -> None:
    module = _load_script()
    payload = tmp_path / "bank.json"
    payload.write_text('[{"question": "A"}, {"question": " "}, {"question": "B"}]', encoding="utf-8")
    assert [item["question"] for item in module._load_questions(payload)] == ["A", "B"]

    wrapped = tmp_path / "wrapped.json"
    wrapped.write_text('{"questions": [{"question": "C"}]}', encoding="utf-8")
    assert [item["question"] for item in module._load_questions(wrapped)] == ["C"]
