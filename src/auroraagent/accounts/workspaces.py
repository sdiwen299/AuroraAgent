from __future__ import annotations

import json
import os
import sqlite3
import tempfile
from contextvars import ContextVar, Token
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from auroraagent.db import init_database_engine


@dataclass(frozen=True)
class Workspace:
    account_id: int
    data_dir: Path


_current: ContextVar[Workspace | None] = ContextVar("auroraagent_workspace", default=None)


def set_current_workspace(workspace: Workspace | None) -> Token[Workspace | None]:
    return _current.set(workspace)


def reset_current_workspace(token: Token[Workspace | None]) -> None:
    _current.reset(token)


def current_workspace() -> Workspace | None:
    return _current.get()


def workspace_dir(data_dir: Path, account_id: int) -> Path:
    return data_dir / "users" / str(account_id)


def ensure_account_workspace(
    data_dir: Path, account_id: int, *, primary: bool
) -> Path:
    """确保账号工作区存在；主账号首次创建时继承根工作区的既有数据。"""

    target = workspace_dir(data_dir, account_id)
    db_path = target / "data.db"
    if db_path.exists():
        return target
    target.mkdir(parents=True, exist_ok=True)
    root_db = data_dir / "data.db"
    if primary and root_db.exists():
        # VACUUM INTO 产出事务一致的单文件快照，规避直接拷贝 WAL 的竞态。
        # 先写到同目录临时文件再原子替换，避免并发的首个请求同时写目标文件。
        handle, tmp_name = tempfile.mkstemp(dir=target, suffix=".migrating")
        os.close(handle)
        os.unlink(tmp_name)
        try:
            with sqlite3.connect(root_db) as source:
                source.execute("VACUUM INTO ?", (tmp_name,))
            os.replace(tmp_name, db_path)
        except OSError:
            Path(tmp_name).unlink(missing_ok=True)
            if not db_path.exists():
                raise
    return target


def seed_public_template_questions(source_dir: Path, target_dir: Path) -> int:
    """Copy missing public templates while keeping practice state workspace-local."""

    source_db = source_dir / "data.db"
    target_db = target_dir / "data.db"
    if not source_db.exists() or source_db == target_db:
        return 0

    engine = init_database_engine(target_db)
    engine.dispose()
    from auroraagent.repositories.questions import question_hash as hash_question
    with sqlite3.connect(source_db) as source, sqlite3.connect(target_db) as target:
        source.row_factory = sqlite3.Row
        target.row_factory = sqlite3.Row
        columns = {row[1] for row in target.execute("PRAGMA table_info(questions)")}
        if not {"question", "source_type", "question_hash"}.issubset(columns):
            return 0
        source_columns = {row[1] for row in source.execute("PRAGMA table_info(questions)")}
        typed_columns = {"question_type", "options", "correct_answer", "starter_code", "language"}
        carry_types = typed_columns.issubset(source_columns) and typed_columns.issubset(columns)
        select_sql = (
            "SELECT topic, category, difficulty, question, reference_answer, tags, "
            "question_hash, question_type, options, correct_answer, starter_code, language "
            "FROM questions WHERE source_type = 'template'"
            if carry_types
            else "SELECT topic, category, difficulty, question, reference_answer, tags, "
            "question_hash FROM questions WHERE source_type = 'template'"
        )
        rows = source.execute(select_sql).fetchall()
        existing = {
            row[0]
            for row in target.execute(
                "SELECT question_hash FROM questions WHERE source_type = 'template'"
            )
            if row[0]
        }
        inserted = 0
        for row in rows:
            question_hash = row["question_hash"]
            if not question_hash:
                question_hash = hash_question(row["question"])
            if not question_hash or question_hash in existing:
                continue
            values = [
                row["topic"], row["category"], row["difficulty"], row["question"],
                row["reference_answer"], row["tags"],
            ]
            if carry_types:
                values.extend(
                    [
                        row["question_type"] or "subjective",
                        row["options"] or "[]",
                        row["correct_answer"] or "",
                        row["starter_code"] or "",
                        row["language"] or "",
                    ]
                )
            values.append(question_hash)
            insert_sql = (
                "INSERT INTO questions "
                "(topic, category, difficulty, question, reference_answer, tags, "
                "question_type, options, correct_answer, starter_code, language, "
                "source_type, status, practice_count, question_hash) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'template', 'new', 0, ?)"
                if carry_types
                else "INSERT INTO questions "
                "(topic, category, difficulty, question, reference_answer, tags, "
                "source_type, status, practice_count, question_hash) "
                "VALUES (?, ?, ?, ?, ?, ?, 'template', 'new', 0, ?)"
            )
            target.execute(insert_sql, tuple(values))
            existing.add(question_hash)
            inserted += 1
        target.commit()
    return inserted


def _typed_question_fields(
    item: dict[str, Any],
) -> tuple[str, str, str, str, str] | None:
    """校验单条模板题的题型字段，镜像 ``_question_from_payload`` 的 API 规则。

    返回 ``(question_type, options_json, correct_answer, starter_code, language)``；
    题型非法或选择题数据不合法时返回 ``None``，调用方应把该题计入 skipped，
    避免离线播种写出 API 会拒绝的脏数据。
    """
    from auroraagent.repositories.questions import normalize_question_type

    question_type = normalize_question_type(str(item.get("question_type") or ""))
    if question_type is None:
        return None
    if question_type == "choice":
        options = [
            str(option).strip()
            for option in (item.get("options") or [])
            if str(option).strip()
        ]
        if not 2 <= len(options) <= 8:
            return None
        letters = {chr(ord("A") + index) for index in range(len(options))}
        correct = str(item.get("correct_answer") or "").strip()
        if len(correct) <= 2 and correct.upper() in letters:
            return question_type, json.dumps(options, ensure_ascii=False), correct.upper(), "", ""
        lowered = correct.casefold()
        for index, option in enumerate(options):
            if option.casefold() == lowered:
                return (
                    question_type,
                    json.dumps(options, ensure_ascii=False),
                    chr(ord("A") + index),
                    "",
                    "",
                )
        return None
    if question_type == "programming":
        language = str(item.get("language") or "").strip() or "python"
        return question_type, "", "", str(item.get("starter_code") or ""), language
    return question_type, "", "", "", ""


