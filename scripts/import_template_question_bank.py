#!/usr/bin/env python3
"""Import an authorised question-bank export into AuroraAgent.

The script accepts JSON or HTML saved from a site where the operator has access.
It can also fetch a bounded set of same-site pages with a cookie supplied through
``MIANSHIYA_COOKIE``. It does not solve challenges, bypass access controls, or
print the cookie. The fetched content is normalized into a portable JSON file and
Markdown knowledge source before optional local API upload.
"""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import sys
import time
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen


DEFAULT_URL = "https://www.mianshiya.com/exam/banks"
ALLOWED_HOSTS = {"mianshiya.com", "www.mianshiya.com"}
GITHUB_HOSTS = {"github.com", "api.github.com", "raw.githubusercontent.com"}
MAX_RECORDS = 1000


@dataclass(frozen=True)
class RawPage:
    url: str
    body: str


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.text_parts: list[str] = []
        self.script_parts: list[str] = []
        self.links: list[str] = []
        self._in_text = False
        self._in_script = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_map = dict(attrs)
        if tag in {"h1", "h2", "h3", "h4", "h5", "h6", "li"}:
            self._in_text = True
        if tag == "script":
            self._in_script = True
        href = attrs_map.get("href")
        if href:
            self.links.append(href)

    def handle_endtag(self, tag: str) -> None:
        if tag in {"h1", "h2", "h3", "h4", "h5", "h6", "li"}:
            self._in_text = False
        if tag == "script":
            self._in_script = False

    def handle_data(self, data: str) -> None:
        if self._in_text and data.strip():
            self.text_parts.append(data.strip())
        if self._in_script:
            self.script_parts.append(data)


