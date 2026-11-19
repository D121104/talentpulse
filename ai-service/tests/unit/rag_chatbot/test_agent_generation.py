"""T012: job-output safety contracts for T014/T031 (intentionally RED)."""

import json
from copy import deepcopy
from importlib import import_module
from uuid import uuid4

import pytest
from pydantic import TypeAdapter
from tests.unit.rag_chatbot.test_rag import generate_request, job

from talentpulse_ai.agent_foundation.contracts import (
    ExecutionPolicy,
    FinalDecision,
    ModelDecision,
    UnstructuredTextResponse,
)
from talentpulse_ai.agent_foundation.model import AgentModelAdapter
from talentpulse_ai.core.exceptions import ProviderFailure, ServiceError
from talentpulse_ai.modules.rag_chatbot.generation.citations import parse_and_validate
from talentpulse_ai.modules.rag_chatbot.generation.generator import GenerationService
from talentpulse_ai.modules.rag_chatbot.schemas import (
    AuthorizedCvSnapshot,
    ProviderGeneration,
    StructuredFilterState,
)


class ScriptedModel:
    """Only the nondeterministic model boundary is replaced."""

    def __init__(self, *outputs: dict | Exception) -> None:
        self.outputs = list(outputs)
        self.prompts: list[str] = []

    def decide(
        self, prompt: str, *, timeout: float | None = None, **kwargs: object
    ) -> ModelDecision:
        del kwargs
        self.prompts.append(prompt)
        assert timeout is not None and timeout > 0
        assert self.outputs, "generation exceeded the scripted single-repair allowance"
        output = self.outputs.pop(0)
        if isinstance(output, Exception):
            raise output
        return FinalDecision(output=deepcopy(output))


@pytest.fixture
def agent_module():
    return import_module("talentpulse_ai.modules.rag_chatbot.agent")


@pytest.fixture
def grounded():
    canonical = job()
    request = generate_request(
        jobs=[canonical],
        evidence=[
            {
                "job_id": canonical["job_id"],
                "rank": 1,
                "score": 0.8,
                "citation_key": "job:1",
            }
        ],
    )
    request.filter_state = StructuredFilterState(
        location="Remote",
        skills=["Python"],
        salary_min=1000,
    )
    context = request.canonical_active_job_context[0]
    output = ProviderGeneration(
        answer_blocks=[{"kind": "INFERENCE", "text": "Python Engineer at Acme is remote."}],
        claims=GenerationService._canonical_job_claims(context, "job:1"),
        citation_keys=["job:1"],
        referenced_job_ids=[context.job_id],
    ).model_dump(mode="json")
    return request, output


def assert_safe(response, request, *, empty=False):
    assert response.answer_status in ({"NO_EVIDENCE"} if empty else {"DEGRADED", "NO_EVIDENCE"})
    assert response.filters == request.filter_state
    assert response.state_delta == {}
    assert response.source == "deterministic_fallback"
    if empty:
        assert response.claims == response.citation_keys == response.referenced_job_ids == []
    else:
        parse_and_validate(
            response.model_dump(
                include={
                    "answer_blocks",
                    "claims",
                    "citation_keys",
                    "referenced_job_ids",
                }
            ),
            request,
        )


@pytest.mark.parametrize("filtered", [False, True], ids=["empty-index", "filtered-out"])
def test_empty_evidence_is_no_evidence_not_provider_success(agent_module, filtered):
    request = generate_request()
    if filtered:
        request.filter_state = StructuredFilterState(location="Nowhere", skills=["Rust"])
    model = ScriptedModel(
        {
            "answer_blocks": [{"kind": "REFUSAL", "text": "No matching jobs were found."}],
            "claims": [],
            "citation_keys": [],
            "referenced_job_ids": [],
        }
    )

    response = agent_module.CareerChatAgent(model=model).generate(request)

    assert_safe(response, request, empty=True)


@pytest.mark.parametrize("stage", ["retrieval", "canonical_hydration"])
def test_context_failure_is_not_reported_as_empty_search(agent_module, monkeypatch, stage):
    # Neither dependency failure may be flattened into a successful empty search.
    request = generate_request()

    def unavailable(*args, **kwargs):
        raise ProviderFailure(f"{stage} unavailable")

    monkeypatch.setattr(agent_module, "execute_agent", unavailable)
    try:
        response = agent_module.CareerChatAgent(model=ScriptedModel()).generate(request)
    except (ServiceError, ProviderFailure):
        pass
    else:
        assert response.answer_status == "DEGRADED"
        assert response.degraded is True
        assert response.claims == response.citation_keys == response.referenced_job_ids == []


