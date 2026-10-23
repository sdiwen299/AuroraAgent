from fastapi.testclient import TestClient

from auroraagent.api import create_app


def _client(tmp_path) -> TestClient:
    return TestClient(create_app(data_dir=tmp_path))


def _hr_headers(tmp_path):
    client = _client(tmp_path)
    created = client.post(
        "/api/auth/register",
        json={"email": "hr@example.com", "password": "supersecret", "role": "hr"},
    )
    assert created.status_code == 201
    return client, {"X-AuroraAgent-Token": created.json()["token"]}


def _candidate_headers(tmp_path):
    client = _client(tmp_path)
    created = client.post(
        "/api/auth/register",
        json={"email": "candidate@example.com", "password": "supersecret"},
    )
    assert created.status_code == 201
    return client, {"X-AuroraAgent-Token": created.json()["token"]}


def _create_posting(client, headers, **overrides) -> dict:
    payload = {"title": "后端工程师", "company_name": "Aurora", "status": "open"}
    payload.update(overrides)
    response = client.post("/api/hr/job-postings", headers=headers, json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def _create_candidate(client, headers, name="张三") -> dict:
    response = client.post("/api/hr/candidates", headers=headers, json={"name": name})
    assert response.status_code == 201, response.text
    return response.json()


def test_job_posting_crud_lifecycle(tmp_path):
    client, headers = _hr_headers(tmp_path)

    created = _create_posting(client, headers)
    assert created["status"] == "open"
    assert created["headcount"] == 1
    posting_id = created["id"]

    assert len(client.get("/api/hr/job-postings", headers=headers).json()) == 1
    assert client.get("/api/hr/job-postings?status=draft", headers=headers).json() == []

    updated = client.patch(
        f"/api/hr/job-postings/{posting_id}",
        headers=headers,
        json={"status": "paused", "headcount": 2, "salary_range": "20-35k"},
    )
    assert updated.status_code == 200
    assert updated.json()["status"] == "paused"
    assert updated.json()["headcount"] == 2

    fetched = client.get(f"/api/hr/job-postings/{posting_id}", headers=headers).json()
    assert fetched["salary_range"] == "20-35k"

    assert client.delete(f"/api/hr/job-postings/{posting_id}", headers=headers).json() == {
        "deleted": True
    }
    assert client.get(f"/api/hr/job-postings/{posting_id}", headers=headers).status_code == 404
    assert client.get("/api/hr/job-postings", headers=headers).json() == []


def test_job_posting_validation(tmp_path):
    client, headers = _hr_headers(tmp_path)

    missing_title = client.post("/api/hr/job-postings", headers=headers, json={"title": "  "})
    assert missing_title.status_code == 400
    assert missing_title.json()["error_code"] == "job_title_required"

    bad_status = client.post(
        "/api/hr/job-postings",
        headers=headers,
        json={"title": "岗位", "status": "banana"},
    )
    assert bad_status.status_code == 400
    assert bad_status.json()["error_code"] == "job_status_invalid"


def test_candidate_application_pipeline(tmp_path):
    client, headers = _hr_headers(tmp_path)
    posting = _create_posting(client, headers)
    candidate_a = _create_candidate(client, headers, "张三")
    candidate_b = _create_candidate(client, headers, "李四")

    first = client.post(
        "/api/hr/candidate-applications",
        headers=headers,
        json={"job_posting_id": posting["id"], "candidate_id": candidate_a["id"]},
    )
    assert first.status_code == 201, first.text
    application_id = first.json()["id"]

    duplicate = client.post(
        "/api/hr/candidate-applications",
        headers=headers,
        json={"job_posting_id": posting["id"], "candidate_id": candidate_a["id"]},
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["error_code"] == "candidate_application_exists"

    second = client.post(
        "/api/hr/candidate-applications",
        headers=headers,
        json={"job_posting_id": posting["id"], "candidate_id": candidate_b["id"]},
    )
    assert second.status_code == 201

    summary = client.get("/api/hr/pipeline-summary", headers=headers).json()
    assert summary["applied"] == 2

    advanced = client.patch(
        f"/api/hr/candidate-applications/{application_id}",
        headers=headers,
        json={"stage": "interview", "rating": 4, "stage_note": "一面通过"},
    )
    assert advanced.status_code == 200
    assert advanced.json()["stage"] == "interview"
    assert advanced.json()["rating"] == 4

    summary = client.get("/api/hr/pipeline-summary", headers=headers).json()
    assert summary["applied"] == 1
    assert summary["interview"] == 1

    interviews = client.get("/api/hr/candidate-applications?stage=interview", headers=headers).json()
    assert [item["id"] for item in interviews] == [application_id]

    assert client.delete(
        f"/api/hr/candidate-applications/{application_id}", headers=headers
    ).json() == {"deleted": True}
    assert client.get("/api/hr/pipeline-summary", headers=headers).json()["interview"] == 0


def test_candidate_application_validation(tmp_path):
    client, headers = _hr_headers(tmp_path)
    posting = _create_posting(client, headers)
    candidate = _create_candidate(client, headers)

    missing = client.post(
        "/api/hr/candidate-applications",
        headers=headers,
        json={"job_posting_id": posting["id"], "candidate_id": 999999},
    )
    assert missing.status_code == 404
    assert missing.json()["error_code"] == "candidate_not_found"

    application = client.post(
        "/api/hr/candidate-applications",
        headers=headers,
        json={"job_posting_id": posting["id"], "candidate_id": candidate["id"]},
    ).json()

    bad_rating = client.patch(
        f"/api/hr/candidate-applications/{application['id']}", headers=headers, json={"rating": 9}
    )
    assert bad_rating.status_code == 400
    assert bad_rating.json()["error_code"] == "rating_invalid"

    bad_stage = client.patch(
        f"/api/hr/candidate-applications/{application['id']}", headers=headers, json={"stage": "nope"}
    )
    assert bad_stage.status_code == 400
    assert bad_stage.json()["error_code"] == "stage_invalid"


def test_deleting_candidate_or_posting_cascades_applications(tmp_path):
    client, headers = _hr_headers(tmp_path)
    posting = _create_posting(client, headers)
    candidate = _create_candidate(client, headers)
    client.post(
        "/api/hr/candidate-applications",
        headers=headers,
        json={"job_posting_id": posting["id"], "candidate_id": candidate["id"]},
    )
    assert client.get("/api/hr/pipeline-summary", headers=headers).json()["applied"] == 1

    assert client.delete(f"/api/hr/candidates/{candidate['id']}", headers=headers).json() == {
        "deleted": True
    }
    assert client.get("/api/hr/pipeline-summary", headers=headers).json()["applied"] == 0
    # 岗位仍在，且候选人已从列表移除。
    assert client.get("/api/hr/job-postings", headers=headers).json()[0]["id"] == posting["id"]
    assert client.get("/api/hr/candidates", headers=headers).json() == []


def test_hr_endpoints_require_hr_role(tmp_path):
    client, candidate_headers = _candidate_headers(tmp_path)

    listed = client.get("/api/hr/job-postings", headers=candidate_headers)
    assert listed.status_code == 403
    assert listed.json()["error_code"] == "hr_role_required"

    created = client.post(
        "/api/hr/candidates", headers=candidate_headers, json={"name": "李四"}
    )
    assert created.status_code == 403


def test_candidate_switches_into_hr_view(tmp_path):
    client, candidate_headers = _candidate_headers(tmp_path)

    assert client.get("/api/hr/job-postings", headers=candidate_headers).status_code == 403

    switched = client.post(
        "/api/auth/role", headers=candidate_headers, json={"role": "hr"}
    )
    assert switched.status_code == 200
    assert switched.json()["role"] == "hr"

    assert client.get("/api/hr/job-postings", headers=candidate_headers).json() == []


def test_hr_endpoints_open_in_local_mode(tmp_path):
    client = _client(tmp_path)

    assert client.get("/api/hr/job-postings").json() == []
    assert client.get("/api/hr/pipeline-summary").status_code == 200
