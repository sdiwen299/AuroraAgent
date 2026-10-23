#!/usr/bin/env python3
"""Import the SmartFace (project3) MySQL question bank into AuroraAgent.

SmartFace（``project3/01014097-SFY``，智面未来）把题库存在本地 MySQL 的
``mydb.questions`` 表里。本脚本读取该表，归一化为 AuroraAgent 的模板题目，
写出可移植的 JSON 导出文件，并可选地上传到本地 ``/api/questions/import``
接口——导入后以 ``source_type=template`` 展示在「题库刷题 → 热门笔试题库」，
并由后端按 question_hash 去重。

脚本只读源库，不向 project3 写入任何数据；题库数据只进入 AuroraAgent。
数据库口令不写入任何文件：通过 ``--env-file`` 指向 project3 的 ``.env``
或 ``--db-password`` 参数在运行时传入。

用法示例（连接参数来自 project3 的 ``Edu_py/.env``）::

    python scripts/import_project3_question_bank.py \
        --env-file ../project3/01014097-SFY/Edu_py/.env \
        --api-base http://127.0.0.1:8080

只导出 JSON 不上传::

    python scripts/import_project3_question_bank.py \
        --env-file ../project3/01014097-SFY/Edu_py/.env --skip-api

只导某个类型（对应 ``questions.type``，可重复传入）::

    python scripts/import_project3_question_bank.py --env-file ... --type 数据库

已有 JSON 导出时不再连 MySQL::

    python scripts/import_project3_question_bank.py \
        --input data/project3-question-bank.json --api-base http://127.0.0.1:8080
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen

MAX_BATCH = 1000  # /api/questions/import 单次最多 1000 道。
MAX_TOTAL = 10000  # 单次运行的防御性上限。
MIN_QUESTION_LENGTH = 6  # 与 scripts/import_template_question_bank.py 一致。

DEFAULT_CATEGORY = "智面未来题库"
DEFAULT_OUTPUT = Path("data/project3-question-bank.json")

# 与后端 _normalize_difficulty 保持同一口径。
_EASY_VALUES = {"easy", "简单"}
_HARD_VALUES = {"hard", "困难", "难"}


def _difficulty(value: str) -> str:
    normalized = value.strip().lower()
    if normalized in _EASY_VALUES:
        return "easy"
    if normalized in _HARD_VALUES:
        return "hard"
    return "medium"


def _load_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip()
    return values


def _mysql_params(args: argparse.Namespace) -> dict[str, Any]:
    env: dict[str, str] = {}
    if args.env_file:
        env = _load_env_file(args.env_file)
    params: dict[str, Any] = {
        "host": args.db_host or env.get("DB_HOST") or "localhost",
        "port": args.db_port or int(env.get("DB_PORT") or 3306),
        "user": args.db_user or env.get("DB_USER") or "root",
        "database": args.db_name or env.get("DB_NAME") or "mydb",
    }
    # 口令只在运行时从 .env 或命令行参数进入内存，不落盘。
    params["passwd"] = args.db_password or env.get("DB_PASSWORD") or ""
    return params


def _read_mysql_rows(params: dict[str, Any]) -> list[dict[str, Any]]:
    try:
        import pymysql
    except ImportError as exc:
        raise ValueError(
            "读取 MySQL 需要 pymysql 驱动：pip install pymysql（或改用 --input 导入 JSON 导出）"
        ) from exc
    params["charset"] = "utf8mb4"
    params["cursorclass"] = pymysql.cursors.DictCursor
    try:
        connection = pymysql.connect(**params)
    except pymysql.err.Error as exc:
        raise ValueError(f"MySQL 连接失败：{exc}") from exc
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT * FROM questions")
            return [dict(row) for row in cursor.fetchall()]
    except pymysql.err.Error as exc:
        raise ValueError(f"MySQL 读取 questions 表失败：{exc}") from exc
    finally:
        connection.close()


def _read_input(path: Path) -> list[dict[str, Any]]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(value, list):
        rows = value
    elif isinstance(value, dict) and isinstance(value.get("questions"), list):
        rows = value["questions"]
    else:
        raise ValueError("JSON 根节点必须是数组或含 questions 数组的对象")
    return [row for row in rows if isinstance(row, dict)]


def _derived_tags(row: dict[str, Any]) -> list[str]:
    tags: list[str] = []
    for candidate in (
        "SmartFace",
        row.get("type"),
        row.get("question_type"),
        row.get("knowledge_point"),
        row.get("source"),
    ):
        text = str(candidate or "").strip()
        if text and text not in tags:
            tags.append(text)
    return tags


def _row_tags(row: dict[str, Any]) -> list[str]:
    raw_tags = row.get("tags")
    if isinstance(raw_tags, list) and raw_tags:
        return [str(tag).strip() for tag in raw_tags if str(tag).strip()]
    return _derived_tags(row)


def _normalize_rows(
    rows: list[dict[str, Any]], args: argparse.Namespace
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    type_filter = {value.strip() for value in (args.type or []) if value.strip()}
    normalized: list[dict[str, Any]] = []
    seen: set[str] = set()
    stats = {"filtered": 0, "too_short": 0, "duplicate": 0}
    for row in rows:
        row_type = str(row.get("type") or "").strip()
        if type_filter and row_type not in type_filter:
            stats["filtered"] += 1
            continue
        question = str(row.get("content") or row.get("question") or "").strip()
        if len(question) < MIN_QUESTION_LENGTH:
            stats["too_short"] += 1
            continue
        key = re.sub(r"\s+", "", question).casefold()
        if key in seen:
            stats["duplicate"] += 1
            continue
        seen.add(key)
        topic = (args.topic or row_type or row.get("topic") or "").strip()
        category = (args.category or row.get("category") or DEFAULT_CATEGORY).strip()
        normalized.append(
            {
                "topic": topic,
                "category": category,
                "difficulty": _difficulty(str(row.get("difficulty") or "")),
                "question": question,
                "reference_answer": str(
                    row.get("answer") or row.get("reference_answer") or ""
                ).strip(),
                "tags": _row_tags(row),
                "source_question_id": str(
                    row.get("question_id") or row.get("source_question_id") or ""
                ).strip(),
            }
        )
        if len(normalized) >= MAX_TOTAL:
            print(f"已达单次运行上限 {MAX_TOTAL} 道，停止读取更多题目", file=sys.stderr)
            break
    return normalized, stats


def _post_json(api_base: str, path: str, payload: dict[str, Any]) -> dict[str, Any]:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = Request(
        api_base.rstrip("/") + path,
        data=body,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=30) as response:  # noqa: S310 - local API is operator supplied
        return json.loads(response.read().decode("utf-8"))


def _upload(api_base: str, questions: list[dict[str, Any]]) -> tuple[int, int]:
    saved = 0
    skipped = 0
    for start in range(0, len(questions), MAX_BATCH):
        batch = questions[start : start + MAX_BATCH]
        payload = _post_json(
            api_base,
            "/api/questions/import",
            {"source_type": "template", "questions": batch},
        )
        saved += int(payload.get("count") or 0)
        skipped += int(payload.get("skipped") or 0)
    return saved, skipped


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
        except (ValueError, OSError):
            pass

    parser = argparse.ArgumentParser(
        description="导入 SmartFace(project3) MySQL 题库到 AuroraAgent 模板题库"
    )
    source = parser.add_mutually_exclusive_group()
    source.add_argument(
        "--input", type=Path, help="从 JSON 导出导入（数组或含 questions 数组的对象），不连 MySQL"
    )
    parser.add_argument("--env-file", type=Path, help="project3 的 .env 文件，读取 DB_* 连接参数")
    parser.add_argument("--db-host", default="")
    parser.add_argument("--db-port", type=int)
    parser.add_argument("--db-user", default="")
    parser.add_argument("--db-password", default="", help="不传时回退到 --env-file 的 DB_PASSWORD")
    parser.add_argument("--db-name", default="")
    parser.add_argument("--type", action="append", help="只导 questions.type 为该值的题目，可重复")
    parser.add_argument("--topic", default="", help="覆盖所有题目的 topic（默认取 questions.type）")
    parser.add_argument("--category", default="", help="题库分类标签（默认 智面未来题库）")
    parser.add_argument("--output-json", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--api-base", default=os.environ.get("AURORA_API_BASE", ""))
    parser.add_argument("--skip-api", action="store_true", help="只生成 JSON 导出，不调用本地 API")
    args = parser.parse_args()

    try:
        if args.input:
            rows = _read_input(args.input)
            origin_url = args.input.resolve().as_uri()
        else:
            params = _mysql_params(args)
            rows = _read_mysql_rows(dict(params))
            origin_url = (
                f"mysql://{params['host']}:{params['port']}/{params['database']}/questions"
            )
        questions, stats = _normalize_rows(rows, args)
        if not questions:
            raise ValueError("没有识别到可用题目；请确认 questions 表有数据，或调整 --type 过滤条件")
        args.output_json.parent.mkdir(parents=True, exist_ok=True)
        payload = {"source_type": "template", "origin_url": origin_url, "questions": questions}
        args.output_json.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(
            f"读取 {len(rows)} 行：类型过滤 {stats['filtered']}，题目过短 {stats['too_short']}，"
            f"批内重复 {stats['duplicate']}，规范化 {len(questions)} 道"
        )
        print(f"已生成 {args.output_json}")
        if args.skip_api or not args.api_base:
            if not args.skip_api and not args.api_base:
                print(
                    "未提供 --api-base，跳过上传；可加 --api-base http://127.0.0.1:8080 重跑",
                    file=sys.stderr,
                )
            else:
                print("--skip-api 生效，未调用本地 API")
            return 0
        saved, skipped = _upload(args.api_base, questions)
        print(f"题库导入：新增 {saved}，跳过 {skipped}")
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"导入失败：{exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
