#!/usr/bin/env python3
"""从开源仓库抓取面试题库并导入 AuroraAgent 模板题库。

脚本内置一组 Apache-2.0 / MIT / CC-BY 等宽松许可的开源面试题库仓库，读取其
Markdown 文档中「以问号结尾的小节标题」「整行加粗的问题」和「列表项问题」作为
题目、其后的正文作为参考答案，归一化为 AuroraAgent 模板题目后输出可移植 JSON，
并可选通过本地 ``POST /api/questions/import`` 写入。抽取时按关键词归类、按篇幅
判难度，并剔除纯链接/导航噪声的答案。

导入位置决定可见范围：以主账号的登录令牌调用导入接口时，题目落在主账号工作区，
其他账号登录后会由 ``seed_public_template_questions`` 自动继承，因此成为所有
登录用户可见的默认题库。要让脚本写入主账号工作区，请传入该账号的令牌::

    python scripts/crawl_open_source_question_bank.py \
        --api-base http://127.0.0.1:8080 \
        --token "$AURORA_API_TOKEN"

只生成本地 JSON，不上传::

    python scripts/crawl_open_source_question_bank.py --skip-api

追加自定义仓库（可重复，扫描其 ``docs/`` 目录）::

    python scripts/crawl_open_source_question_bank.py \
        --repo Snailclimb/JavaGuide --org-only

只抓取指定内置来源::

    python scripts/crawl_open_source_question_bank.py --source JavaGuide

无需运行中的服务时，可直接把题目播种进数据目录的默认题库（根工作区 + 已存在的
主账号工作区；其他账号登录后自动继承）::

    python scripts/crawl_open_source_question_bank.py --skip-api --seed-data-dir data

脚本只读取公开仓库内容，不写入被爬取仓库；只接受 SPDX 许可在白名单内的仓库，
许可不明的来源会被跳过。设置 ``GITHUB_TOKEN`` 可提高 GitHub API 速率上限。
"""

from __future__ import annotations

import argparse
import base64
import binascii
import json
import os
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

MAX_BATCH = 1000  # /api/questions/import 单次最多 1000 道。
DEFAULT_MAX_QUESTIONS = 800
DEFAULT_MAX_FILES_PER_REPO = 25
MIN_QUESTION_LENGTH = 6
MIN_ANSWER_LENGTH = 15
DEFAULT_CATEGORY = "开源题库"
DEFAULT_OUTPUT = Path("data/open-source-question-bank.json")

API_HOSTS = {"api.github.com", "raw.githubusercontent.com"}

# 只接受这些 SPDX 许可；不确定或缺失的仓库会被跳过，避免把来源不明的题库引入产品。
ALLOWED_LICENSES = {
    "MIT",
    "Apache-2.0",
    "BSD-2-Clause",
    "BSD-3-Clause",
    "ISC",
    "MPL-2.0",
    "CC0-1.0",
    "CC-BY-4.0",
    "CC-BY-SA-4.0",
    "Unlicense",
}

# 文档目录里与题目无关的路径/文件名片段，命中即跳过。
_EXCLUDED_PATH_FRAGMENTS = (
    "about-the-author",
    "about-the-repo",
    "sidebar",
    "summary",
    "index.md",
    "readme.md",
    "_category_",
    "_courses",
    "code-of-conduct",
    "contributing",
    "changelog",
    "license",
    "template",
)


@dataclass(frozen=True)
class Source:
    label: str
    repo: str
    includes: tuple[str, ...]
    category: str = DEFAULT_CATEGORY


DEFAULT_SOURCES: tuple[Source, ...] = (
    Source(label="JavaGuide", repo="Snailclimb/JavaGuide", includes=("docs/",)),
    Source(
        label="InterviewGuide",
        repo="forthespada/InterviewGuide",
        includes=("docs/notes/03-hunting_job/02-interview/",),
    ),
    Source(
        label="Tech Interview Handbook",
        repo="yangshun/tech-interview-handbook",
        includes=("apps/website/contents/",),
    ),
    Source(label="advanced-java", repo="doocs/advanced-java", includes=("docs/",)),
    Source(
        label="Front-end Interview Questions",
        repo="h5bp/Front-end-Developer-Interview-Questions",
        includes=("src/questions/",),
    ),
)

