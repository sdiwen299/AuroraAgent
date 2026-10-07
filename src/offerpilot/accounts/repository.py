from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from time import time

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from offerpilot.accounts.models import Account, AccountSession
from offerpilot.accounts.passwords import (
    hash_password,
    new_session_token,
    session_token_hash,
    verify_password,
)

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_LENGTH = 200
MAX_EMAIL_LENGTH = 254
SESSION_TTL_SECONDS = 30 * 24 * 60 * 60


class AccountError(Exception):
    """账号校验失败：携带可映射到 HTTP 的状态码与稳定错误码。"""

    def __init__(self, message: str, *, status_code: int = 400, code: str = "") -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code


@dataclass(frozen=True)
class AccountRecord:
    id: int
    email: str
    display_name: str
    created_at: datetime | None


def normalize_email(raw: str) -> str:
    return (raw or "").strip().lower()


def _validate_registration(email: str, password: str) -> None:
    if not email:
        raise AccountError("请输入邮箱", code="email_required")
    if len(email) > MAX_EMAIL_LENGTH or not EMAIL_PATTERN.match(email):
        raise AccountError("邮箱格式不正确", code="email_invalid")
    if len(password) < MIN_PASSWORD_LENGTH:
        raise AccountError(
            f"密码至少需要 {MIN_PASSWORD_LENGTH} 位", code="password_too_short"
        )
    if len(password) > MAX_PASSWORD_LENGTH:
        raise AccountError("密码过长", code="password_too_long")


def _record(account: Account) -> AccountRecord:
    return AccountRecord(
        id=account.id,
        email=account.email,
        display_name=account.display_name or "",
        created_at=account.created_at,
    )


class AccountsRepository:
    """账号与登录会话的持久化边界。"""

    def __init__(self, session_factory: sessionmaker[Session]) -> None:
        self._session_factory = session_factory

    def count_accounts(self) -> int:
        with self._session_factory() as session:
            return int(session.scalar(select(func.count()).select_from(Account)) or 0)

    def has_accounts(self) -> bool:
        return self.count_accounts() > 0

    def register(
        self, email: str, password: str, display_name: str = ""
    ) -> AccountRecord:
        normalized = normalize_email(email)
        _validate_registration(normalized, password)
        with self._session_factory() as session:
            account = Account(
                email=normalized,
                display_name=(display_name or "").strip()[:120],
                password_hash=hash_password(password),
                updated_at=datetime.now(),
            )
            session.add(account)
            try:
                session.commit()
            except IntegrityError as exc:
                session.rollback()
                raise AccountError(
                    "该邮箱已注册", status_code=409, code="email_taken"
                ) from exc
            session.refresh(account)
            return _record(account)

    def authenticate(self, email: str, password: str) -> AccountRecord | None:
        normalized = normalize_email(email)
        if not normalized or not password:
            return None
        with self._session_factory() as session:
            account = session.scalar(select(Account).where(Account.email == normalized))
            if account is None:
                return None
            if not verify_password(password, account.password_hash):
                return None
            return _record(account)

    def create_session(self, account_id: int) -> str:
        token = new_session_token()
        now = int(time())
        with self._session_factory() as session:
            session.add(
                AccountSession(
                    account_id=account_id,
                    token_hash=session_token_hash(token),
                    created_at=now,
                    last_seen_at=now,
                    expires_at=now + SESSION_TTL_SECONDS,
                )
            )
            session.commit()
        return token

    def resolve_session(self, token: str) -> AccountRecord | None:
        if not token:
            return None
        token_hash = session_token_hash(token)
        now = int(time())
        with self._session_factory() as session:
            row = session.execute(
                select(AccountSession, Account)
                .join(Account, Account.id == AccountSession.account_id)
                .where(AccountSession.token_hash == token_hash)
            ).first()
            if row is None:
                return None
            account_session, account = row
            if account_session.expires_at <= now:
                session.delete(account_session)
                session.commit()
                return None
            account_session.last_seen_at = now
            session.commit()
            return _record(account)

    def revoke_session(self, token: str) -> bool:
        if not token:
            return False
        token_hash = session_token_hash(token)
        with self._session_factory() as session:
            deleted = session.execute(
                AccountSession.__table__.delete().where(
                    AccountSession.token_hash == token_hash
                )
            )
            session.commit()
            return bool(deleted.rowcount)
