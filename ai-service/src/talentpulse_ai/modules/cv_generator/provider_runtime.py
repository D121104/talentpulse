from __future__ import annotations

import inspect
from collections import Counter
from collections.abc import Callable, Mapping
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeoutError
from dataclasses import dataclass, field
from functools import partial

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
    diagnostics: Counter[str] = field(default_factory=Counter)
    provider_call_count: int = 0
    provider_elapsed_seconds: float = 0.0
    provider_call_latencies_ms: list[float] = field(default_factory=list)
    provider_call_kinds: list[str] = field(default_factory=list)
    provider_timeout_kinds: list[str] = field(default_factory=list)

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
        remaining = deadline - self.clock()
        if remaining <= 0:
            self.mark("provider_deadline")
            raise TimeoutError("CV provider total deadline reached")
        self.provider_call_count += 1
        self.provider_call_kinds.append(call_kind)
        call_started = self.clock()
        try:
            return _provider_call(
                self.provider,
                prompt,
                schema,
                timeout=min(timeout, remaining),
                num_predict=num_predict,
            )
        except Exception as exc:
            if _is_timeout_exception(exc):
                self.provider_timeout_kinds.append(call_kind)
            raise
        finally:
            elapsed = self.clock() - call_started
            self.provider_elapsed_seconds += elapsed
            self.provider_call_latencies_ms.append(round(elapsed * 1000, 2))
