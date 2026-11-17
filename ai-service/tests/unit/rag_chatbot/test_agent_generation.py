"""T012: job-output safety contracts for T014/T031 (intentionally RED)."""

from copy import deepcopy
from importlib import import_module

import pytest
from tests.unit.rag_chatbot.test_rag import generate_request, job

from talentpulse_ai.agent_foundation.contracts import (
    ExecutionPolicy,
    FinalDecision,
    ModelDecision,
)
from talentpulse_ai.core.exceptions import ProviderFailure, ServiceError
from talentpulse_ai.modules.rag_chatbot.generation.citations import parse_and_validate
from talentpulse_ai.modules.rag_chatbot.generation.generator import GenerationService
from talentpulse_ai.modules.rag_chatbot.schemas import (
    ProviderGeneration,
    StructuredFilterState,
)


class ScriptedModel:
    """Only the nondeterministic model boundary is replaced."""

    def __init__(self, *outputs: dict | Exception) -> None:
        self.outputs = list(outputs)
        self.prompts: list[str] = []

    def decide(self, prompt: str, *, timeout: float | None = None) -> ModelDecision:
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


@pytest.mark.parametrize(
    "kind",
    [
        "malformed",
        "unknown",
        "unpaired",
        "undeclared-claim",
        "cross-job",
    ],
)
def test_invalid_citation_requires_one_repair_before_acceptance(agent_module, grounded, kind):
    request, output = grounded
    if kind == "cross-job":
        second = job()
        request = generate_request(
            jobs=[item.model_dump() for item in request.canonical_active_job_context] + [second],
            evidence=[item.model_dump() for item in request.retrieval_evidence]
            + [
                {
                    "job_id": second["job_id"],
                    "rank": 2,
                    "score": 0.7,
                    "citation_key": "job:2",
                }
            ],
        )
    invalid = corrupt(output, kind)
    if kind == "cross-job":
        # Both keys/jobs are legitimate and declared; only the claim pairing is wrong.
        invalid["citation_keys"].append("job:2")
        invalid["referenced_job_ids"].append(str(second["job_id"]))
    # Verify the fixture actually violates the existing deterministic contract.
    with pytest.raises(ValueError):
        parse_and_validate(invalid, request)
    model = ScriptedModel(invalid, output)

    response = agent_module.CareerChatAgent(model=model).generate(request)

    assert len(model.prompts) == 2
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
    invalid = corrupt(output, "unknown")
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
    model = ScriptedModel(corrupt(output, "unknown"))
    try:
        response = agent_module.CareerChatAgent(model=model).generate(request)
    except (ServiceError, ProviderFailure):
        pass
    else:
        assert_safe(response, request)
    assert len(model.prompts) == 1
