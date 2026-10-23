import json

from fastapi.testclient import TestClient

from auroraagent.ai.types import Assistant
from auroraagent.api import create_app


class JSONModel:
    def __init__(self, payload: dict[str, object]):
        self.payload = payload

    def complete(self, messages, tools):  # type: ignore[no-untyped-def]
        return Assistant(content=json.dumps(self.payload, ensure_ascii=False))


def test_question_crud_review_stats_and_delete(tmp_path):
    client = TestClient(create_app(data_dir=tmp_path))

    created_response = client.post(
        "/api/questions",
        json={
            "category": "系统设计",
            "difficulty": "hard",
            "question": "如何设计一个短链系统？",
            "reference_answer": "发号器 + 缓存",
            "tags": ["系统设计"],
        },
    )

    assert created_response.status_code == 201
    created = created_response.json()
    assert created["source_type"] == "manual"
    assert created["status"] == "new"

    listed = client.get("/api/questions").json()
    assert [item["id"] for item in listed] == [created["id"]]

    review_response = client.post(
        f"/api/questions/{created['id']}/reviews",
        json={"rating": 3, "note": "答得不错"},
    )
    assert review_response.status_code == 201
    reviewed = review_response.json()["question"]
    assert reviewed["status"] == "mastered"
    assert reviewed["practice_count"] == 1

    bad_rating = client.post(f"/api/questions/{created['id']}/reviews", json={"rating": 9})
    assert bad_rating.status_code == 400
    assert bad_rating.json() == {"error": "rating 需为 1(不会)、2(模糊) 或 3(掌握)"}

    stats = client.get("/api/questions/stats").json()
    assert stats["total"] == 1
    assert stats["mastered"] == 1
    assert stats["today_reviews"] == 1

    delete_response = client.delete(f"/api/questions/{created['id']}")
    assert delete_response.status_code == 204
    assert delete_response.content == b""


def test_question_validation_and_generate_unsupported_source(tmp_path):
    client = TestClient(create_app(data_dir=tmp_path))

    empty = client.post("/api/questions", json={"question": "   "})
    assert empty.status_code == 400
    assert empty.json() == {"error": "题目内容不能为空"}

    missing_kb = client.post("/api/questions/generate", json={"source": "knowledge"})
    assert missing_kb.status_code == 400
    assert missing_kb.json() == {"error": "不支持的来源类型"}


def test_template_question_import_deduplicates_and_filters_by_source(tmp_path):
    client = TestClient(create_app(data_dir=tmp_path))
    response = client.post(
        "/api/questions/import",
        json={
            "questions": [
                {"question": "如何设计高并发缓存？", "category": "系统设计", "difficulty": "hard"},
                {"question": "如何设计高并发缓存？", "category": "系统设计"},
            ]
        },
    )
    assert response.status_code == 201
    assert response.json()["count"] == 1
    assert response.json()["skipped"] == 1
    assert response.json()["questions"][0]["source_type"] == "template"

    listed = client.get("/api/questions", params={"source_type": "template"})
    assert listed.status_code == 200
    assert [item["question"] for item in listed.json()] == ["如何设计高并发缓存？"]


def test_question_generate_from_notes_persists_questions(tmp_path):
    model = JSONModel(
        {
            "questions": [
                {
                    "category": "Go并发",
                    "difficulty": "hard",
                    "question": "如何解释 goroutine 调度？",
                    "reference_answer": "GMP 模型",
                    "tags": ["go", "scheduler"],
                },
                {
                    "category": "Go并发",
                    "difficulty": "困难",
                    "question": "如何解释 goroutine 调度？",
                    "reference_answer": "重复题",
                    "tags": [],
                },
            ]
        }
    )
    client = TestClient(create_app(data_dir=tmp_path, chat_model=model))
    application = client.post(
        "/api/applications",
        json={"company_name": "AuroraAgent", "position_name": "Backend", "status": "interview"},
    ).json()
    client.post(
        f"/api/applications/{application['id']}/notes",
        json={
            "company": "AuroraAgent",
            "position": "Backend",
            "round": "技术一面",
            "date": "2026-07-11",
            "questions": "goroutine scheduler GMP",
        },
    )

    response = client.post(
        "/api/questions/generate",
        json={
            "source": "notes",
            "topic": "go-runtime",
            "count": 2,
            "application_id": application["id"],
        },
    )

    assert response.status_code == 201
    generated = response.json()
    assert generated["count"] == 1
    assert generated["skipped"] == 1
    assert generated["questions"][0]["source_type"] == "ai_notes"
    assert generated["questions"][0]["difficulty"] == "hard"
    assert client.get("/api/questions?topic=go-runtime").json()[0]["question"] == "如何解释 goroutine 调度？"