_HEADING_RE = re.compile(r"(?m)^(#{2,4})[ \t]+(.+?)[ \t]*#*[ \t]*$")
_NUMBERED_QUESTION_RE = re.compile(r"^\d+(?:\.\d+)*[、.．]")
# 整行加粗的问题（英文 README 常见：``**How does X work?**``）。
_BOLD_QUESTION_RE = re.compile(r"(?m)^[ \t]*\*\*[ \t]*(.+?[?？])[ \t]*\*\*[ \t]*$")
# 列表项形式的问题（``- 什么是 X？`` 或 ``1、什么是 X？``）。
_LIST_QUESTION_RE = re.compile(
    r"(?m)^[ \t]*(?:[-*+][ \t]+|\d+(?:\.\d+)*[.、)][ \t]*)(.+?[?？])[ \t]*$"
)
_INLINE_MARKUP_RE = re.compile(r"(\*\*|__|\*|_|`)")
_LINK_RE = re.compile(r"\[([^\]]+)\]\([^)]*\)")
_IMAGE_RE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
_LINK_ONLY_LINE_RE = re.compile(r"^[ \t]*(?:[-*+][ \t]+)?\[[^\]]*\]\([^)]*\)[ \t]*$")
_NAV_NOISE_RE = re.compile(
    r"(回到顶部|返回顶部|返回目录|阅读原文|back to top|table of contents)", re.IGNORECASE
)
_HAS_CONTENT_RE = re.compile(r"[\w\u4e00-\u9fff]")

# 命中即判为困难题，避免所有题目都停留在 medium。
_HARD_KEYWORDS = ("设计", "架构", "实现原理", "源码", "底层", "如何实现")

# 兜底分类：按关键词把题目归入常见主题，避免全部堆在「开源题库」。
_CATEGORY_KEYWORDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("前端", ("javascript", "typescript", "react", "vue", "css", "html", "浏览器", "dom", "前端", "webpack")),
    ("数据库", ("数据库", "mysql", "redis", "mongodb", "elasticsearch", "索引", "事务", "sql", "分库分表")),
    ("计算机网络", ("网络", "http", "https", "tcp", "udp", "dns", "网络协议", "三次握手", "四次挥手")),
    ("操作系统", ("操作系统", "进程", "线程", "死锁", "内存管理", "linux", "内核", "协程")),
    ("数据结构与算法", ("算法", "数据结构", "排序", "链表", "二叉树", "动态规划", "哈希表", "堆", "leetcode")),
    ("人工智能", ("人工智能", "机器学习", "深度学习", "大模型", "神经网络", "llm", "transformer")),
    ("后端", ("java", "spring", "jvm", "gc", "并发", "分布式", "微服务", "消息队列", "缓存", "后端", "golang", "c++", "python")),
)

# 目录名（topic）到分类的映射，补足关键词命不中的英文目录。
_TOPIC_CATEGORY: dict[str, str] = {
    "ai": "人工智能",
    "artificial intelligence": "人工智能",
    "machine learning": "人工智能",
    "os": "操作系统",
    "operating system": "操作系统",
    "network": "计算机网络",
    "networking": "计算机网络",
    "database": "数据库",
    "db": "数据库",
    "frontend": "前端",
    "front end": "前端",
    "web": "前端",
    "backend": "后端",
    "java": "后端",
    "jvm": "后端",
    "spring": "后端",
    "algorithm": "数据结构与算法",
    "algorithms": "数据结构与算法",
    "data structure": "数据结构与算法",
    "data structures": "数据结构与算法",
    "system design": "后端",
}


def _github_token() -> str:
    return os.environ.get("GITHUB_TOKEN", "").strip()


