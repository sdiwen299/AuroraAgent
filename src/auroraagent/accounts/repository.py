from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from time import time

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from auroraagent.accounts.models import Account, AccountSession
from auroraagent.accounts.passwords import (
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
    role: str
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


def normalize_role(raw: str) -> str:
    role = (raw or "candidate").strip().lower()
    if role not in {"candidate", "hr"}:
        raise AccountError("身份类型不正确", code="role_invalid")
    return role


def _record(account: Account, role: str | None = None) -> AccountRecord:
    return AccountRecord(
        id=account.id,
        email=account.email,
        display_name=account.display_name or "",
        role=normalize_role(role if role is not None else account.role),
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

    def primary_account_id(self) -> int | None:
        with self._session_factory() as session:
            value = session.scalar(select(func.min(Account.id)))
        return int(value) if value is not None else None

    def register(
        self, email: str, password: str, display_name: str = "", role: str = "candidate"
    ) -> AccountRecord:
        normalized = normalize_email(email)
        _validate_registration(normalized, password)
        with self._session_factory() as session:
            account = Account(
                email=normalized,
                display_name=(display_name or "").strip()[:120],
                password_hash=hash_password(password),
                role=normalize_role(role),
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

    def authenticate(self, email: str, password: str, role: str = "candidate") -> AccountRecord | None:
        normalized = normalize_email(email)
        if not normalized or not password:
            return None
        # role 只是进入时的视图模式（可在登录后切换），不是账号身份，
        # 因此只校验取值合法，不再要求与账号注册时的默认身份一致。
        normalize_role(role)
        with self._session_factory() as session:
            account = session.scalar(select(Account).where(Account.email == normalized))
            if account is None:
                return None
            if not verify_password(password, account.password_hash):
                return None
            return _record(account)

    def create_session(self, account_id: int, role: str = "candidate") -> str:
        token = new_session_token()
        now = int(time())
        with self._session_factory() as session:
            session.add(
                AccountSession(
                    account_id=account_id,
                    role=normalize_role(role),
                    token_hash=session_token_hash(token),
                    created_at=now,
                    last_seen_at=now,
                    expires_at=now + SESSION_TTL_SECONDS,
                )
            )
            session.commit()
        return token

    def set_session_role(self, token: str, role: str) -> AccountRecord | None:
        if not token:
            return None
        normalized_role = normalize_role(role)
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
            account_session.role = normalized_role
            session.commit()
            return _record(account, role=normalized_role)

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
            return _record(account, role=account_session.role)

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
