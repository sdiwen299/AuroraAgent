from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from auroraagent.models import (
    Candidate,
    CandidateApplication,
    JobPosting,
)
from auroraagent.repositories.session_binding import (
    finish_repository_write,
    repository_session,
)

JOB_POSTING_STATUSES = ("draft", "open", "paused", "closed")
CANDIDATE_APPLICATION_STAGES = (
    "applied",
    "screening",
    "interview",
    "offer",
    "hired",
    "rejected",
)
MIN_RATING = 1
MAX_RATING = 5


class RecruitingError(Exception):
    """招聘域校验失败：携带可映射到 HTTP 的状态码与稳定错误码。"""

    def __init__(self, message: str, *, status_code: int = 400, code: str = "") -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code


def normalize_job_status(raw: str) -> str:
    status = (raw or "draft").strip().lower()
    if status not in JOB_POSTING_STATUSES:
        raise RecruitingError("岗位状态不正确", code="job_status_invalid")
    return status


def normalize_stage(raw: str) -> str:
    stage = (raw or "applied").strip().lower()
    if stage not in CANDIDATE_APPLICATION_STAGES:
        raise RecruitingError("候选人阶段不正确", code="stage_invalid")
    return stage


def normalize_rating(raw: Any) -> int | None:
    if raw is None or raw == "":
        return None
    if isinstance(raw, bool) or not isinstance(raw, int):
        raise RecruitingError("评分必须是 1-5 的整数", code="rating_invalid")
    if raw < MIN_RATING or raw > MAX_RATING:
        raise RecruitingError("评分必须是 1-5 的整数", code="rating_invalid")
    return raw


@dataclass
class JobPostingCreate:
    title: str
    company_name: str = ""
    department: str = ""
    location: str = ""
    employment_type: str = ""
    salary_range: str = ""
    headcount: int = 1
    description: str = ""
    requirements: str = ""
    status: str = "draft"
    notes: str = ""


@dataclass
class CandidateCreate:
    name: str
    email: str = ""
    phone: str = ""
    source: str = ""
    headline: str = ""
    resume_id: Optional[int] = None
    notes: str = ""


@dataclass
class CandidateApplicationCreate:
    job_posting_id: int
    candidate_id: int
    stage: str = "applied"
    rating: Optional[int] = None
    stage_note: str = ""