def _fetch(url: str, timeout: float = 20.0) -> str:
    from urllib.parse import urlparse

    host = (urlparse(url).hostname or "").lower()
    if host not in API_HOSTS:
        raise ValueError(f"拒绝访问非允许域名: {host}")
    headers = {
        "User-Agent": "AuroraAgent-open-source-crawler/1.0",
        "Accept": "application/vnd.github+json",
    }
    token = _github_token()
    if token and host == "api.github.com":
        headers["Authorization"] = f"Bearer {token}"
    request = Request(url, headers=headers)
    try:
        with urlopen(request, timeout=timeout) as response:  # noqa: S310 - host allow-listed
            return response.read().decode("utf-8", errors="replace")
    except HTTPError as exc:
        raise ValueError(f"GitHub 返回 {exc.code}: {url}") from exc
    except URLError as exc:
        raise ValueError(f"无法访问 {url}: {exc.reason}") from exc


def _fetch_json(url: str, timeout: float = 20.0) -> Any:
    body = _fetch(url, timeout=timeout)
    try:
        return json.loads(body)
    except json.JSONDecodeError as exc:
        raise ValueError(f"接口返回的不是 JSON: {url}") from exc


def _repo_parts(value: str) -> tuple[str, str] | None:
    text = value.strip().removesuffix(".git")
    if text.startswith("https://github.com/"):
        text = text[len("https://github.com/") :]
    parts = [part for part in text.split("/") if part]
    if len(parts) < 2:
        return None
    return parts[0], parts[1]


def _license_allowed(spdx_id: str | None) -> bool:
    if not spdx_id or spdx_id == "NOASSERTION":
        return False
    return spdx_id in ALLOWED_LICENSES


def _repo_metadata(owner: str, repo: str) -> dict[str, Any]:
    payload = _fetch_json(f"https://api.github.com/repos/{owner}/{repo}")
    if not isinstance(payload, dict):
        raise ValueError(f"仓库元数据格式无效: {owner}/{repo}")
    return payload


def _select_paths(paths: list[str], includes: tuple[str, ...]) -> list[str]:
    selected: list[str] = []
    for path in paths:
        lowered = path.lower()
        if not lowered.endswith(".md"):
            continue
        if includes and not any(path.startswith(prefix) for prefix in includes):
            continue
        if any(fragment in lowered for fragment in _EXCLUDED_PATH_FRAGMENTS):
            continue
        selected.append(path)
    # 文件名含 interview / question 的优先，更可能是题库。
    selected.sort(key=lambda path: (0 if re.search(r"interview|question|面试", path, re.I) else 1, path))
    return selected


def _list_markdown_paths(owner: str, repo: str, branch: str, includes: tuple[str, ...]) -> list[str]:
    tree = _fetch_json(
        f"https://api.github.com/repos/{owner}/{repo}/git/trees/{quote(branch, safe='')}?recursive=1"
    )
    if not isinstance(tree, dict) or not isinstance(tree.get("tree"), list):
        raise ValueError(f"仓库目录读取失败: {owner}/{repo}")
    paths = [
        item["path"]
        for item in tree["tree"]
        if isinstance(item, dict)
        and item.get("type") == "blob"
        and isinstance(item.get("path"), str)
    ]
    return _select_paths(paths, includes)


def _fetch_file(owner: str, repo: str, path: str, branch: str) -> str:
    url = (
        f"https://api.github.com/repos/{owner}/{repo}/contents/{quote(path, safe='/')}"
        f"?ref={quote(branch, safe='')}"
    )
    payload = _fetch_json(url)
    if not isinstance(payload, dict) or payload.get("encoding") != "base64":
        raise ValueError(f"文件内容格式无效: {owner}/{repo}/{path}")
    try:
        return base64.b64decode(payload.get("content") or "").decode("utf-8", errors="replace")
    except (binascii.Error, ValueError) as exc:
        raise ValueError(f"文件内容解码失败: {owner}/{repo}/{path}") from exc


def _is_question(raw_heading: str, level: int) -> bool:
    """问号结尾的标题，或二级标题里「数字、」编号的八股题，都算题目。"""

    text = raw_heading.strip()
    if text.endswith(("?", "？")):
        return True
    return level == 2 and bool(_NUMBERED_QUESTION_RE.match(text))