def test_choice_and_programming_question_roundtrip_and_filter(tmp_path):
    client = TestClient(create_app(data_dir=tmp_path))

    choice_response = client.post(
        "/api/questions",
        json={
            "category": "数据库",
            "difficulty": "medium",
            "question": "下列关于 MySQL 索引的说法正确的是？",
            "question_type": "选择题",
            "options": ["主键索引需要回表", "联合索引遵守最左前缀", "索引越多写入越快", "覆盖索引仍需回表"],
            "correct_answer": "b",
            "reference_answer": "B 正确：最左前缀是联合索引的使用前提。",
            "tags": ["MySQL"],
        },
    )
    assert choice_response.status_code == 201
    choice = choice_response.json()
    assert choice["question_type"] == "choice"
    assert choice["options"][0] == "主键索引需要回表"
    assert choice["correct_answer"] == "B"

    programming_response = client.post(
        "/api/questions",
        json={
            "category": "数据结构",
            "question": "反转链表并返回新的头节点。",
            "question_type": "编程题",
            "starter_code": "def reverse(head):\n    pass\n",
            "reference_answer": "迭代三指针",
        },
    )
    assert programming_response.status_code == 201
    programming = programming_response.json()
    assert programming["question_type"] == "programming"
    assert programming["language"] == "python"
    assert programming["starter_code"].startswith("def reverse")

    choice_listed = client.get("/api/questions", params={"question_type": "choice"}).json()
    assert [item["id"] for item in choice_listed] == [choice["id"]]
    programming_listed = client.get("/api/questions", params={"question_type": "programming"}).json()
    assert [item["id"] for item in programming_listed] == [programming["id"]]

    updated = client.put(
        f"/api/questions/{choice['id']}",
        json={
            "category": "数据库",
            "question": choice["question"],
            "question_type": "choice",
            "options": ["选项一", "选项二", "选项三"],
            "correct_answer": "C",
            "reference_answer": "更新后的解析",
            "tags": ["MySQL", "索引"],
        },
    )
    assert updated.status_code == 200
    payload = updated.json()
    assert payload["options"] == ["选项一", "选项二", "选项三"]
    assert payload["correct_answer"] == "C"
    assert payload["tags"] == ["MySQL", "索引"]

    stats = client.get("/api/questions/stats").json()
    assert stats["total"] == 2


def test_question_type_validation_rejects_malformed_payloads(tmp_path):
    client = TestClient(create_app(data_dir=tmp_path))

    unknown = client.post("/api/questions", json={"question": "题", "question_type": "填空题"})
    assert unknown.status_code == 400
    assert unknown.json() == {"error": "不支持的题型：填空题"}

    no_options = client.post(
        "/api/questions",
        json={"question": "题", "question_type": "choice", "options": ["只有一个"], "correct_answer": "A"},
    )
    assert no_options.status_code == 400
    assert no_options.json() == {"error": "选择题需要 2-8 个选项"}

    bad_answer = client.post(
        "/api/questions",
        json={
            "question": "题",
            "question_type": "choice",
            "options": ["甲", "乙"],
            "correct_answer": "Z",
        },
    )
    assert bad_answer.status_code == 400
    assert bad_answer.json() == {"error": "选择题的 correct_answer 必须对应某个选项（A/B/C… 或选项内容）"}


def test_template_import_carries_question_type_fields(tmp_path):
    client = TestClient(create_app(data_dir=tmp_path))
    response = client.post(
        "/api/questions/import",
        json={
            "questions": [
                {
                    "question": "HTTP/1.1 新增了什么特性？",
                    "question_type": "选择题",
                    "options": ["持久连接", "多路复用", "头部压缩", "二进制分帧"],
                    "correct_answer": "持久连接",
                    "reference_answer": "A：keep-alive 是 1.1 的默认行为。",
                },
                {
                    "question": "实现 LRU 缓存，要求 get/put 均为 O(1)。",
                    "question_type": "programming",
                    "language": "python",
                    "starter_code": "class LRUCache:\n    pass\n",
                    "reference_answer": "哈希表 + 双向链表",
                },
            ]
        },
    )
    assert response.status_code == 201
    questions = {item["question_type"]: item for item in response.json()["questions"]}
    assert questions["choice"]["correct_answer"] == "A"
    assert questions["programming"]["language"] == "python"
    assert questions["programming"]["starter_code"].startswith("class LRUCache")


def test_question_type_filter_accepts_aliases_and_rejects_unknown(tmp_path):
    client = TestClient(create_app(data_dir=tmp_path))
    created = client.post(
        "/api/questions",
        json={
            "question": "下列说法正确的是？",
            "question_type": "choice",
            "options": ["甲", "乙"],
            "correct_answer": "A",
        },
    )
    assert created.status_code == 201

    aliased = client.get("/api/questions", params={"question_type": "选择题"})
    assert aliased.status_code == 200
    assert [item["id"] for item in aliased.json()] == [created.json()["id"]]

    unknown = client.get("/api/questions", params={"question_type": "填空题"})
    assert unknown.status_code == 400
    assert unknown.json() == {"error": "不支持的题型：填空题"}


def test_update_question_omitting_question_type_keeps_type_block(tmp_path):
    client = TestClient(create_app(data_dir=tmp_path))
    created = client.post(
        "/api/questions",
        json={
            "category": "网络",
            "question": "三次握手的目的是什么？",
            "question_type": "choice",
            "options": ["同步序列号", "加速传输"],
            "correct_answer": "A",
            "reference_answer": "握手用于同步初始序列号。",
        },
    )
    assert created.status_code == 201
    question_id = created.json()["id"]

    updated = client.put(
        f"/api/questions/{question_id}",
        json={
            "category": "计算机网络",
            "question": "TCP 三次握手的目的是什么？",
            "reference_answer": "握手用于同步双方初始序列号。",
            "tags": ["TCP"],
        },
    )
    assert updated.status_code == 200
    payload = updated.json()
    assert payload["question_type"] == "choice"
    assert payload["options"] == ["同步序列号", "加速传输"]
    assert payload["correct_answer"] == "A"
    assert payload["category"] == "计算机网络"