class RecruitingRepository:
    """招聘（HR）域的持久化边界：岗位、候选人与候选人投递流水线。"""

    def __init__(self, session_factory: sessionmaker[Session], session: Session | None = None):
        self._session_factory = session_factory
        self._session = session

    def bind(self, session: Session) -> "RecruitingRepository":
        return RecruitingRepository(self._session_factory, session)

    # ------------------------------------------------------------------ 岗位

    def create_job_posting(self, data: JobPostingCreate) -> JobPosting:
        title = (data.title or "").strip()
        if not title:
            raise RecruitingError("岗位名称不能为空", code="job_title_required")
        headcount = data.headcount if isinstance(data.headcount, int) and data.headcount > 0 else 1
        posting = JobPosting(
            title=title,
            company_name=(data.company_name or "").strip(),
            department=(data.department or "").strip(),
            location=(data.location or "").strip(),
            employment_type=(data.employment_type or "").strip(),
            salary_range=(data.salary_range or "").strip(),
            headcount=headcount,
            description=data.description or "",
            requirements=data.requirements or "",
            status=normalize_job_status(data.status),
            notes=data.notes or "",
        )
        with repository_session(self._session_factory, self._session) as session:
            session.add(posting)
            finish_repository_write(session, self._session)
            session.refresh(posting)
            return posting

    def list_job_postings(self, status: str = "") -> list[JobPosting]:
        statement = select(JobPosting).where(JobPosting.deleted_at.is_(None))
        if status:
            statement = statement.where(JobPosting.status == normalize_job_status(status))
        statement = statement.order_by(JobPosting.created_at.desc(), JobPosting.id.desc())
        with self._session_factory() as session:
            return list(session.scalars(statement))

    def get_job_posting(self, posting_id: int) -> Optional[JobPosting]:
        with repository_session(self._session_factory, self._session) as session:
            posting = session.get(JobPosting, posting_id)
            if posting is None or posting.deleted_at is not None:
                return None
            return posting

    def update_job_posting(self, posting_id: int, changes: dict[str, Any]) -> Optional[JobPosting]:
        with repository_session(self._session_factory, self._session) as session:
            posting = session.get(JobPosting, posting_id)
            if posting is None or posting.deleted_at is not None:
                return None
            _apply_job_posting_changes(posting, changes)
            posting.updated_at = datetime.now(timezone.utc)
            finish_repository_write(session, self._session)
            session.refresh(posting)
            return posting

    def delete_job_posting(self, posting_id: int) -> bool:
        with repository_session(self._session_factory, self._session) as session:
            posting = session.get(JobPosting, posting_id)
            if posting is None or posting.deleted_at is not None:
                return False
            posting.deleted_at = datetime.now(timezone.utc)
            for application in session.scalars(
                select(CandidateApplication).where(
                    CandidateApplication.job_posting_id == posting_id
                )
            ):
                session.delete(application)
            finish_repository_write(session, self._session)
            return True

    # ---------------------------------------------------------------- 候选人

    def create_candidate(self, data: CandidateCreate) -> Candidate:
        name = (data.name or "").strip()
        if not name:
            raise RecruitingError("候选人姓名不能为空", code="candidate_name_required")
        candidate = Candidate(
            name=name,
            email=(data.email or "").strip(),
            phone=(data.phone or "").strip(),
            source=(data.source or "").strip(),
            headline=(data.headline or "").strip(),
            resume_id=data.resume_id,
            notes=data.notes or "",
        )
        with repository_session(self._session_factory, self._session) as session:
            session.add(candidate)
            finish_repository_write(session, self._session)
            session.refresh(candidate)
            return candidate

    def list_candidates(self) -> list[Candidate]:
        statement = (
            select(Candidate)
            .where(Candidate.deleted_at.is_(None))
            .order_by(Candidate.created_at.desc(), Candidate.id.desc())
        )
        with self._session_factory() as session:
            return list(session.scalars(statement))

    def get_candidate(self, candidate_id: int) -> Optional[Candidate]:
        with repository_session(self._session_factory, self._session) as session:
            candidate = session.get(Candidate, candidate_id)
            if candidate is None or candidate.deleted_at is not None:
                return None
            return candidate

    def update_candidate(self, candidate_id: int, changes: dict[str, Any]) -> Optional[Candidate]:
        with repository_session(self._session_factory, self._session) as session:
            candidate = session.get(Candidate, candidate_id)
            if candidate is None or candidate.deleted_at is not None:
                return None
            _apply_candidate_changes(candidate, changes)
            candidate.updated_at = datetime.now(timezone.utc)
            finish_repository_write(session, self._session)
            session.refresh(candidate)
            return candidate

    def delete_candidate(self, candidate_id: int) -> bool:
        with repository_session(self._session_factory, self._session) as session:
            candidate = session.get(Candidate, candidate_id)
            if candidate is None or candidate.deleted_at is not None:
                return False
            candidate.deleted_at = datetime.now(timezone.utc)
            for application in session.scalars(
                select(CandidateApplication).where(
                    CandidateApplication.candidate_id == candidate_id
                )
            ):
                session.delete(application)
            finish_repository_write(session, self._session)
            return True

    # ----------------------------------------------------------- 候选人投递

    def create_candidate_application(
        self, data: CandidateApplicationCreate
    ) -> CandidateApplication:
        stage = normalize_stage(data.stage)
        rating = normalize_rating(data.rating)
        with repository_session(self._session_factory, self._session) as session:
            posting = session.get(JobPosting, data.job_posting_id)
            if posting is None or posting.deleted_at is not None:
                raise RecruitingError("招聘岗位不存在", status_code=404, code="job_not_found")
            candidate = session.get(Candidate, data.candidate_id)
            if candidate is None or candidate.deleted_at is not None:
                raise RecruitingError("候选人不存在", status_code=404, code="candidate_not_found")
            existing = session.scalar(
                select(CandidateApplication)
                .where(CandidateApplication.job_posting_id == data.job_posting_id)
                .where(CandidateApplication.candidate_id == data.candidate_id)
            )
            if existing is not None:
                raise RecruitingError(
                    "该候选人已投递此岗位", status_code=409, code="candidate_application_exists"
                )
            application = CandidateApplication(
                job_posting_id=data.job_posting_id,
                candidate_id=data.candidate_id,
                stage=stage,
                rating=rating,
                stage_note=data.stage_note or "",
            )
            session.add(application)
            finish_repository_write(session, self._session)
            session.refresh(application)
            return application

    def list_candidate_applications(
        self, job_posting_id: int | None = None, stage: str = ""
    ) -> list[CandidateApplication]:
        statement = (
            select(CandidateApplication)
            .join(Candidate, Candidate.id == CandidateApplication.candidate_id)
            .join(JobPosting, JobPosting.id == CandidateApplication.job_posting_id)
            .where(Candidate.deleted_at.is_(None))
            .where(JobPosting.deleted_at.is_(None))
        )
        if job_posting_id is not None:
            statement = statement.where(CandidateApplication.job_posting_id == job_posting_id)
        if stage:
            statement = statement.where(CandidateApplication.stage == normalize_stage(stage))
        statement = statement.order_by(
            CandidateApplication.updated_at.desc(), CandidateApplication.id.desc()
        )
        with self._session_factory() as session:
            return list(session.scalars(statement))

    def get_candidate_application(self, application_id: int) -> Optional[CandidateApplication]:
        with self._session_factory() as session:
            return session.get(CandidateApplication, application_id)

    def update_candidate_application(
        self, application_id: int, changes: dict[str, Any]
    ) -> Optional[CandidateApplication]:
        with repository_session(self._session_factory, self._session) as session:
            application = session.get(CandidateApplication, application_id)
            if application is None:
                return None
            if "stage" in changes:
                application.stage = normalize_stage(str(changes["stage"]))
            if "rating" in changes:
                application.rating = normalize_rating(changes["rating"])
            if "stage_note" in changes:
                application.stage_note = str(changes["stage_note"] or "")
            application.updated_at = datetime.now(timezone.utc)
            finish_repository_write(session, self._session)
            session.refresh(application)
            return application

    def delete_candidate_application(self, application_id: int) -> bool:
        with repository_session(self._session_factory, self._session) as session:
            application = session.get(CandidateApplication, application_id)
            if application is None:
                return False
            session.delete(application)
            finish_repository_write(session, self._session)
            return True

    def pipeline_summary(self) -> dict[str, int]:
        counts = {stage: 0 for stage in CANDIDATE_APPLICATION_STAGES}
        for application in self.list_candidate_applications():
            if application.stage in counts:
                counts[application.stage] += 1
        return counts


