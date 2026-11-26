from talentpulse_ai.agent_foundation.selector import CapabilityImplementationSelector
from talentpulse_ai.core.config import Settings
from talentpulse_ai.modules.rag_chatbot.schemas import RagGenerateRequest


def test_unregistered_or_disabled_capability_selects_legacy() -> None:
    legacy = object()
    agent = object()
    settings = Settings(environment="test", agent_enabled_capabilities=frozenset())
    selector = CapabilityImplementationSelector(settings, frozenset({"rag.generate"}))

    assert selector.select("rag.generate", legacy=legacy, agent=agent) is legacy


def test_only_registered_capability_with_server_flag_selects_agent() -> None:
    legacy = object()
    agent = object()
    settings = Settings(environment="test", agent_enabled_capabilities=frozenset({"rag.generate"}))
    selector = CapabilityImplementationSelector(settings, frozenset({"rag.generate"}))

    assert selector.select("rag.generate", legacy=legacy, agent=agent) is agent


def test_enabled_but_unregistered_capability_selects_legacy() -> None:
    legacy = object()
    agent = object()
    settings = Settings(environment="test", agent_enabled_capabilities=frozenset({"rag.generate"}))
    selector = CapabilityImplementationSelector(settings)

    assert selector.select("rag.generate", legacy=legacy, agent=agent) is legacy


def test_client_request_schema_cannot_override_implementation_selection() -> None:
    assert "implementation" not in RagGenerateRequest.model_fields
    assert "agent_enabled_capabilities" not in RagGenerateRequest.model_fields