def insert_template_questions(
    db_path: Path, questions: list[dict[str, Any]]
) -> tuple[int, int]:
    """把内存中的题目写入某个工作区的模板题库，按 question_hash 去重。

    用于离线播种默认题库：写入根工作区（``data/data.db``）后，主账号首次登录会
    复制根库，其他账号登录时再由 :func:`seed_public_template_questions` 继承，
    从而让所有登录用户看到同一份默认题库。去重覆盖该库已有的全部题目，
    与 ``POST /api/questions/import`` 行为一致。
    """

    engine = init_database_engine(db_path)
    engine.dispose()
    from auroraagent.repositories.questions import question_hash as hash_question

    inserted = 0
    skipped = 0
    with sqlite3.connect(db_path) as connection:
        columns = {row[1] for row in connection.execute("PRAGMA table_info(questions)")}
        if not {"question", "source_type", "question_hash"}.issubset(columns):
            raise ValueError("questions 表结构不受支持，无法写入模板题库")
        existing = {
            row[0]
            for row in connection.execute("SELECT question_hash FROM questions")
            if row[0]
        }
        for item in questions:
            question = str(item.get("question") or "").strip()
            if not question:
                skipped += 1
                continue
            question_hash = hash_question(question)
            if not question_hash or question_hash in existing:
                skipped += 1
                continue
            typed = _typed_question_fields(item)
            if typed is None:
                skipped += 1
                continue
            question_type, options_json, correct_answer, starter_code, language = typed
            connection.execute(
                "INSERT INTO questions "
                "(topic, category, difficulty, question, reference_answer, tags, "
                "question_type, options, correct_answer, starter_code, language, "
                "source_type, status, practice_count, question_hash) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'template', 'new', 0, ?)",
                (
                    str(item.get("topic") or ""),
                    str(item.get("category") or ""),
                    str(item.get("difficulty") or "medium"),
                    question,
                    str(item.get("reference_answer") or ""),
                    json.dumps(
                        [str(tag) for tag in (item.get("tags") or []) if str(tag).strip()],
                        ensure_ascii=False,
                    ),
                    question_type,
                    options_json,
                    correct_answer,
                    starter_code,
                    language,
                    question_hash,
                ),
            )
            existing.add(question_hash)
            inserted += 1
        connection.commit()
    return inserted, skipped


def seed_targets(data_dir: Path) -> list[Path]:
    """返回默认题库应写入的工作区目录：根工作区 + 所有已存在的账号工作区。

    根工作区始终包含，便于在空数据目录上引导默认题库；直接写入已存在的账号工作区，
    可让当前已登录用户在无需重新登录的情况下立即看到默认题库。新账号仍由
    :func:`seed_public_template_questions` 在登录时从主账号工作区继承。
    """

    targets: list[Path] = [data_dir]
    users_dir = data_dir / "users"
    if users_dir.is_dir():
        for db_path in sorted(users_dir.glob("*/data.db")):
            if db_path.parent not in targets:
                targets.append(db_path.parent)
    return targets


def seed_default_questions(
    data_dir: Path, questions: list[dict[str, Any]]
) -> list[tuple[Path, int, int | None]]:
    """把题目播种进根工作区，并从根工作区补齐所有已存在的账号工作区。

    根工作区是模板题的长期来源；账号工作区通过 :func:`seed_public_template_questions`
    按 ``question_hash`` 补齐缺失题目，与登录时的继承路径保持一致。返回每个工作区的
    ``(目录, 新增, 跳过)``；账号工作区只统计新增，跳过数为 ``None``。
    """

    results: list[tuple[Path, int, int | None]] = []
    inserted, skipped = insert_template_questions(data_dir / "data.db", questions)
    results.append((data_dir, inserted, skipped))
    for target in seed_targets(data_dir)[1:]:
        results.append((target, seed_public_template_questions(data_dir, target), None))
    return results


class RoutingSessionFactory(sessionmaker[Session]):
    """按请求上下文路由到账号工作区的会话工厂。

    继承 ``sessionmaker`` 以便 SQLAlchemy 事件监听（如 before_commit）仍然生效：
    单例工厂持有根引擎，``__call__`` 时按当前工作区注入对应引擎。无上下文时
    （启动、迁移、后台任务）回退根工作区，保持既有单机行为。
    """

    def __init__(self, root_data_dir: Path, root_engine: Engine, **kw: Any) -> None:
        super().__init__(bind=root_engine, expire_on_commit=False, **kw)
        self._root_data_dir = root_data_dir
        self._root_engine = root_engine
        self._engines: dict[int, Engine] = {}

    def _engine(self) -> Engine:
        workspace = current_workspace()
        if workspace is None:
            return self._root_engine
        engine = self._engines.get(workspace.account_id)
        if engine is None:
            engine = init_database_engine(workspace.data_dir / "data.db")
            self._engines[workspace.account_id] = engine
        return engine

    def __call__(self, **local_kw: Any) -> Session:
        return super().__call__(bind=self._engine(), **local_kw)

    def dispose(self) -> None:
        for engine in self._engines.values():
            engine.dispose()
        self._engines.clear()
