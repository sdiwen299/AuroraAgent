"""Fixed read-only provider boundary manifest for mechanical source gates."""

NON_AGENT_PROVIDER_CALL_MANIFEST = (
    ("auroraagent/api.py", "test_settings_provider", 1),
    ("auroraagent/api.py", "_generate_conversation_title", 1),
    ("auroraagent/api.py", "_complete_json", 1),
    ("auroraagent/ai/interview_knowledge_capture.py", "generate_interview_knowledge_preview", 2),
    (
        "auroraagent/ai/interview_preparation_proposals.py",
        "generate_interview_preparation_proposal",
        2,
    ),
    ("auroraagent/ai/interview_review_proposals.py", "_complete_interview_review_model", 2),
    ("auroraagent/ai/interview_stories.py", "generate_interview_story_proposal", 1),
    ("auroraagent/ai/material_proposals.py", "generate_material_proposal", 1),
    ("auroraagent/ai/mock_interview.py", "generate_question", 2),
    ("auroraagent/ai/mock_interview.py", "_complete_feedback", 2),
    ("auroraagent/ai/offer_negotiation.py", "generate_offer_negotiation_proposal", 1),
    ("auroraagent/ai/opportunity_fit_reviews.py", "_generate", 1),
    ("auroraagent/ai/workflows.py", "complete_json", 1),
)

RAW_PROVIDER_BOUNDARIES = (
    ("auroraagent/ai/client.py", "ConfiguredAIClient", "_complete_with_provider"),
    ("auroraagent/ai/client.py", "ConfiguredAIClient", "_stream_with_provider"),
    (
        "auroraagent/knowledge/provider.py",
        "LiteLLMKnowledgeBriefProviderClient",
        "complete_once",
    ),
    (
        "auroraagent/context_projector/gateway.py",
        "SingleCandidateAgentTransport",
        "complete_one",
    ),
    (
        "auroraagent/context_projector/gateway.py",
        "SingleCandidateAgentTransport",
        "stream_one",
    ),
)

assert len(NON_AGENT_PROVIDER_CALL_MANIFEST) == 13
assert sum(item[2] for item in NON_AGENT_PROVIDER_CALL_MANIFEST) == 18
assert len(RAW_PROVIDER_BOUNDARIES) == 5