def _clean_question(text: str) -> str:
    text = _IMAGE_RE.sub("", text)
    text = _LINK_RE.sub(r"\1", text)
    text = _INLINE_MARKUP_RE.sub("", text)
    text = re.sub(r"^\s*\d+[.、)\]]\s*", "", text)
    return text.strip()


def _question_marks(body: str) -> list[tuple[int, int, str, int | None]]:
    """收集「疑似题目」的位置。

    返回 ``(start, end, raw_text, level)``：标题题为 ``level=标题层级``，行内题
    （整行加粗或列表项）为 ``level=None``。重叠的匹配只保留先出现的一个。
    """

    marks: list[tuple[int, int, str, int | None]] = []
    for match in _HEADING_RE.finditer(body):
        level = len(match.group(1))
        if _is_question(match.group(2), level):
            marks.append((match.start(), match.end(), match.group(2), level))
    for match in _BOLD_QUESTION_RE.finditer(body):
        marks.append((match.start(), match.end(), match.group(1), None))
    for match in _LIST_QUESTION_RE.finditer(body):
        marks.append((match.start(), match.end(), match.group(1), None))
    marks.sort(key=lambda item: item[0])
    deduped: list[tuple[int, int, str, int | None]] = []
    for mark in marks:
        if deduped and mark[0] < deduped[-1][1]:
            continue
        deduped.append(mark)
    return deduped


def _answer_bounds(
    mark: tuple[int, int, str, int | None],
    marks: list[tuple[int, int, str, int | None]],
    index: int,
    body_length: int,
) -> int:
    level = mark[3]
    if level is None:
        return marks[index + 1][0] if index + 1 < len(marks) else body_length
    for later in marks[index + 1 :]:
        if later[3] is not None and later[3] <= level:
            return later[0]
    return body_length


def _clean_answer(text: str) -> str:
    """去掉纯链接行、导航噪声，压缩空行，得到可读的参考答案。"""

    lines: list[str] = []
    for raw in text.splitlines():
        if _LINK_ONLY_LINE_RE.match(raw):
            continue
        if _NAV_NOISE_RE.search(raw) and len(_INLINE_MARKUP_RE.sub("", raw).strip()) < 40:
            continue
        lines.append(raw.rstrip())
    cleaned = _IMAGE_RE.sub("", "\n".join(lines))
    return re.sub(r"\n{3,}", "\n\n", cleaned).strip()


def _answer_is_usable(answer: str) -> bool:
    if len(answer) < MIN_ANSWER_LENGTH:
        return False
    plain = _LINK_RE.sub(lambda match: match.group(1), answer)
    plain = _INLINE_MARKUP_RE.sub("", plain)
    return bool(_HAS_CONTENT_RE.search(plain)) and len(plain.strip()) >= MIN_ANSWER_LENGTH // 2


def _infer_difficulty(question: str, answer: str) -> str:
    if len(answer) >= 800 or any(keyword in question for keyword in _HARD_KEYWORDS):
        return "hard"
    if len(answer) <= 140:
        return "easy"
    return "medium"


def _infer_category(text: str, fallback: str, topic: str = "") -> str:
    lowered = text.casefold()
    for category_name, keywords in _CATEGORY_KEYWORDS:
        if any(keyword in lowered for keyword in keywords):
            return category_name
    return _TOPIC_CATEGORY.get(topic.strip().casefold(), fallback)


def _extract_qa(body: str, source_url: str, topic: str, category: str, label: str) -> list[dict[str, Any]]:
    """把 Markdown 中的问答对抽成记录。

    识别两类题目：问号结尾的 2~4 级标题（答案取到下一个层级不高于本题的标题），
    以及整行加粗 / 列表项形式的问题（答案取到下一处疑似题目）。答案统一经过去噪声
    处理，并按关键词归类、按篇幅判难度。
    """

    marks = _question_marks(body)
    records: list[dict[str, Any]] = []
    for index, mark in enumerate(marks):
        question = _clean_question(mark[2])
        if len(question) < MIN_QUESTION_LENGTH:
            continue
        answer = _clean_answer(body[mark[1] : _answer_bounds(mark, marks, index, len(body))])
        if not _answer_is_usable(answer):
            continue
        records.append(
            {
                "topic": topic,
                "category": _infer_category(f"{topic} {question}", category, topic),
                "difficulty": _infer_difficulty(question, answer),
                "question": question,
                "reference_answer": answer,
                "tags": [label, topic],
                "source_url": source_url,
            }
        )
    return records