def test_supported_claims_and_filter_state_survive_finalization(agent_module, grounded):
    request, output = grounded
    before = request.model_dump(mode="json")
    expected = parse_and_validate(output, request)
    model = ScriptedModel(output)

    response = agent_module.CareerChatAgent(model=model).generate(request)

    assert response.answer_status == "COMPLETE"
    assert response.claims == expected.claims
    assert response.citation_keys == expected.citation_keys
    assert response.referenced_job_ids == expected.referenced_job_ids
    assert response.filters == request.filter_state
    assert response.state_delta == {}
    assert request.model_dump(mode="json") == before
    assert len(model.prompts) == 1


class ScriptedStructuredProvider:
    """Replace provider I/O while retaining decision parsing and grounding validation."""

    def __init__(self, *outputs):
        self.outputs = list(outputs)
        self.calls = []
        self.unstructured_calls = []

    def generate_structured(self, prompt, schema, timeout=None):
        self.calls.append((prompt, deepcopy(schema), timeout))
        assert self.outputs, "provider exceeded the single-repair allowance"
        output = self.outputs.pop(0)
        if isinstance(output, Exception):
            raise output
        return deepcopy(output)

    def generate(self, prompt):
        self.unstructured_calls.append(prompt)
        raise AssertionError("structured output must not use plain generation")

    def generate_with_timeout(self, prompt, *, timeout):
        self.unstructured_calls.append(prompt)
        raise AssertionError("structured output must not use bounded plain generation")


def assert_structured_calls(provider, count):
    assert len(provider.calls) == count
    assert provider.unstructured_calls == []
    expected_schema = TypeAdapter(ModelDecision).json_schema()
    for prompt, schema, timeout in provider.calls:
        assert prompt
        assert schema == expected_schema
        assert timeout is not None and timeout > 0
    if count == 2:
        assert provider.calls[1][0] != provider.calls[0][0]
        assert provider.calls[1][2] <= provider.calls[0][2]


@pytest.mark.parametrize("representation", ["mapping", "json", "model"])
def test_generation_provider_uses_structured_decision_schema(
    agent_module, grounded, representation
):
    request, output = grounded
    decision = FinalDecision(output=output)
    raw = {
        "mapping": decision.model_dump(mode="json"),
        "json": decision.model_dump_json(),
        "model": decision,
    }[representation]
    provider = ScriptedStructuredProvider(raw)

    response = agent_module.CareerChatAgent(model=AgentModelAdapter(provider)).generate(request)

    assert response.answer_status == "COMPLETE"
    assert response.claims == parse_and_validate(output, request).claims
    assert response.citation_keys == ["job:1"]
    assert response.filters == request.filter_state
    assert response.state_delta == {}
    assert_structured_calls(provider, 1)


def test_bedrock_cv_plain_text_is_recovered_only_after_authorized_retrieval(agent_module):
    class BedrockProvider:
        provider_name = "bedrock"
        supports_structured_outputs = True

        def __init__(self) -> None:
            self.prompts: list[str] = []
            self.responses = [
                {
                    "kind": "tool_call",
                    "output": None,
                    "tool_id": "rag.retrieve_context",
                },
                UnstructuredTextResponse(
                    "The CV demonstrates backend experience and should quantify project impact."
                ),
            ]

        def generate_structured(self, prompt, schema, timeout=None):
            self.prompts.append(prompt)
            return self.responses.pop(0)

    cv_text = "SYNTHETIC_AUTHORIZED_CV_CONTEXT"
    request = generate_request().model_copy(
        update={
            "intent": "CV_ANALYSIS",
            "authorized_cv_snapshot": AuthorizedCvSnapshot(
                cv_id=uuid4(),
                content_hash="a" * 64,
                sanitized_text=cv_text,
                consent_version="synthetic-v1",
            ),
            "consent_version": "synthetic-v1",
        }
    )
    provider = BedrockProvider()

    response = agent_module.CareerChatAgent(model=AgentModelAdapter(provider)).generate(request)

    assert response.source == "llm"
    assert response.degraded is False
    assert "backend experience" in response.answer_blocks[0].text
    assert len(provider.prompts) == 2
    assert cv_text not in provider.prompts[0]
    assert cv_text in provider.prompts[1]
    assert provider.responses == []


