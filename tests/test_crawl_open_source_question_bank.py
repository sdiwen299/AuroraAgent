"""Regression tests for the open-source question-bank crawler.

The crawler bridges permissively licensed GitHub repositories and AuroraAgent's
``POST /api/questions/import`` endpoint. These tests pin the extraction
boundaries (question-heading detection, section-scoped answers, markdown
cleaning), license allow-listing, cross-repo dedup, path selection, topic
derivation, source configuration, and the 1000-question upload batching — all in
memory, without GitHub or other network access.
"""

from __future__ import annotations

import argparse
import importlib.util
import sys
from pathlib import Path
from typing import Any

import pytest

ROOT = Path(__file__).parents[1]
SCRIPT = ROOT / "scripts" / "crawl_open_source_question_bank.py"


def _load_script() -> Any:
    spec = importlib.util.spec_from_file_location("crawl_open_source_question_bank", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    # dataclass 装饰器需要模块已注册到 sys.modules。
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_license_allowlist_rejects_unknown_and_absent() -> None:
    module = _load_script()
    assert module._license_allowed("MIT") is True
    assert module._license_allowed("Apache-2.0") is True
    assert module._license_allowed("CC-BY-SA-4.0") is True
    assert module._license_allowed("GPL-3.0") is False
    assert module._license_allowed("NOASSERTION") is False
    assert module._license_allowed(None) is False
    assert module._license_allowed("") is False


def test_is_question_accepts_question_marks_and_numbered_level_two() -> None:
    module = _load_script()
    assert module._is_question("什么是 CAP 定理？", 2) is True
    assert module._is_question("What is a pointer?", 3) is True
    assert module._is_question("1、进程和线程的区别", 2) is True
    assert module._is_question("2.2、补充另一种问法", 2) is True
    # 编号只在一级标题（八股题）成立，二级以下的小节不算题目，避免把答案要点当题目。
    assert module._is_question("1、首次适应算法", 3) is False
    assert module._is_question("面试官心理分析", 2) is False


def test_clean_question_strips_markup_and_numbering() -> None:
    module = _load_script()
    assert module._clean_question("**1. 什么是 `HashMap`？**") == "什么是 HashMap？"
    assert module._clean_question("3、[进程](a.md)和线程") == "进程和线程"


def test_extract_qa_scopes_answer_to_next_same_or_higher_heading() -> None:
    module = _load_script()
    body = (
        "# 文档标题\n\n"
        "## 1、进程和线程的区别？\n\n"
        "### 进程\n\n进程是资源分配的最小单位。\n\n"
        "### 线程\n\n线程是调度的最小单位。\n\n"
        "## 2、协程了解吗？\n\n协程是用户态轻量级线程，调度开销远小于线程。\n"
    )
    records = module._extract_qa(body, "https://example.com/a.md", "os", "开源题库", "InterviewGuide")
    assert [item["question"] for item in records] == [
        "进程和线程的区别？",
        "协程了解吗？",
    ]
    first = records[0]["reference_answer"]
    assert "进程是资源分配的最小单位" in first
    assert "线程是调度的最小单位" in first
    assert "协程是用户态轻量线程" not in first
    assert records[0]["tags"] == ["InterviewGuide", "os"]
    assert records[0]["difficulty"] in {"easy", "medium", "hard"}


def test_extract_qa_recognizes_bold_and_list_questions() -> None:
    module = _load_script()
    body = (
        "**How does TCP work?**\n\n"
        "It establishes a connection with a three-way handshake before sending data.\n\n"
        "- 什么是死锁？\n\n"
        "死锁是多个进程互相等待对方持有的资源而无法继续执行的状态。\n\n"
        "1、进程调度算法有哪些？\n\n"
        "常见调度算法包括先来先服务、短作业优先和时间片轮转。\n"
    )
    records = module._extract_qa(body, "u", "网络", "开源题库", "l")
    questions = [item["question"] for item in records]
    assert "How does TCP work?" in questions
    assert "什么是死锁？" in questions
    assert "进程调度算法有哪些？" in questions
    assert all(len(item["reference_answer"]) >= module.MIN_ANSWER_LENGTH for item in records)


def test_clean_answer_drops_link_only_lines_and_navigation_noise() -> None:
    module = _load_script()
    body = (
        "## 什么是索引？\n\n"
        "[回到顶部](#top)\n\n"
        "索引是一种加速数据检索的数据结构，常见实现是 B+ 树。\n\n"
        "[参考链接](https://example.com)\n"
    )
    records = module._extract_qa(body, "u", "数据库", "开源题库", "l")
    assert len(records) == 1
    answer = records[0]["reference_answer"]
    assert "B+ 树" in answer
    assert "回到顶部" not in answer
    assert "参考链接" not in answer


def test_answer_is_usable_rejects_link_only_and_empty() -> None:
    module = _load_script()
    assert module._answer_is_usable("[只有链接](https://example.com)") is False
    assert module._answer_is_usable("短答案") is False
    assert module._answer_is_usable("这是一个足够长且包含正文的参考答案内容。") is True


def test_infer_difficulty_and_category() -> None:
    module = _load_script()
    assert module._infer_difficulty("什么是 JVM？", "短答案" * 2) == "easy"
    assert module._infer_difficulty("请设计一个秒杀系统。", "中等长度答案" * 5) == "hard"
    assert module._infer_category("Redis 的持久化机制", module.DEFAULT_CATEGORY) == "数据库"
    assert module._infer_category("TCP 三次握手", module.DEFAULT_CATEGORY) == "计算机网络"
    assert module._infer_category("毫不相关的题目", module.DEFAULT_CATEGORY) == module.DEFAULT_CATEGORY
    assert module._infer_category("毫不相关的题目", module.DEFAULT_CATEGORY, "ai") == "人工智能"
    assert module._infer_category("毫不相关的题目", module.DEFAULT_CATEGORY, "os") == "操作系统"


def test_extract_qa_drops_questions_without_answers() -> None:
    module = _load_script()
    body = "## 有答案的问题？\n\n这里给出足够长的参考答案内容。\n\n## 没有答案的问题？\n"
    records = module._extract_qa(body, "u", "t", "c", "l")
    assert [item["question"] for item in records] == ["有答案的问题？"]


def test_normalize_deduplicates_across_repositories() -> None:
    module = _load_script()
    raw = [
        {"question": "什么是事务？", "reference_answer": "A" * 20, "tags": ["x"]},
        {"question": "什么是 事务？", "reference_answer": "B" * 20, "tags": ["y"]},
        {"question": "什么是索引？", "reference_answer": "C" * 20},
    ]
    normalized, duplicates = module._normalize(raw)
    assert duplicates == 1
    assert [item["question"] for item in normalized] == ["什么是事务？", "什么是索引？"]
    assert normalized[0]["category"] == module.DEFAULT_CATEGORY


def test_select_paths_filters_includes_excludes_and_sorts_interview_first() -> None:
    module = _load_script()
    paths = [
        "docs/ai/interview-questions/agent.md",
        "docs/ai/readme.md",
        "docs/ai/sidebar.md",
        "docs/guide/network.md",
        "src/app.py",
        "README.md",
    ]
    selected = module._select_paths(paths, ("docs/",))
    assert selected == [
        "docs/ai/interview-questions/agent.md",
        "docs/guide/network.md",
    ]


def test_topic_for_path_uses_segment_or_label() -> None:
    module = _load_script()
    assert module._topic_for_path("docs/ai/interview.md", ("docs/",), "JavaGuide") == "ai"
    assert module._topic_for_path("docs/notes/os.md", ("docs/notes/",), "InterviewGuide") == "InterviewGuide"


def _parse_args(**overrides: Any) -> argparse.Namespace:
    values: dict[str, Any] = {
        "repo": None,
        "source": None,
        "no_default_sources": False,
    }
    values.update(overrides)
    return argparse.Namespace(**values)


def test_parse_sources_filters_selected_builtin() -> None:
    module = _load_script()
    sources = module._parse_sources(_parse_args(source=["JavaGuide"]))
    assert [source.label for source in sources] == ["JavaGuide"]
    with pytest.raises(ValueError):
        module._parse_sources(_parse_args(source=["missing-source"]))


def test_parse_sources_appends_custom_repos_and_can_drop_defaults() -> None:
    module = _load_script()
    sources = module._parse_sources(
        _parse_args(no_default_sources=True, repo=["https://github.com/Snailclimb/JavaGuide.git"])
    )
    assert len(sources) == 1
    assert sources[0].repo == "Snailclimb/JavaGuide"
    assert sources[0].includes == ("docs/",)
    with pytest.raises(ValueError):
        module._parse_sources(_parse_args(no_default_sources=True, repo=["not-a-repo"]))


def test_upload_batches_by_max_batch_and_sends_token(monkeypatch: pytest.MonkeyPatch) -> None:
    module = _load_script()
    calls: list[dict[str, Any]] = []

    def fake_post_json(
        api_base: str, path: str, payload: dict[str, Any], token: str
    ) -> dict[str, Any]:
        calls.append({"api_base": api_base, "path": path, "token": token, "size": len(payload["questions"])})
        return {"count": len(payload["questions"]), "skipped": 0}

    monkeypatch.setattr(module, "_post_json", fake_post_json)
    questions = [{"question": f"题目 {index}", "tags": []} for index in range(module.MAX_BATCH + 1)]
    saved, skipped = module._upload("http://127.0.0.1:8080", "secret", questions)

    assert [call["size"] for call in calls] == [module.MAX_BATCH, 1]
    assert calls[0]["path"] == "/api/questions/import"
    assert calls[0]["token"] == "secret"
    assert (saved, skipped) == (module.MAX_BATCH + 1, 0)