def _topic_for_path(path: str, includes: tuple[str, ...], label: str) -> str:
    relative = path
    for prefix in includes:
        if path.startswith(prefix):
            relative = path[len(prefix) :]
            break
    segment = relative.split("/", 1)[0]
    if segment and "." not in segment:
        return segment.replace("-", " ").strip()
    return label


def _normalize(records: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    normalized: list[dict[str, Any]] = []
    seen: set[str] = set()
    duplicates = 0
    for item in records:
        question = str(item.get("question") or "").strip()
        if len(question) < MIN_QUESTION_LENGTH:
            continue
        key = re.sub(r"\s+", "", question).casefold()
        if key in seen:
            duplicates += 1
            continue
        seen.add(key)
        normalized.append(
            {
                "topic": str(item.get("topic") or "").strip(),
                "category": str(item.get("category") or DEFAULT_CATEGORY).strip(),
                "difficulty": str(item.get("difficulty") or "medium"),
                "question": question,
                "reference_answer": str(item.get("reference_answer") or "").strip(),
                "tags": [str(tag) for tag in (item.get("tags") or []) if str(tag).strip()],
            }
        )
    return normalized, duplicates


def _crawl_source(
    source: Source,
    max_files: int,
    delay: float,
) -> tuple[list[dict[str, Any]], str | None]:
    parts = _repo_parts(source.repo)
    if parts is None:
        raise ValueError(f"无效仓库: {source.repo}")
    owner, repo = parts
    metadata = _repo_metadata(owner, repo)
    license_info = metadata.get("license")
    spdx_id = license_info.get("spdx_id") if isinstance(license_info, dict) else None
    if not _license_allowed(spdx_id):
        print(
            f"跳过 {source.repo}：SPDX 许可 {spdx_id or '未知'} 不在白名单内",
            file=sys.stderr,
        )
        return [], None
    branch = str(metadata.get("default_branch") or "main")
    paths = _list_markdown_paths(owner, repo, branch, source.includes)
    origin = f"https://github.com/{owner}/{repo}"
    records: list[dict[str, Any]] = []
    for path in paths[: max(1, max_files)]:
        page = _fetch_file(owner, repo, path, branch)
        topic = _topic_for_path(path, source.includes, source.label)
        source_url = f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}"
        records.extend(
            _extract_qa(page, source_url, topic, source.category, source.label)
        )
        if delay > 0:
            time.sleep(delay)
    return records, origin


def _post_json(api_base: str, path: str, payload: dict[str, Any], token: str) -> dict[str, Any]:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = Request(
        api_base.rstrip("/") + path,
        data=body,
        headers=headers,
        method="POST",
    )
    with urlopen(request, timeout=30) as response:  # noqa: S310 - local API is operator supplied
        return json.loads(response.read().decode("utf-8"))


def _upload(
    api_base: str, token: str, questions: list[dict[str, Any]]
) -> tuple[int, int]:
    saved = 0
    skipped = 0
    for start in range(0, len(questions), MAX_BATCH):
        batch = questions[start : start + MAX_BATCH]
        payload = _post_json(
            api_base,
            "/api/questions/import",
            {"source_type": "template", "questions": batch},
            token,
        )
        saved += int(payload.get("count") or 0)
        skipped += int(payload.get("skipped") or 0)
    return saved, skipped


