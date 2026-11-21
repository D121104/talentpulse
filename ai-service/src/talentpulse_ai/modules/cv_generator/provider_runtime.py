from __future__ import annotations

import inspect
from collections import Counter
from collections.abc import Callable, Mapping
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeoutError
from dataclasses import dataclass, field
from functools import partial
from typing import cast
from uuid import UUID

from talentpulse_ai.core.exceptions import (
    ProviderFailure,
    ProviderFailureDetails,
    ProviderName,
    provider_failure_details,
)
from talentpulse_ai.core.logging import log_ai_provider_failure
from talentpulse_ai.modules.rag_chatbot.schemas import GenerationProvider


def _is_timeout_exception(exc: BaseException) -> bool:
    """Recognize sanitized provider failures whose cause was a timeout."""
    current: BaseException | None = exc
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        if isinstance(current, TimeoutError):
            return True
        cause = current.__cause__ or current.__context__
        current = cause if isinstance(cause, BaseException) else None
    return False


def _provider_call(
    provider: GenerationProvider,
    prompt: str,
    schema: object,
    *,
    timeout: float | None = None,
    num_predict: int | None = None,
) -> object:
    """Invoke a provider while preserving compatibility with older adapters.

    The optional timeout is enforced locally as well as forwarded to adapters that expose
    it. ``num_predict`` is an Ollama-specific optional bound; providers that do not expose
    that keyword continue to receive the original prompt/schema contract. A worker thread
    is not joined after timeout, so a stuck provider cannot consume the remaining deadline;
    cancellation is therefore best-effort at the provider boundary.
    """
    method = getattr(provider, "generate_structured", None)
    if callable(method):
        parameters: Mapping[str, inspect.Parameter]
        try:
            parameters = inspect.signature(method).parameters
        except (TypeError, ValueError):
            parameters = {}
        accepts_timeout = "timeout" in parameters
        accepts_num_predict = "num_predict" in parameters

        kwargs: dict[str, object] = {}
        if timeout is not None and accepts_timeout:
            kwargs["timeout"] = timeout
        if num_predict is not None and accepts_num_predict:
            kwargs["num_predict"] = num_predict
        invoke = partial(method, prompt, schema, **kwargs)
    else:
        invoke = partial(provider.generate, prompt)

    if timeout is None:
        return invoke()

    executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="cv-provider")
    future = executor.submit(invoke)
    try:
        return future.result(timeout=timeout)
    except FutureTimeoutError as exc:
        future.cancel()
        raise TimeoutError("provider call exceeded its bounded timeout") from exc
    finally:
        executor.shutdown(wait=False, cancel_futures=True)


@dataclass(frozen=True)
class ProviderLimits:
    total_timeout_seconds: float
    core_timeout_seconds: float
    chunk_timeout_seconds: float
    repair_timeout_seconds: float
    max_provider_calls: int


@dataclass
class ProviderRuntime:
    provider: GenerationProvider
    limits: ProviderLimits
    clock: Callable[[], float]
    started_at: float
    request_id: UUID | None = None
    trace_id: UUID | None = None
    diagnostics: Counter[str] = field(default_factory=Counter)
    provider_call_count: int = 0
    provider_elapsed_seconds: float = 0.0
    provider_call_latencies_ms: list[float] = field(default_factory=list)
    provider_call_kinds: list[str] = field(default_factory=list)
    provider_timeout_kinds: list[str] = field(default_factory=list)
    last_provider_call_index: int | None = None
    last_provider_call_kind: str | None = None
    last_provider_call_duration_ms: int | None = None

    @property
    def total_deadline(self) -> float:
        return self.started_at + self.limits.total_timeout_seconds

    def mark(self, code: str, amount: int = 1) -> None:
        self.diagnostics[code] += amount

    def invoke(
        self,
        prompt: str,
        schema: object,
        *,
        deadline: float,
        timeout: float,
        call_kind: str,
        num_predict: int | None = None,
    ) -> object:
        if self.provider_call_count >= self.limits.max_provider_calls:
            self.mark("provider_call_cap")
            raise TimeoutError("CV provider call cap reached")
        deadline = min(deadline, self.total_deadline)
        remaining = deadline - self.clock()
        if remaining <= 0:
            self.mark("provider_deadline")
            raise TimeoutError("CV provider total deadline reached")
        self.provider_call_count += 1
        self.provider_call_kinds.append(call_kind)
        self.last_provider_call_index = self.provider_call_count
        self.last_provider_call_kind = call_kind
        call_started = self.clock()
        try:
            output = _provider_call(
                self.provider,
                prompt,
                schema,
                timeout=min(timeout, remaining),
                num_predict=num_predict,
            )
            if self.clock() >= deadline:
                self.mark("provider_deadline")
                raise TimeoutError("CV provider total deadline reached")
            return output
        except Exception as exc:
            if _is_timeout_exception(exc):
                self.provider_timeout_kinds.append(call_kind)
            self._log_provider_failure(
                exc,
                call_kind=call_kind,
                attempt_index=self.provider_call_count,
                duration_ms=round((self.clock() - call_started) * 1000),
            )
            raise
        finally:
            elapsed = self.clock() - call_started
            self.provider_elapsed_seconds += elapsed
            duration_ms = max(0, round(elapsed * 1000))
            self.last_provider_call_duration_ms = duration_ms
            self.provider_call_latencies_ms.append(round(elapsed * 1000, 2))

    def log_invalid_output(self, exception_type: str) -> None:
        call_kind = self.last_provider_call_kind
        attempt_index = self.last_provider_call_index
        provider_name = getattr(self.provider, "provider_name", None)
        if (
            call_kind is None
            or attempt_index is None
            or not isinstance(provider_name, str)
            or provider_name not in {"gemini", "bedrock", "ollama", "cohere", "qdrant"}
        ):
            return
        model_name = getattr(self.provider, "model_name", None)
        try:
            details = ProviderFailureDetails(
                provider=cast(ProviderName, provider_name),
                model=model_name if isinstance(model_name, str) else None,
                category="invalid_output",
                exception_type=exception_type,
                duration_ms=self.last_provider_call_duration_ms,
            )
        except ValueError:
            return
        log_ai_provider_failure(
            details=details,
            capability="cv_generation",
            operation="localize" if call_kind.startswith("localization") else "generate",
            attempt="repair" if "repair" in call_kind else "initial",
            request_id=self.request_id,
            trace_id=self.trace_id,
            attempt_index=attempt_index,
        )

    def _log_provider_failure(
        self,
        exc: Exception,
        *,
        call_kind: str,
        attempt_index: int,
        duration_ms: int,
    ) -> None:
        details: ProviderFailureDetails | None = (
            exc.details if isinstance(exc, ProviderFailure) else None
        )
        if details is None:
            provider_name = getattr(self.provider, "provider_name", None)
            if not isinstance(provider_name, str) or provider_name not in {
                "gemini",
                "bedrock",
                "ollama",
                "cohere",
                "qdrant",
            }:
                return
            model_name = getattr(self.provider, "model_name", None)
            try:
                details = provider_failure_details(
                    exc,
                    provider=cast(ProviderName, provider_name),
                    model=model_name if isinstance(model_name, str) else None,
                    duration_ms=duration_ms,
                )
            except ValueError:
                return
        log_ai_provider_failure(
            details=details,
            capability="cv_generation",
            operation="localize" if call_kind.startswith("localization") else "generate",
            attempt="repair" if "repair" in call_kind else "initial",
            request_id=self.request_id,
            trace_id=self.trace_id,
            attempt_index=attempt_index,
        )
