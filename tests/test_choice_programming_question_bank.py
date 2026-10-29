"""Regression tests for the choice/programming popular question bank.

``data/choice-programming-question-bank.json`` is seeded into the public template
bank together with the crawler output. These tests pin the file shape, the API
payload validation for every shipped question, and the offline seeding round trip
that carries ``question_type``/``options``/``correct_answer``/``starter_code``
into workspaces (root -> primary -> secondary).
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

from auroraagent.accounts.workspaces import (
    ensure_account_workspace,
    insert_template_questions,
    seed_public_template_questions,
)
from auroraagent.db import init_database_engine

ROOT = Path(__file__).parents[1]
BANK_PATH = ROOT / "data" / "choice-programming-question-bank.json"


def _load_bank() -> dict[str, Any]:
    payload = json.loads(BANK_PATH.read_text(encoding="utf-8"))
    assert isinstance(payload, dict)
    return payload


def _questions() -> list[dict[str, Any]]:
    questions = _load_bank().get("questions")
    assert isinstance(questions, list)
    return [item for item in questions if isinstance(item, dict)]


def test_bank_contains_valid_choice_and_programming_questions() -> None:
    payload = _load_bank()
    assert payload["source_type"] == "template"

    questions = _questions()
    choice = [item for item in questions if item.get("question_type") == "choice"]
    programming = [item for item in questions if item.get("question_type") == "programming"]
    assert len(choice) >= 5
    assert len(programming) >= 4

    seen: set[str] = set()
    for item in questions:
        question = str(item.get("question") or "").strip()
        assert question
        assert question not in seen, f"重复题干：{question}"
        seen.add(question)
        assert str(item.get("reference_answer") or "").strip()

        if item["question_type"] == "choice":
            options = item.get("options") or []
            assert 2 <= len(options) <= 8
            assert all(str(option).strip() for option in options)
            assert len(set(options)) == len(options)
            correct = str(item.get("correct_answer") or "")
            assert correct in {chr(ord("A") + index) for index in range(len(options))}
        else:
            assert str(item.get("starter_code") or "").strip()
            assert str(item.get("language") or "").strip()


def test_every_bank_question_passes_api_payload_validation() -> None:
    from fastapi.responses import JSONResponse

    from auroraagent.api import _question_from_payload

    for item in _questions():
        parsed = _question_from_payload(dict(item), source_type="template")
        assert not isinstance(parsed, JSONResponse), f"payload 校验失败：{item.get('question')}"
        if item["question_type"] == "choice":
            assert parsed.question_type == "choice"
            assert parsed.correct_answer
        else:
            assert parsed.question_type == "programming"
            assert parsed.starter_code


def test_seed_script_defaults_include_choice_programming_bank() -> None:
    import importlib.util
    import sys

    script = ROOT / "scripts" / "seed_open_source_question_bank.py"
    spec = importlib.util.spec_from_file_location("seed_open_source_question_bank", script)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)

    assert BANK_PATH.name in {path.name for path in module.DEFAULT_INPUTS}
    loaded = module._load_questions(BANK_PATH)
    assert len(loaded) == len(_questions())


def test_seeding_roundtrip_preserves_question_type_fields(tmp_path: Path) -> None:
    db_path = tmp_path / "data.db"
    inserted, skipped = insert_template_questions(db_path, _questions())
    assert (inserted, skipped) == (len(_questions()), 0)

    engine = init_database_engine(db_path)
    engine.dispose()

    with sqlite3.connect(db_path) as connection:
        rows = connection.execute(
            "SELECT question_type, options, correct_answer, starter_code, language "
            "FROM questions ORDER BY id"
        ).fetchall()
    assert len(rows) == len(_questions())
    choice_rows = [row for row in rows if row[0] == "choice"]
    programming_rows = [row for row in rows if row[0] == "programming"]
    assert choice_rows and programming_rows
    for _, options, correct_answer, _, _ in choice_rows:
        assert json.loads(options)
        assert correct_answer in {"A", "B", "C", "D", "E", "F", "G", "H"}
    for _, _, _, starter_code, language in programming_rows:
        assert starter_code.strip()
        assert language.strip()


def test_question_type_fields_propagate_to_secondary_workspace(tmp_path: Path) -> None:
    insert_template_questions(tmp_path / "data.db", _questions())

    primary = ensure_account_workspace(tmp_path, 1, primary=True)
    assert seed_public_template_questions(tmp_path, primary) == 0  # 首次登录整库复制

    secondary = ensure_account_workspace(tmp_path, 2, primary=False)
    propagated = seed_public_template_questions(primary, secondary)
    assert propagated == len(_questions())

    engine = init_database_engine(secondary / "data.db")
    engine.dispose()

    with sqlite3.connect(secondary / "data.db") as connection:
        counts = dict(
            connection.execute(
                "SELECT question_type, COUNT(*) FROM questions GROUP BY question_type"
            ).fetchall()
        )
    assert counts.get("choice", 0) >= 5
    assert counts.get("programming", 0) >= 4
