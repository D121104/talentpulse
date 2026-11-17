from __future__ import annotations

import json
from collections.abc import Mapping
from typing import cast

from pydantic import BaseModel, TypeAdapter, ValidationError

from talentpulse_ai.agent_foundation.contracts import (
    AgentErrorCode,
    ModelDecision,
    parse_model_decision,
)
from talentpulse_ai.modules.rag_chatbot.schemas import GenerationProvider


class AgentModelError(RuntimeError):
    def __init__(self, code: AgentErrorCode, safe_message: str) -> None:
        super().__init__(safe_message)
        self.code = code
        self.safe_message = safe_message


class AgentModelAdapter:
    """Normalize existing generation providers into validated agent decisions."""

    def __init__(self, provider: GenerationProvider) -> None:
        self._provider = provider
        self._decision_adapter: TypeAdapter[ModelDecision] = TypeAdapter(ModelDecision)

    def decide(self, prompt: str, *, timeout: float | None = None) -> ModelDecision:
        generate_structured = getattr(self._provider, "generate_structured", None)
        try:
            if callable(generate_structured):
                raw = generate_structured(
                    prompt,
                    cast(Mapping[str, object], self._decision_adapter.json_schema()),
                    timeout,
                )
            else:
                raw = self._provider.generate(prompt)
        except Exception:
            raise AgentModelError(
                AgentErrorCode.PROVIDER_ERROR,
                "Model provider request failed.",
            ) from None

        try:
            if isinstance(raw, str):
                raw = json.loads(raw)
            elif isinstance(raw, BaseModel):
                raw = raw.model_dump(mode="python")
            return parse_model_decision(raw)
        except (json.JSONDecodeError, TypeError, ValueError, ValidationError):
            raise AgentModelError(
                AgentErrorCode.OUTPUT_INVALID,
                "Model returned an invalid decision.",
            ) from None
