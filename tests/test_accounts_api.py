import sqlite3

from fastapi.testclient import TestClient

from offerpilot.api import create_app
from offerpilot.config import load_config


def _client(tmp_path) -> TestClient:
    return TestClient(create_app(data_dir=tmp_path))


def _register(client: TestClient, email: str = "zhe@example.com", password: str = "supersecret"):
    return client.post(
        "/api/auth/register",
        json={"email": email, "password": password, "display_name": "筱哲"},
    )


def test_first_run_registration_opens_the_gate(tmp_path):
    client = _client(tmp_path)

    before = client.get("/api/auth/status").json()
    assert before == {
        "auth_enabled": False,
        "authenticated": True,
        "has_accounts": False,
        "account": None,
    }

    created = _register(client, email="Zhe@Example.com ")

    assert created.status_code == 201
    payload = created.json()
    assert payload["account"] == {"email": "zhe@example.com", "display_name": "筱哲"}
    assert payload["token"]
    assert load_config(tmp_path).accounts_enabled is True

    # 一旦存在账号，未携带会话令牌的 API 请求就被拒。
    assert client.get("/api/applications").status_code == 401
    assert client.get("/api/applications", headers={"X-OfferPilot-Token": payload["token"]}).status_code == 200


def test_registration_rejects_invalid_input(tmp_path):
    client = _client(tmp_path)

    bad_email = _register(client, email="not-an-email")
    short_password = _register(client, email="zhe@example.com", password="short")

    assert bad_email.status_code == 400
    assert bad_email.json()["error_code"] == "email_invalid"
    assert short_password.status_code == 400
    assert short_password.json()["error_code"] == "password_too_short"
    assert load_config(tmp_path).accounts_enabled is False


def test_registration_rejects_duplicate_email(tmp_path):
    client = _client(tmp_path)
    token = _register(client).json()["token"]

    # 已有账号后注册需要先登录，因此用会话令牌复现「邮箱已占用」这一分支。
    duplicate = client.post(
        "/api/auth/register",
        headers={"X-OfferPilot-Token": token},
        json={"email": "zhe@example.com", "password": "anothersecret"},
    )

    assert duplicate.status_code == 409
    assert duplicate.json()["error_code"] == "email_taken"


def test_login_issues_and_logout_revokes_session(tmp_path):
    client = _client(tmp_path)
    _register(client)

    rejected = client.post(
        "/api/auth/login", json={"email": "zhe@example.com", "password": "wrong-password"}
    )
    assert rejected.status_code == 401
    assert rejected.json()["error_code"] == "invalid_credentials"

    logged_in = client.post(
        "/api/auth/login", json={"email": "zhe@example.com", "password": "supersecret"}
    )
    assert logged_in.status_code == 200
    token = logged_in.json()["token"]
    assert logged_in.json()["account"]["email"] == "zhe@example.com"

    status = client.get("/api/auth/status", headers={"X-OfferPilot-Token": token}).json()
    assert status["authenticated"] is True
    assert status["account"] == {"email": "zhe@example.com", "display_name": "筱哲"}

    assert client.post("/api/auth/logout", headers={"X-OfferPilot-Token": token}).json() == {"ok": True}
    assert client.get("/api/applications", headers={"X-OfferPilot-Token": token}).status_code == 401
    after_logout = client.get("/api/auth/status", headers={"X-OfferPilot-Token": token}).json()
    assert after_logout["authenticated"] is False
    assert after_logout["account"] is None


def test_registration_stays_closed_once_an_account_exists(tmp_path):
    client = _client(tmp_path)
    token = _register(client).json()["token"]

    closed = _register(client, email="other@example.com")
    assert closed.status_code == 403
    assert closed.json()["error_code"] == "registration_closed"

    allowed = client.post(
        "/api/auth/register",
        headers={"X-OfferPilot-Token": token},
        json={"email": "other@example.com", "password": "anothersecret"},
    )
    assert allowed.status_code == 201


def test_account_secrets_are_never_stored_in_plaintext(tmp_path):
    client = _client(tmp_path)
    token = _register(client).json()["token"]

    with sqlite3.connect(tmp_path / "data.db") as connection:
        password_hash = connection.execute("SELECT password_hash FROM accounts").fetchone()[0]
        token_hash = connection.execute("SELECT token_hash FROM account_sessions").fetchone()[0]

    assert password_hash != "supersecret"
    assert password_hash.startswith("pbkdf2_sha256$")
    assert token_hash != token
    assert len(token_hash) == 64


def test_saving_ai_settings_keeps_the_account_gate_closed(tmp_path):
    """保存 AI 设置只能改 Provider 字段，不能顺带把账号门禁关掉。"""
    client = _client(tmp_path)
    token = _register(client).json()["token"]
    headers = {"X-OfferPilot-Token": token}

    saved = client.put(
        "/api/settings",
        headers=headers,
        json={
            "chat_auto_approve_writes": False,
            "active_provider_id": "default",
            "base_url": "https://api.deepseek.com/v1",
            "model": "deepseek-chat",
        },
    )

    assert saved.status_code == 200
    assert saved.json()["model"] == "deepseek-chat"
    assert load_config(tmp_path).accounts_enabled is True
    # 门禁仍然生效：没有会话令牌就拿不到数据。
    assert client.get("/api/applications").status_code == 401
    assert client.get("/api/auth/status").json()["has_accounts"] is True


def test_health_and_status_stay_public_with_accounts_enabled(tmp_path):
    client = _client(tmp_path)
    _register(client)

    assert client.get("/api/health").json() == {"status": "ok"}
    assert client.get("/api/auth/status").status_code == 200
