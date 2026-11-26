from uuid import UUID, uuid4

import pytest
from pydantic import ValidationError
from talentpulse_ai.modules.rag_chatbot.agent import build_agent_request

from talentpulse_ai.agent_foundation.contracts import AgentRequest
from talentpulse_ai.modules.rag_chatbot.schemas import (
    ExplicitFilters,
    IdentityFields,
    RagGenerateRequest,
    RagIntent,
    ServicePolicy,
    StructuredFilterState,
)


def make_request(
    *,
    history: list[str] | None = None,
    message: str = "CURRENT_TURN_SYNTHETIC",
    locale: str = "vi",
    intent: RagIntent = "JOB_SEARCH",
    session_id: UUID | None = None,
) -> RagGenerateRequest:
    return RagGenerateRequest(
        identity=IdentityFields(
            request_id=uuid4(),
            trace_id=uuid4(),
            operation_attempt_id=uuid4(),
            client_message_id=uuid4(),
            user_id=uuid4(),
            session_id=session_id or uuid4(),
        ),
        normalized_user_message=message,
        intent=intent,
        locale=locale,
        recent_history=history if history is not None else [],
        filter_state=StructuredFilterState(),
        explicit_filters=ExplicitFilters(),
        policy=ServicePolicy(data_scope="PUBLIC_ACTIVE_JOBS", max_candidates=20),
    )


def test_context_accepts_eight_history_entries_totaling_6000_characters() -> None:
    history = [f"TURN_{index}_" + "x" * 743 for index in range(8)]
    assert len(history) == 8
    assert sum(map(len, history)) == 6_000
    request = make_request(history=history)

    context = build_agent_request(request)

    assert isinstance(context, AgentRequest)
    assert context.capability_id == "rag.generate"
    for entry in history:
        assert entry in context.prompt
    assert request.normalized_user_message in context.prompt


def test_context_rejects_ninth_history_entry_even_below_character_limit() -> None:
    with pytest.raises(ValidationError, match="recent_history"):
        make_request(history=[f"turn-{index}" for index in range(9)])


def test_context_rejects_6001_history_characters_even_below_entry_limit() -> None:
    with pytest.raises(ValidationError, match="recent_history is too large"):
        make_request(history=["a" * 3_000, "b" * 3_001])


def test_context_preserves_supplied_chronological_history_before_current_turn() -> None:
    history = [
        "user: Z_FIRST_SYNTHETIC",
        "assistant: A_SECOND_SYNTHETIC",
        "user: M_THIRD_SYNTHETIC",
    ]
    request = make_request(history=history)

    context = build_agent_request(request)

    positions = [context.prompt.index(entry) for entry in history]
    assert positions == sorted(positions)
    assert positions[-1] < context.prompt.index(request.normalized_user_message)
    assert request.recent_history == history


@pytest.mark.parametrize("locale", ["vi", "en"])
def test_context_preserves_current_request_locale_in_foundation_request_and_prompt(
    locale: str,
) -> None:
    request = make_request(locale=locale)

    context = build_agent_request(request)

    assert isinstance(context, AgentRequest)
    assert context.locale == locale
    assert locale in context.prompt
    assert request.normalized_user_message in context.prompt


def test_context_does_not_reuse_history_when_next_request_omits_it_in_same_session() -> None:
    session_id = uuid4()
    first = make_request(history=["ONLY_FIRST_REQUEST_HISTORY"], session_id=session_id)
    second = make_request(message="ONLY_SECOND_REQUEST_TURN", session_id=session_id)

    first_context = build_agent_request(first)
    first_snapshot = first_context.model_dump(mode="json")
    second_context = build_agent_request(second)

    assert "ONLY_FIRST_REQUEST_HISTORY" in first_context.prompt
    assert "ONLY_FIRST_REQUEST_HISTORY" not in second_context.model_dump_json()
    assert first.normalized_user_message not in second_context.prompt
    assert second.normalized_user_message in second_context.prompt
    assert first_context.model_dump(mode="json") == first_snapshot


def test_context_uses_only_history_explicitly_supplied_for_next_turn() -> None:
    session_id = uuid4()
    first = make_request(history=["OMITTED_OLDER_HISTORY"], session_id=session_id)
    second = make_request(
        history=["SUPPLIED_USER_TURN", "SUPPLIED_ASSISTANT_TURN"],
        message="FOLLOWUP_CURRENT_TURN",
        session_id=session_id,
    )

    build_agent_request(first)
    context = build_agent_request(second)

    assert "OMITTED_OLDER_HISTORY" not in context.model_dump_json()
    assert first.normalized_user_message not in context.prompt
    for entry in second.recent_history:
        assert entry in context.prompt
    assert second.normalized_user_message in context.prompt


def test_context_does_not_share_history_between_sessions_for_same_user() -> None:
    first = make_request(history=["SESSION_A_PRIVATE_SYNTHETIC_HISTORY"])
    second = make_request(history=["SESSION_B_SYNTHETIC_HISTORY"])
    second.identity.user_id = first.identity.user_id
    assert first.identity.session_id != second.identity.session_id

    first_context = build_agent_request(first)
    second_context = build_agent_request(second)

    assert "SESSION_A_PRIVATE_SYNTHETIC_HISTORY" in first_context.prompt
    assert "SESSION_A_PRIVATE_SYNTHETIC_HISTORY" not in second_context.model_dump_json()
    assert "SESSION_B_SYNTHETIC_HISTORY" in second_context.prompt
    assert "SESSION_B_SYNTHETIC_HISTORY" not in first_context.model_dump_json()


def test_mode_change_uses_new_application_session_without_previous_context() -> None:
    # The application enforces fixed session mode before loading history. The
    # capability receives only the new session's already-validated request.
    first = make_request(intent="JOB_SEARCH", locale="vi", history=["OLD_MODE_SESSION_HISTORY"])
    second = make_request(intent="ADVICE", locale="en", message="NEW_MODE_CURRENT_TURN")
    second.identity.user_id = first.identity.user_id
    assert first.identity.session_id != second.identity.session_id

    first_context = build_agent_request(first)
    second_context = build_agent_request(second)

    assert "JOB_SEARCH" in first_context.prompt
    assert "ADVICE" in second_context.prompt
    assert second_context.locale == "en"
    assert second.normalized_user_message in second_context.prompt
    assert "OLD_MODE_SESSION_HISTORY" not in second_context.model_dump_json()
    assert first.normalized_user_message not in second_context.prompt
    assert first.recent_history == ["OLD_MODE_SESSION_HISTORY"]