@pytest.mark.parametrize("invalid_kind", ["json", "decision-schema"])
def test_structured_provider_invalid_output_is_repaired_exactly_once(
    agent_module, grounded, invalid_kind
):
    request, output = grounded
    invalid = {
        "json": "not JSON",
        "decision-schema": {"kind": "final", "output": []},
    }[invalid_kind]
    provider = ScriptedStructuredProvider(invalid, {"kind": "final", "output": output})

    response = agent_module.CareerChatAgent(model=AgentModelAdapter(provider)).generate(request)

    assert response.answer_status == "COMPLETE"
    assert response.claims == parse_and_validate(output, request).claims
    assert response.citation_keys == ["job:1"]
    assert_structured_calls(provider, 2)


@pytest.mark.parametrize("repair_kind", ["json", "provider-failure"])
def test_structured_provider_failed_repair_never_makes_a_third_call(
    agent_module, grounded, repair_kind
):
    request, output = grounded
    repair = {
        "json": "still not JSON",
        "provider-failure": ProviderFailure("synthetic repair failure"),
    }[repair_kind]
    # A valid third result makes an accidental extra attempt observable even if caught.
    provider = ScriptedStructuredProvider(
        json.dumps({"kind": "final", "output": {"answer_blocks": []}}),
        repair,
        {"kind": "final", "output": output},
    )

    agent = agent_module.CareerChatAgent(model=AgentModelAdapter(provider))
    if repair_kind == "provider-failure":
        response = agent.generate(request)
        assert response.answer_status == "DEGRADED"
        assert response.fallbackReason == "provider_error"
    else:
        with pytest.raises(ServiceError) as error:
            agent.generate(request)
        assert error.value.code == "generation_unavailable"
        assert error.value.status_code == 503
    assert_structured_calls(provider, 2)
    assert len(provider.outputs) == 1


def test_exact_duplicate_citations_are_deduplicated_everywhere(agent_module, grounded):
    request, output = grounded
    output["citation_keys"] *= 2
    for claim in output["claims"]:
        claim["citation_keys"] *= 2
    response = agent_module.CareerChatAgent(model=ScriptedModel(output)).generate(request)

    assert response.citation_keys == ["job:1"]
    assert response.claims
    assert all(claim.citation_keys == ["job:1"] for claim in response.claims)
    parse_and_validate(
        response.model_dump(
            include={
                "answer_blocks",
                "claims",
                "citation_keys",
                "referenced_job_ids",
            }
        ),
        request,
    )


def corrupt(output, kind):
    value = deepcopy(output)
    if kind in {"malformed", "unknown"}:
        key = "job:1\nforged" if kind == "malformed" else "job:999"
        value["citation_keys"] = [key]
        value["claims"][0]["citation_keys"] = [key]
    elif kind == "unpaired":
        value["referenced_job_ids"] = []
    elif kind == "undeclared-claim":
        value["citation_keys"] = []
    elif kind == "cross-job":
        value["claims"][0]["citation_keys"] = ["job:2"]
    return value


def test_model_cannot_override_application_owned_grounding_metadata(agent_module, grounded):
    request, output = grounded
    supplied_by_model = corrupt(output, "unknown")
    model = ScriptedModel(supplied_by_model)

    response = agent_module.CareerChatAgent(model=model).generate(request)

    assert len(model.prompts) == 1
    assert response.claims == parse_and_validate(output, request).claims
    assert response.citation_keys == ["job:1"]
    assert response.referenced_job_ids == [request.retrieval_evidence[0].job_id]


@pytest.mark.parametrize("repair_error", [False, True], ids=["invalid-again", "provider-failure"])
def test_failed_single_repair_returns_safe_fallback_or_controlled_error(
    agent_module,
    grounded,
    repair_error,
):
    request, output = grounded
    invalid = {"answer_blocks": []}
    model = ScriptedModel(
        invalid, ProviderFailure("repair unavailable") if repair_error else invalid
    )
    try:
        response = agent_module.CareerChatAgent(model=model).generate(request)
    except (ServiceError, ProviderFailure):
        pass
    else:
        assert_safe(response, request)
    assert len(model.prompts) == 2


def test_no_remaining_model_budget_does_not_attempt_repair(agent_module, monkeypatch, grounded):
    request, output = grounded
    monkeypatch.setattr(
        agent_module,
        "_EXECUTION_POLICY",
        ExecutionPolicy(
            max_steps=8,
            max_model_calls=1,
            max_tool_calls=2,
            timeout_seconds=24,
        ),
    )
    model = ScriptedModel({"answer_blocks": []})
    try:
        response = agent_module.CareerChatAgent(model=model).generate(request)
    except (ServiceError, ProviderFailure):
        pass
    else:
        assert_safe(response, request)
    assert len(model.prompts) == 1
