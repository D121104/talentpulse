from collections.abc import Callable

import pytest

from talentpulse_ai.agent_foundation.contracts import AgentRequest
from talentpulse_ai.agent_foundation.selector import CapabilityImplementationSelector
from talentpulse_ai.core.config import Settings


def make_selector(
    *,
    enabled: frozenset[str] = frozenset(),
    registered: frozenset[str] = frozenset(),
) -> CapabilityImplementationSelector:
    settings = Settings(
        environment="test",
        auth_required=False,
        agent_enabled_capabilities=enabled,
    )
    return CapabilityImplementationSelector(settings, registered)


def test_agent_capabilities_default_to_disabled() -> None:
    settings = Settings(_env_file=None)

    assert settings.agent_enabled_capabilities == frozenset()


def test_request_contract_does_not_expose_rollout_configuration() -> None:
    assert "agent_enabled_capabilities" not in AgentRequest.model_fields


def test_agent_capability_rollout_is_loaded_from_server_environment(monkeypatch) -> None:
    monkeypatch.setenv("AI_AGENT_ENABLED_CAPABILITIES", '["synthetic.search"]')

    settings = Settings(_env_file=None)

    assert settings.agent_enabled_capabilities == frozenset({"synthetic.search"})


def test_disabled_capability_selects_legacy() -> None:
    selector = make_selector(registered=frozenset({"synthetic.search"}))
    legacy = object()
    agent = object()

    selected = selector.select("synthetic.search", legacy=legacy, agent=agent)

    assert selected is legacy


def test_unregistered_capability_stays_legacy_even_when_flag_is_enabled() -> None:
    selector = make_selector(enabled=frozenset({"synthetic.search"}))
    legacy = object()

    selected = selector.select("synthetic.search", legacy=legacy, agent=object())

    assert selected is legacy


def test_enabled_registered_capability_selects_agent_without_affecting_others() -> None:
    selector = make_selector(
        enabled=frozenset({"synthetic.search"}),
        registered=frozenset({"synthetic.search", "synthetic.cv"}),
    )
    search_agent = object()
    search_legacy = object()
    cv_legacy = object()

    selected_search = selector.select(
        "synthetic.search", legacy=search_legacy, agent=search_agent
    )
    selected_cv = selector.select("synthetic.cv", legacy=cv_legacy, agent=object())

    assert selected_search is search_agent
    assert selected_cv is cv_legacy


def test_selected_agent_failure_does_not_retry_legacy_in_same_request() -> None:
    selector = make_selector(
        enabled=frozenset({"synthetic.search"}),
        registered=frozenset({"synthetic.search"}),
    )
    legacy_calls: list[bool] = []

    def legacy() -> str:
        legacy_calls.append(True)
        return "legacy"

    def agent() -> str:
        raise RuntimeError("agent failed")

    selected: Callable[[], str] = selector.select(
        "synthetic.search", legacy=legacy, agent=agent
    )
    with pytest.raises(RuntimeError, match="agent failed"):
        selected()

    assert legacy_calls == []


def test_disabling_flag_affects_only_the_next_selection() -> None:
    selector = make_selector(
        enabled=frozenset({"synthetic.search"}),
        registered=frozenset({"synthetic.search"}),
    )
    first_agent = object()
    first_legacy = object()
    selected_for_current_request = selector.select(
        "synthetic.search", legacy=first_legacy, agent=first_agent
    )

    selector.settings.agent_enabled_capabilities = frozenset()
    selected_for_next_request = selector.select(
        "synthetic.search", legacy=first_legacy, agent=first_agent
    )

    assert selected_for_current_request is first_agent
    assert selected_for_next_request is first_legacy
