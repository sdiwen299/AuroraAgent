from __future__ import annotations

from auroraagent.config import Config
from auroraagent.repositories.applications import ApplicationsRepository
from auroraagent.repositories.chat import ChatRepository
from auroraagent.repositories.resumes import ResumesRepository


def onboarding_payload(
    config: Config,
    applications: ApplicationsRepository,
    resumes: ResumesRepository,
    chat: ChatRepository,
) -> dict[str, object]:
    steps = {
        "configure_ai": any(
            provider.enabled and bool(provider.api_key)
            for provider in config.provider_profiles()
        ),
        "create_primary_resume": resumes.count_active_masters() > 0,
        "create_first_application": bool(applications.list()),
        "send_first_pilot_message": chat.has_user_message(),
    }
    completed_count = sum(1 for completed in steps.values() if completed)
    return {
        "steps": steps,
        "completed_count": completed_count,
        "is_complete": completed_count == len(steps),
        "force_open": config.onboarding_force_open,
    }
