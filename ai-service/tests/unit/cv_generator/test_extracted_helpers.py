from __future__ import annotations

import ast
from pathlib import Path

from tests.cv_payload import draft_payload

from talentpulse_ai.modules import cv_generator
from talentpulse_ai.modules.cv_generator.draft_builder import _missing_indices
from talentpulse_ai.modules.cv_generator.localization import _localization_batches
from talentpulse_ai.modules.cv_generator.schemas import CvDraftRequest


def test_production_cv_generator_has_no_nested_function_definitions() -> None:
    nested = []
    for path in sorted(Path(cv_generator.__file__).parent.rglob("*.py")):
        tree = ast.parse(path.read_text())
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                nested.extend(
                    f"{path.name}:{child.lineno}:{child.name}"
                    for child in ast.walk(node)
                    if child is not node
                    and isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef))
                )
    assert nested == []


def test_missing_indices_observes_current_bullet_maps_without_mutating_request() -> None:
    request = CvDraftRequest.model_validate(draft_payload())
    original = request.model_dump()
    experience: dict[int, list[str]] = {}
    projects: dict[int, list[str]] = {}
    selected_experience = list(range(len(request.candidate.experience)))
    selected_projects = list(range(len(request.candidate.projects)))
    before = _missing_indices(request, selected_experience, selected_projects, experience, projects)
    assert before[0]
    index = before[0][0]
    experience[index] = ["Accepted bullet"]
    after = _missing_indices(request, selected_experience, selected_projects, experience, projects)
    assert after == ([item for item in before[0] if item != index], before[1])
    assert request.model_dump() == original


def test_localization_batches_preserve_order_and_original_plan_identity() -> None:
    plans: list[dict[str, object]] = [
        {"key": "a", "source": "aaaa"},
        {"key": "b", "source": "bb"},
        {"key": "c", "source": "c"},
        {"key": "d", "source": "ddddddd"},
    ]
    batches = _localization_batches(plans, chunk_size=2, max_source_chars=5)
    assert [[plan["key"] for plan in batch] for batch in batches] == [["a"], ["b", "c"], ["d"]]
    assert all(
        actual is expected
        for actual, expected in zip(
            [plan for batch in batches for plan in batch], plans, strict=True
        )
    )
