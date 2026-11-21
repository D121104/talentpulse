from unittest.mock import Mock

import pytest
from tests.cv_payload import draft_payload

from talentpulse_ai.core.exceptions import ServiceError
from talentpulse_ai.modules.cv_generator import provider_runtime
from talentpulse_ai.modules.cv_generator.provider_runtime import ProviderLimits, ProviderRuntime
from talentpulse_ai.modules.cv_generator.schemas import CvDraftRequest
from talentpulse_ai.modules.cv_generator.service import CvDraftGenerationService


def runtime(clock, *, total=300.0):
    return ProviderRuntime(
        provider=Mock(),
        limits=ProviderLimits(total, 600.0, 600.0, 600.0, 12),
        clock=clock,
        started_at=0.0,
    )


def test_provider_receives_only_remaining_operation_time(monkeypatch):
    now = [240.0]
    call = Mock(return_value={"safe": "result"})
    monkeypatch.setattr(provider_runtime, "_provider_call", call)
    execution = runtime(lambda: now[0])

    execution.invoke("synthetic", dict, deadline=300.0, timeout=600.0, call_kind="core")
    now[0] = 290.0
    execution.invoke("synthetic", dict, deadline=300.0, timeout=600.0, call_kind="repair")

    assert [item.kwargs["timeout"] for item in call.call_args_list] == [60.0, 10.0]


def test_expired_operation_never_calls_provider(monkeypatch):
    call = Mock()
    monkeypatch.setattr(provider_runtime, "_provider_call", call)
    execution = runtime(lambda: 300.0)

    with pytest.raises(TimeoutError):
        execution.invoke("synthetic", dict, deadline=300.0, timeout=600.0, call_kind="core")

    call.assert_not_called()


def test_provider_cannot_expand_runtime_deadline_with_a_longer_phase_deadline(monkeypatch):
    call = Mock(return_value={})
    monkeypatch.setattr(provider_runtime, "_provider_call", call)
    execution = runtime(lambda: 290.0)

    execution.invoke("synthetic", dict, deadline=600.0, timeout=600.0, call_kind="repair")

    assert call.call_args.kwargs["timeout"] == 10.0


def test_provider_output_arriving_at_deadline_is_not_accepted(monkeypatch):
    now = [299.0]

    def late_provider(*args, **kwargs):
        now[0] = 300.0
        return {"late": "output"}

    monkeypatch.setattr(provider_runtime, "_provider_call", late_provider)
    execution = runtime(lambda: now[0])

    with pytest.raises(TimeoutError):
        execution.invoke("synthetic", dict, deadline=300.0, timeout=600.0, call_kind="core")


def test_provider_call_cap_remains_subordinate_to_operation_deadline(monkeypatch):
    call = Mock(return_value={})
    monkeypatch.setattr(provider_runtime, "_provider_call", call)
    execution = runtime(lambda: 0.0)
    for _ in range(12):
        execution.invoke("synthetic", dict, deadline=300.0, timeout=600.0, call_kind="core")

    with pytest.raises(TimeoutError):
        execution.invoke("synthetic", dict, deadline=300.0, timeout=600.0, call_kind="repair")

    assert call.call_count == 12


def test_exhausted_review_budget_stops_before_provider():
    provider = Mock()
    service = CvDraftGenerationService(provider)
    request = CvDraftRequest.model_validate(draft_payload())

    with pytest.raises(ServiceError) as error:
        service.generate_with_review(request, timeout_seconds=0.0)

    assert error.value.status_code == 504
    provider.generate_structured.assert_not_called()


def test_service_caps_every_provider_phase_to_the_remaining_budget(monkeypatch):
    from talentpulse_ai.modules.cv_generator import service as service_module

    class CapturedRuntime(Exception):
        pass

    def capture_core(request, experience, projects, execution, *args):
        assert execution.total_deadline == 117.0
        assert execution.limits.total_timeout_seconds == 17.0
        assert execution.limits.core_timeout_seconds <= 17.0
        assert execution.limits.chunk_timeout_seconds <= 17.0
        assert execution.limits.repair_timeout_seconds <= 17.0
        assert execution.limits.max_provider_calls == 12
        assert service_module._MAX_REPAIR_CALLS == 1
        raise CapturedRuntime

    monkeypatch.setattr(service_module, "monotonic", lambda: 100.0)
    monkeypatch.setattr(service_module, "generate_core", capture_core)
    service = CvDraftGenerationService(Mock())

    with pytest.raises(CapturedRuntime):
        service.generate_with_review(
            CvDraftRequest.model_validate(draft_payload()), timeout_seconds=17.0
        )