def _host_allowed(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return host in ALLOWED_HOSTS or host in GITHUB_HOSTS


def _fetch(url: str, cookie: str, timeout: float = 20.0) -> RawPage:
    if not _host_allowed(url):
        raise ValueError(f"拒绝访问非允许域名: {urlparse(url).hostname or ''}")
    headers = {"User-Agent": "AuroraAgent-template-import/1.0"}
    if cookie:
        headers["Cookie"] = cookie
    request = Request(url, headers=headers)
    with urlopen(request, timeout=timeout) as response:  # noqa: S310 - host is allow-listed
        charset = response.headers.get_content_charset() or "utf-8"
        return RawPage(url=url, body=response.read().decode(charset, errors="replace"))


def _fetch_json(url: str) -> Any:
    page = _fetch(url, "")
    try:
        return json.loads(page.body)
    except json.JSONDecodeError as exc:
        raise ValueError(f"公开仓库接口返回的不是 JSON: {url}") from exc


def _walk_json(value: Any) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    if isinstance(value, dict):
        keys = {str(key).lower() for key in value}
        question_key = next((key for key in ("question", "stem", "prompt") if key in keys), None)
        if question_key:
            original_key = next(key for key in value if str(key).lower() == question_key)
            question = value.get(original_key)
            if isinstance(question, str) and len(question.strip()) >= 6:
                found.append(value)
        for child in value.values():
            found.extend(_walk_json(child))
    elif isinstance(value, list):
        for child in value:
            found.extend(_walk_json(child))
    return found


def _embedded_json(parser: PageParser) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for script in parser.script_parts:
        content = script.strip()
        if not content or not content.startswith(("{", "[")):
            continue
        try:
            records.extend(_walk_json(json.loads(content)))
        except json.JSONDecodeError:
            continue
    return records


def _embedded_records(page: RawPage) -> list[dict[str, Any]]:
    parser = PageParser()
    parser.feed(page.body)
    return _embedded_json(parser)


def _first(value: dict[str, Any], names: tuple[str, ...], default: str = "") -> str:
    lowered = {str(key).lower(): item for key, item in value.items()}
    for name in names:
        item = lowered.get(name)
        if isinstance(item, str) and item.strip():
            return item.strip()
    return default


def _difficulty(value: str) -> str:
    value = value.lower().strip()
    if value in {"easy", "简单", "基础"}:
        return "easy"
    if value in {"hard", "困难", "高级"}:
        return "hard"
    return "medium"


def _normalize(records: list[dict[str, Any]], source_url: str) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in records:
        question = _first(item, ("question", "stem", "prompt", "title"))
        if len(question) < 6:
            continue
        key = re.sub(r"\s+", "", question).casefold()
        if key in seen:
            continue
        seen.add(key)
        tags_value = item.get("tags") or item.get("tag") or []
        if isinstance(tags_value, str):
            tags = [part.strip() for part in re.split(r"[,，、]", tags_value) if part.strip()]
        elif isinstance(tags_value, list):
            tags = [str(part).strip() for part in tags_value if str(part).strip()]
        else:
            tags = []
        normalized.append(
            {
                "topic": _first(item, ("topic", "subject", "bank")),
                "category": _first(item, ("category", "type", "section"), "面试题"),
                "difficulty": _difficulty(_first(item, ("difficulty", "level"))),
                "question": question,
                "reference_answer": _first(
                    item, ("reference_answer", "answer", "analysis", "solution", "explanation")
                ),
                "tags": tags,
                "source_url": _first(item, ("url", "source_url"), source_url),
            }
        )
        if len(normalized) >= MAX_RECORDS:
            break
    return normalized


def _parse_page(page: RawPage) -> tuple[list[dict[str, Any]], list[str]]:
    parser = PageParser()
    parser.feed(page.body)
    records = _embedded_json(parser)
    if not records:
        records = [{"question": text} for text in parser.text_parts if len(text) >= 8]
    return records, [urljoin(page.url, href) for href in parser.links]


def _question_links(page: RawPage) -> list[str]:
    parser = PageParser()
    parser.feed(page.body)
    return list(dict.fromkeys(
        urljoin(page.url, href)
        for href in parser.links
        if _host_allowed(urljoin(page.url, href))
        and "/question/" in urlparse(urljoin(page.url, href)).path
    ))


def _question_record(page: RawPage, bank_title: str) -> dict[str, Any] | None:
    pattern = re.compile(
        r"<script\b[^>]*type=[\"']application/ld\+json[\"'][^>]*>(.*?)</script>",
        re.IGNORECASE | re.DOTALL,
    )
    for match in pattern.finditer(page.body):
        try:
            payload = json.loads(html.unescape(match.group(1).strip()))
        except json.JSONDecodeError:
            continue
        records = payload if isinstance(payload, list) else [payload]
        for record in records:
            if not isinstance(record, dict):
                continue
            graph = record.get("@graph")
            candidates = graph if isinstance(graph, list) else [record]
            for candidate in candidates:
                if not isinstance(candidate, dict):
                    continue
                record_type = candidate.get("@type")
                types = record_type if isinstance(record_type, list) else [record_type]
                if "Question" not in types or not isinstance(candidate.get("name"), str):
                    continue
                answer = candidate.get("acceptedAnswer")
                answer_text = answer.get("text", "") if isinstance(answer, dict) else ""
                return {
                    "topic": bank_title,
                    "category": "模板题库",
                    "difficulty": "medium",
                    "question": candidate["name"].strip(),
                    "reference_answer": answer_text.strip()
                    if isinstance(answer_text, str)
                    else "",
                    "tags": [bank_title],
                    "source_url": page.url,
                }
    return None


def _read_input(path: Path) -> list[dict[str, Any]]:
    text = path.read_text(encoding="utf-8")
    if path.suffix.lower() == ".json":
        value = json.loads(text)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
        if isinstance(value, dict):
            return _walk_json(value)
        raise ValueError("JSON 根节点必须是数组或对象")
    records, _ = _parse_page(RawPage(path.as_uri(), text))
    return records


def _crawl(url: str, cookie: str, max_pages: int, delay: float) -> tuple[list[dict[str, Any]], str]:
    if not _host_allowed(url):
        raise ValueError("只允许抓取 mianshiya.com 域名")
    origin = url
    pending = [url]
    visited: set[str] = set()
    records: list[dict[str, Any]] = []
    while pending and len(visited) < max_pages:
        current = pending.pop(0)
        if current in visited or not _host_allowed(current):
            continue
        visited.add(current)
        page = _fetch(current, cookie)
        page_records, links = _parse_page(page)
        records.extend(page_records)
        base_path = urlparse(origin).path
        for link in links:
            parsed = urlparse(link)
            if parsed.path == base_path and link not in visited and link not in pending:
                pending.append(link)
        if pending and delay > 0:
            time.sleep(delay)
    return records, origin


def _crawl_public_questions(
    url: str, cookie: str, max_banks: int, max_questions: int, delay: float
) -> tuple[list[dict[str, Any]], str]:
    root = _fetch(url, cookie)
    bank_links = [
        link for link in _parse_page(root)[1]
        if re.fullmatch(r"/exam/\d+", urlparse(link).path)
    ][: max(1, max_banks)]
    records: list[dict[str, Any]] = []
    for bank_url in dict.fromkeys(bank_links):
        bank_page = _fetch(bank_url, cookie)
        title_match = re.search(r"<title>([^<]+?)\s+-\s*面试鸭", bank_page.body)
        bank_title = title_match.group(1).strip() if title_match else bank_url.rsplit("/", 1)[-1]
        for item in _embedded_records(bank_page):
            item = dict(item)
            item.setdefault("topic", bank_title)
            item.setdefault("category", "模板题库")
            records.append(item)
            if len(records) >= max_questions:
                return records[:max_questions], url
        for question_url in _question_links(bank_page):
            if len(records) >= max_questions:
                return records, url
            question_page = _fetch(question_url, cookie)
            item = _question_record(question_page, bank_title)
            if item:
                records.append(item)
            if delay > 0:
                time.sleep(delay)
    return records, url


def _github_repo_parts(url: str) -> tuple[str, str] | None:
    parsed = urlparse(url)
    if parsed.hostname != "github.com":
        return None
    parts = [part for part in parsed.path.split("/") if part]
    if len(parts) < 2:
        return None
    return parts[0], parts[1].removesuffix(".git")


def _markdown_question_records(
    body: str, source_url: str, topic: str, origin: str
) -> list[dict[str, Any]]:
    matches = list(re.finditer(r"(?m)^(#{3,4})\s+(.+?)\s*$", body))
    records: list[dict[str, Any]] = []
    for index, match in enumerate(matches):
        question = re.sub(r"[`*_]", "", html.unescape(match.group(2))).strip()
        if len(question) < 8 or not question.endswith(("?", "？")):
            continue
        end = matches[index + 1].start() if index + 1 < len(matches) else len(body)
        answer = body[match.end() : end].strip()
        answer = re.sub(r"(?m)^#{1,4}\s+", "", answer).strip()
        if len(answer) < 10:
            continue
        records.append(
            {
                "topic": topic,
                "category": "开源题库",
                "difficulty": "medium",
                "question": question,
                "reference_answer": answer,
                "tags": ["JavaGuide", topic],
                "source_url": source_url,
                "origin_url": origin,
            }
        )
    return records


def _crawl_github_repository(
    url: str, max_files: int, max_questions: int, delay: float
) -> tuple[list[dict[str, Any]], str]:
    parts = _github_repo_parts(url)
    if parts is None:
        raise ValueError("GitHub 地址必须是 https://github.com/作者/仓库")
    owner, repo = parts
    api_root = f"https://api.github.com/repos/{owner}/{repo}"
    metadata = _fetch_json(api_root)
    if not isinstance(metadata, dict):
        raise ValueError("GitHub 仓库元数据格式无效")
    license_info = metadata.get("license")
    license_id = license_info.get("spdx_id") if isinstance(license_info, dict) else None
    if not license_id or license_id == "NOASSERTION":
        raise ValueError("仓库没有可识别的 SPDX 开源许可证，已停止抓取")
    branch = str(metadata.get("default_branch") or "main")
    tree = _fetch_json(f"{api_root}/git/trees/{branch}?recursive=1")
    if not isinstance(tree, dict) or not isinstance(tree.get("tree"), list):
        raise ValueError("GitHub 仓库目录读取失败")
    paths = [
        item["path"]
        for item in tree["tree"]
        if isinstance(item, dict)
        and item.get("type") == "blob"
        and isinstance(item.get("path"), str)
        and item["path"].startswith("docs/")
        and item["path"].lower().endswith(".md")
        and "about-the-author" not in item["path"]
        and "ai-coding" not in item["path"]
    ]
    paths.sort(key=lambda path: (0 if "interview" in path.lower() else 1, path))
    origin = f"https://github.com/{owner}/{repo}"
    records: list[dict[str, Any]] = []
    for path in paths[: max(1, max_files)]:
        raw_url = f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}"
        page = _fetch(raw_url, "")
        topic = path.removeprefix("docs/").split("/", 1)[0].replace("-", " ").title()
        records.extend(_markdown_question_records(page.body, raw_url, topic, origin))
        if len(records) >= max_questions:
            return records[:max_questions], origin
        if delay > 0:
            time.sleep(delay)
    return records, origin


