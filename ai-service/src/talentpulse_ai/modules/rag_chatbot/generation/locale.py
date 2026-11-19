from __future__ import annotations

from typing import Literal

from talentpulse_ai.modules.rag_chatbot.schemas import RagGenerateRequest

OutputLocale = Literal["en", "vi"]


def _requested_locale(value: str) -> OutputLocale | None:
    language = value.casefold().split("-", 1)[0]
    if language in {"en", "vi"}:
        return language  # type: ignore[return-value]
    return None


def _effective_locale(request: RagGenerateRequest) -> OutputLocale:
    # The caller/session locale is authoritative; unsupported locales default to English.
    return _requested_locale(request.locale) or "en"
