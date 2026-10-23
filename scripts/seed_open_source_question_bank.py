#!/usr/bin/env python3
"""把爬取到的开源题库播种进默认题库，让所有登录用户可见。

读取题库 JSON（``crawl_open_source_question_bank`` 产出的开源题库，以及
``data/choice-programming-question-bank.json`` 选择题/编程题题库），写入工作区数据库的
模板题库（``source_type='template'``）。播种后：

* 根工作区（``<data-dir>/data.db``）持有模板题；主账号首次登录会用根库初始化
  自己的独立工作区，从而带上默认题库。
* 若主账号工作区已存在，则同时直接写入该工作区，立即对其生效。
* 其他账号登录时由 ``seed_public_template_questions`` 从主账号工作区继承，
  成为所有登录用户可见的默认题库。

只做插入与按 ``question_hash`` 去重，不修改或删除既有题目。默认播种
``data/open-source-question-bank.json`` 与 ``data/choice-programming-question-bank.json``
（问答题、选择题、编程题）；``--input`` 可重复指定其他题库文件。使用
``--dry-run`` 仅统计将要写入的数量::

    python scripts/seed_open_source_question_bank.py
    python scripts/seed_open_source_question_bank.py --input data/open-source-question-bank.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

DEFAULT_INPUTS = (
    Path("data/open-source-question-bank.json"),
    Path("data/choice-programming-question-bank.json"),
)


def _load_questions(path: Path) -> list[dict]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(payload, list):
        items = payload
    elif isinstance(payload, dict):
        items = payload.get("questions")
    else:
        raise ValueError("JSON 根节点必须是数组或包含 questions 的对象")
    if not isinstance(items, list):
        raise ValueError("JSON 中缺少 questions 数组")
    return [item for item in items if isinstance(item, dict) and str(item.get("question") or "").strip()]


def _collect_targets(data_dir: Path) -> list[Path]:
    """返回要写入的工作区目录：根工作区 + 已存在的主账号工作区。"""

    from auroraagent.accounts.workspaces import seed_targets

    return seed_targets(data_dir)


def main() -> int:
    parser = argparse.ArgumentParser(description="把题库 JSON 播种为默认模板题库")
    parser.add_argument(
        "--input",
        type=Path,
        action="append",
        dest="inputs",
        default=None,
        help="题目 JSON 文件，可重复指定；缺省时播种开源题库与选择题/编程题题库",
    )
    parser.add_argument("--data-dir", type=Path, default=Path("data"), help="AuroraAgent 数据目录")
    parser.add_argument("--dry-run", action="store_true", help="只统计，不写入")
    args = parser.parse_args()

    inputs = args.inputs or [path for path in DEFAULT_INPUTS if path.exists()]
    if not inputs:
        print("没有可读取的题库文件，请用 --input 指定", file=sys.stderr)
        return 2
    try:
        questions = []
        for path in inputs:
            questions.extend(_load_questions(path))
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"读取失败：{exc}", file=sys.stderr)
        return 2
    if not questions:
        print("题目文件里没有可用题目", file=sys.stderr)
        return 2

    from auroraagent.accounts.workspaces import seed_default_questions

    if args.dry_run:
        targets = _collect_targets(args.data_dir)
        print(f"[dry-run] 将向 {len(targets)} 个工作区播种 {len(questions)} 道题：")
        for target in targets:
            print(f"  - {target / 'data.db'}")
        return 0

    try:
        results = seed_default_questions(args.data_dir, questions)
    except (OSError, ValueError) as exc:
        print(f"播种失败：{exc}", file=sys.stderr)
        return 1
    for target, inserted, skipped in results:
        extra = f"，跳过 {skipped}" if skipped is not None else ""
        print(f"{target / 'data.db'}：新增 {inserted}{extra}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
