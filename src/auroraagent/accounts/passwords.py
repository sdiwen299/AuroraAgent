from __future__ import annotations

import hashlib
import hmac
import secrets

ALGORITHM = "pbkdf2_sha256"
# 本地优先的单用户工作台：迭代次数足以抬高离线爆破成本，同时让注册/登录保持在
# 交互可接受的时间内（约几十毫秒）。
ITERATIONS = 200_000
SALT_BYTES = 16


def hash_password(password: str) -> str:
    """生成 ``pbkdf2_sha256$<iterations>$<salt>$<digest>`` 格式的口令散列。"""

    salt = secrets.token_bytes(SALT_BYTES)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, ITERATIONS)
    return f"{ALGORITHM}${ITERATIONS}${salt.hex()}${derived.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    """常量时间校验口令；散列格式非法时返回 False 而不是抛错。"""

    try:
        algorithm, iterations_raw, salt_hex, digest_hex = encoded.split("$")
        iterations = int(iterations_raw)
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(digest_hex)
    except (ValueError, AttributeError):
        return False
    if algorithm != ALGORITHM or iterations <= 0 or not salt or not expected:
        return False
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(derived, expected)


def new_session_token() -> str:
    return secrets.token_urlsafe(32)


def session_token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