def _apply_job_posting_changes(posting: JobPosting, changes: dict[str, Any]) -> None:
    if "title" in changes:
        title = str(changes["title"] or "").strip()
        if not title:
            raise RecruitingError("岗位名称不能为空", code="job_title_required")
        posting.title = title
    if "company_name" in changes:
        posting.company_name = str(changes["company_name"] or "").strip()
    if "department" in changes:
        posting.department = str(changes["department"] or "").strip()
    if "location" in changes:
        posting.location = str(changes["location"] or "").strip()
    if "employment_type" in changes:
        posting.employment_type = str(changes["employment_type"] or "").strip()
    if "salary_range" in changes:
        posting.salary_range = str(changes["salary_range"] or "").strip()
    if "headcount" in changes:
        headcount = changes["headcount"]
        posting.headcount = headcount if isinstance(headcount, int) and headcount > 0 else 1
    if "description" in changes:
        posting.description = str(changes["description"] or "")
    if "requirements" in changes:
        posting.requirements = str(changes["requirements"] or "")
    if "status" in changes:
        posting.status = normalize_job_status(str(changes["status"]))
    if "notes" in changes:
        posting.notes = str(changes["notes"] or "")


def _apply_candidate_changes(candidate: Candidate, changes: dict[str, Any]) -> None:
    if "name" in changes:
        name = str(changes["name"] or "").strip()
        if not name:
            raise RecruitingError("候选人姓名不能为空", code="candidate_name_required")
        candidate.name = name
    if "email" in changes:
        candidate.email = str(changes["email"] or "").strip()
    if "phone" in changes:
        candidate.phone = str(changes["phone"] or "").strip()
    if "source" in changes:
        candidate.source = str(changes["source"] or "").strip()
    if "headline" in changes:
        candidate.headline = str(changes["headline"] or "").strip()
    if "resume_id" in changes:
        raw_resume_id = changes["resume_id"]
        candidate.resume_id = raw_resume_id if isinstance(raw_resume_id, int) else None
    if "notes" in changes:
        candidate.notes = str(changes["notes"] or "")