def _parse_sources(args: argparse.Namespace) -> list[Source]:
    sources = list(DEFAULT_SOURCES)
    selected = {value.strip() for value in (args.source or []) if value.strip()}
    if selected:
        sources = [
            source
            for source in sources
            if source.label in selected or source.repo in selected
        ]
        if not sources:
            raise ValueError(f"没有匹配的内置来源: {', '.join(sorted(selected))}")
    if args.no_default_sources:
        sources = []
    for raw in args.repo or []:
        parts = _repo_parts(raw)
        if parts is None:
            raise ValueError(f"--repo 需要 owner/name 或 GitHub 地址: {raw}")
        sources.append(
            Source(label=parts[1], repo=f"{parts[0]}/{parts[1]}", includes=("docs/",))
        )
    return sources


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
        except (ValueError, OSError):
            pass

    parser = argparse.ArgumentParser(description="抓取开源面试题库并导入 AuroraAgent 模板题库")
    parser.add_argument("--repo", action="append", help="追加 GitHub 仓库 owner/name，可重复")
    parser.add_argument("--source", action="append", help="只抓取指定内置来源标签，可重复")
    parser.add_argument("--no-default-sources", action="store_true", help="不用内置来源，只用 --repo")
    parser.add_argument("--max-files-per-repo", type=int, default=DEFAULT_MAX_FILES_PER_REPO)
    parser.add_argument("--max-questions", type=int, default=DEFAULT_MAX_QUESTIONS)
    parser.add_argument("--delay", type=float, default=0.3, help="每个文件之间的请求间隔秒数")
    parser.add_argument("--category", default="", help="覆盖题库分类（默认 开源题库）")
    parser.add_argument("--output-json", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--seed-data-dir",
        type=Path,
        default=None,
        help="生成后直接把题目播种到该数据目录的默认题库（根 + 主账号工作区），无需运行中的服务",
    )
    parser.add_argument("--api-base", default=os.environ.get("AURORA_API_BASE", ""))
    parser.add_argument("--token", default=os.environ.get("AURORA_API_TOKEN", ""))
    parser.add_argument("--skip-api", action="store_true", help="只生成 JSON，不调用本地 API")
    args = parser.parse_args()

    try:
        sources = _parse_sources(args)
        if not sources:
            raise ValueError("没有可抓取的来源；请使用内置来源或 --repo 指定仓库")
        all_records: list[dict[str, Any]] = []
        origins: list[str] = []
        for source in sources:
            records, origin = _crawl_source(
                source,
                max_files=max(1, args.max_files_per_repo),
                delay=max(0.0, args.delay),
            )
            if origin:
                origins.append(origin)
            print(f"{source.label}: 抽取 {len(records)} 道题")
            all_records.extend(records)
            if len(all_records) >= args.max_questions:
                print(f"已达上限 {args.max_questions} 道，停止抓取更多仓库", file=sys.stderr)
                break

        questions, duplicates = _normalize(all_records)
        if args.category:
            for question in questions:
                question["category"] = args.category
        if not questions:
            raise ValueError("没有抽取到题目；请检查来源仓库结构或放宽过滤条件")
        questions = questions[: max(1, args.max_questions)]
        origin_url = ";".join(dict.fromkeys(origins)) or "open-source"
        payload = {
            "source_type": "template",
            "origin_url": origin_url,
            "questions": questions,
        }
        args.output_json.parent.mkdir(parents=True, exist_ok=True)
        args.output_json.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(f"规范化 {len(questions)} 道题（跨仓库重复 {duplicates} 道）→ {args.output_json}")

        if args.seed_data_dir is not None:
            from auroraagent.accounts.workspaces import seed_default_questions

            for target, inserted, skipped in seed_default_questions(args.seed_data_dir, questions):
                extra = f"，跳过 {skipped}" if skipped is not None else ""
                print(f"默认题库播种 {target / 'data.db'}：新增 {inserted}{extra}")

        if args.skip_api or not args.api_base:
            if not args.skip_api and not args.api_base:
                print(
                    "未提供 --api-base，跳过上传；可加 --api-base http://127.0.0.1:8080 重跑",
                    file=sys.stderr,
                )
            return 0
        if not args.token:
            print(
                "警告：未提供 --token，导入可能被账号鉴权拒绝；"
                "请使用主账号令牌以便其他用户继承默认题库",
                file=sys.stderr,
            )
        saved, skipped = _upload(args.api_base, args.token, questions)
        print(f"题库导入：新增 {saved}，跳过 {skipped}")
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"抓取失败：{exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