def _markdown(questions: list[dict[str, Any]], title: str) -> str:
    # Knowledge frontmatter is intentionally limited to the supported title field;
    # provenance is supplied through the ingest API's origin_url field.
    lines = ["---", f"title: {json.dumps(title, ensure_ascii=False)}", "---", "", f"# {title}", ""]
    for index, item in enumerate(questions, 1):
        lines.extend(
            [
                f"## {index}. {item['question']}",
                "",
                f"- 分类：{item['category']}",
                f"- 难度：{item['difficulty']}",
            ]
        )
        if item["tags"]:
            lines.append(f"- 标签：{'、'.join(item['tags'])}")
        if item["reference_answer"]:
            lines.extend(["", "### 参考答案", "", item["reference_answer"]])
        lines.append("")
    return "\n".join(lines)


def _multipart(fields: dict[str, str]) -> tuple[bytes, str]:
    boundary = "----AuroraAgentTemplateImport"
    chunks: list[bytes] = []
    for name, value in fields.items():
        chunks.extend(
            [
                f"--{boundary}\r\n".encode(),
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(),
                value.encode("utf-8"),
                b"\r\n",
            ]
        )
    chunks.append(f"--{boundary}--\r\n".encode())
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


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


def _post_knowledge(api_base: str, markdown: str, title: str, origin_url: str) -> dict[str, Any]:
    body, content_type = _multipart(
        {"paste": markdown, "title_hint": title, "origin_url": origin_url}
    )
    request = Request(
        api_base.rstrip("/") + "/api/knowledge/sources",
        data=body,
        headers={"Content-Type": content_type, "Accept": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=30) as response:  # noqa: S310 - local API is operator supplied
        return json.loads(response.read().decode("utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(description="导入已授权的模板题库")
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--url", help=f"在线地址，默认示例：{DEFAULT_URL}")
    source.add_argument("--input", type=Path, help="已授权导出的 JSON 或 HTML 文件")
    parser.add_argument("--cookie-header", default=os.environ.get("MIANSHIYA_COOKIE", ""))
    parser.add_argument("--max-pages", type=int, default=10)
    parser.add_argument("--max-banks", type=int, default=5)
    parser.add_argument("--max-questions", type=int, default=100)
    parser.add_argument("--max-files", type=int, default=25)
    parser.add_argument("--delay", type=float, default=1.0)
    parser.add_argument("--title", default="米尚题库模板题")
    parser.add_argument("--origin-url", default="")
    parser.add_argument(
        "--output-json", type=Path, default=Path("data/template-question-bank.json")
    )
    parser.add_argument(
        "--output-markdown", type=Path, default=Path("data/template-question-bank.md")
    )
    parser.add_argument("--api-base", default=os.environ.get("AURORA_API_BASE", ""))
    parser.add_argument("--skip-api", action="store_true", help="只生成文件，不调用本地 API")
    args = parser.parse_args()

    try:
        if args.url:
            if _github_repo_parts(args.url):
                raw, detected_origin = _crawl_github_repository(
                    args.url,
                    max(1, args.max_files),
                    min(MAX_RECORDS, max(1, args.max_questions)),
                    max(0.0, args.delay),
                )
            elif re.fullmatch(r"https?://[^/]+/exam/banks/?", args.url):
                raw, detected_origin = _crawl_public_questions(
                    args.url,
                    args.cookie_header,
                    max(1, args.max_banks),
                    max(1, args.max_questions),
                    max(0.0, args.delay),
                )
            else:
                raw, detected_origin = _crawl(
                    args.url,
                    args.cookie_header,
                    max(1, args.max_pages),
                    max(0.0, args.delay),
                )
        else:
            raw = _read_input(args.input)
            detected_origin = args.input.as_uri()
        origin_url = args.origin_url or detected_origin
        questions = _normalize(raw, origin_url)
        if not questions:
            raise ValueError("没有识别到题目；请检查导出格式或页面是否需要浏览器渲染")
        args.output_json.parent.mkdir(parents=True, exist_ok=True)
        args.output_markdown.parent.mkdir(parents=True, exist_ok=True)
        payload = {"source_type": "template", "origin_url": origin_url, "questions": questions}
        args.output_json.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        markdown = _markdown(questions, args.title)
        args.output_markdown.write_text(markdown, encoding="utf-8")
        print(f"已生成 {len(questions)} 道题：{args.output_json} 和 {args.output_markdown}")
        if args.api_base and not args.skip_api:
            imported = _post_json(args.api_base, "/api/questions/import", payload)
            knowledge = _post_knowledge(args.api_base, markdown, args.title, origin_url)
            print(f"题库导入：新增 {imported.get('count', 0)}，跳过 {imported.get('skipped', 0)}")
            print(
                f"知识库导入：source_id={knowledge.get('source_id', '')}，"
                f"job_id={knowledge.get('job_id', '')}"
            )
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"导入失败：{exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
