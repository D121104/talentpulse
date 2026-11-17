from __future__ import annotations

from typing import TypeVar

from talentpulse_ai.core.config import Settings

Implementation = TypeVar("Implementation")


class CapabilityImplementationSelector:
    """Choose one server-registered implementation for each new capability request."""

    def __init__(
        self,
        settings: Settings,
        registered_capabilities: frozenset[str] = frozenset(),
    ) -> None:
        self.settings = settings
        self._registered_capabilities = registered_capabilities

    def select(
        self,
        capability_id: str,
        *,
        legacy: Implementation,
        agent: Implementation | None = None,
    ) -> Implementation:
        if (
            capability_id in self.settings.agent_enabled_capabilities
            and capability_id in self._registered_capabilities
            and agent is not None
        ):
            return agent
        return legacy
