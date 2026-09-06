from dataclasses import dataclass
from typing import Protocol

from app.domain.contracts import CVProfile, JobProfile, MatchComponent, MatchRequest, MatchResponse


class SemanticScorer(Protocol):
    version: str

    def score(self, candidate: CVProfile, job: JobProfile) -> float | None: ...


@dataclass(frozen=True, slots=True)
class UnavailableSemanticScorer:
    version: str = "unavailable-v1"

    def score(self, candidate: CVProfile, job: JobProfile) -> float | None:
        return None


class MatchService:
    _base_weights = {"semantic": 0.40, "skills": 0.35, "experience": 0.15, "metadata": 0.10}
    _level_order = {"intern": 0, "junior": 1, "mid": 2, "senior": 3, "lead": 4, "principal": 5}

    def __init__(self, semantic_scorer: SemanticScorer | None = None) -> None:
        self._semantic = semantic_scorer or UnavailableSemanticScorer()

    def match(self, request: MatchRequest) -> MatchResponse:
        if not isinstance(request, MatchRequest):
            raise TypeError("request must be MatchRequest")
        candidate, job = request.candidate, request.job
        normalized_cv = {self._normalize(skill) for skill in candidate.skills}
        required = self._unique_normalized(job.required_skills)
        preferred = self._unique_normalized(job.preferred_skills)
        matched_required = [
            raw for raw in job.required_skills if self._normalize(raw) in normalized_cv
        ]
        missing_required = [
            raw for raw in job.required_skills if self._normalize(raw) not in normalized_cv
        ]
        matched_preferred = [
            raw for raw in job.preferred_skills if self._normalize(raw) in normalized_cv
        ]

        components: dict[str, tuple[float, list[str]]] = {}
        semantic = self._semantic.score(candidate, job)
        if semantic is not None:
            if not 0 <= semantic <= 1:
                raise ValueError("semantic scorer must return a score between 0 and 1")
            components["semantic"] = (semantic, [f"semantic component={self._semantic.version}"])

        if required or preferred:
            if required:
                required_coverage = len(
                    {self._normalize(skill) for skill in matched_required}
                ) / len(required)
            else:
                required_coverage = 0.0
            preferred_coverage = (
                len({self._normalize(skill) for skill in matched_preferred}) / len(preferred)
                if preferred
                else 0.0
            )
            skill_score = (
                required_coverage * 0.8 + preferred_coverage * 0.2
                if preferred
                else required_coverage
            )
            evidence = [f"required skills matched {len(matched_required)}/{len(required)}"]
            if preferred:
                evidence.append(
                    f"preferred skills matched {len(matched_preferred)}/{len(preferred)}"
                )
            components["skills"] = (skill_score, evidence)

        experience_score, experience_evidence = self._experience_score(candidate, job)
        if experience_score is not None:
            components["experience"] = (experience_score, experience_evidence)

        metadata_score, metadata_evidence = self._metadata_score(candidate, job)
        if metadata_score is not None:
            components["metadata"] = (metadata_score, metadata_evidence)

        available_weight = sum(self._base_weights[name] for name in components)
        if available_weight == 0:
            overall = 0.0
        else:
            overall = (
                sum(score * self._base_weights[name] for name, (score, _) in components.items())
                / available_weight
            )

        response_components = {
            name: MatchComponent(
                score=score,
                weight=self._base_weights[name] / available_weight if available_weight else 0.0,
                available=True,
                evidence=evidence,
            )
            for name, (score, evidence) in components.items()
        }
        strengths = []
        if matched_required:
            strengths.append(f"Matches {len(matched_required)} required skill(s).")
        if matched_preferred:
            strengths.append(f"Matches {len(matched_preferred)} preferred skill(s).")
        if experience_score is not None and experience_score >= 0.8:
            strengths.append("Experience level is compatible with the job.")
        gaps = [f"Missing required skill: {skill}." for skill in missing_required[:10]]
        if experience_score is not None and experience_score < 0.8:
            gaps.append("Experience level or years do not fully match the job.")
        degraded = semantic is None
        explanation = self._explanation(overall, strengths, gaps, degraded)
        return MatchResponse(
            cv_id=request.cv_id,
            job_id=request.job_id,
            overall_score=overall,
            components=response_components,
            matched_skills=matched_required + matched_preferred,
            missing_required_skills=missing_required,
            strengths=strengths,
            gaps=gaps,
            explanation=explanation,
            degraded=degraded,
            semantic_component_version=self._semantic.version,
        )

    @staticmethod
    def _normalize(value: str) -> str:
        normalized = value.casefold().strip().replace(".", "").replace("-", "")
        return " ".join(normalized.split())

    def _unique_normalized(self, values: list[str]) -> set[str]:
        return {self._normalize(value) for value in values}

    def _experience_score(
        self, candidate: CVProfile, job: JobProfile
    ) -> tuple[float | None, list[str]]:
        signals: list[float] = []
        evidence: list[str] = []
        if job.min_years_experience is not None or job.max_years_experience is not None:
            if candidate.years_experience is not None:
                years = candidate.years_experience
                if job.min_years_experience is not None:
                    years_score = (
                        min(1.0, years / job.min_years_experience)
                        if job.min_years_experience
                        else 1.0
                    )
                else:
                    years_score = 1.0
                if job.max_years_experience is not None and years > job.max_years_experience:
                    years_score = min(
                        years_score, max(0.0, 1 - (years - job.max_years_experience) / 10)
                    )
                signals.append(years_score)
                evidence.append(f"candidate has {years:g} year(s) of experience")
        if job.level is not None and candidate.level is not None:
            distance = abs(
                self._level_order[candidate.level.value] - self._level_order[job.level.value]
            )
            signals.append(max(0.0, 1 - distance * 0.25))
            evidence.append(f"candidate level={candidate.level.value}, job level={job.level.value}")
        return (sum(signals) / len(signals), evidence) if signals else (None, [])

    def _metadata_score(
        self, candidate: CVProfile, job: JobProfile
    ) -> tuple[float | None, list[str]]:
        signals: list[float] = []
        evidence: list[str] = []
        if job.work_modes and candidate.work_modes:
            overlap = set(candidate.work_modes).intersection(job.work_modes)
            signals.append(1.0 if overlap else 0.0)
            evidence.append(f"work mode overlap={bool(overlap)}")
        if job.location is not None and candidate.location is not None:
            candidate_location = candidate.location.casefold().strip()
            job_location = job.location.casefold().strip()
            signals.append(1.0 if candidate_location == job_location else 0.0)
            evidence.append(f"location match={candidate_location == job_location}")
        return (sum(signals) / len(signals), evidence) if signals else (None, [])

    @staticmethod
    def _explanation(score: float, strengths: list[str], gaps: list[str], degraded: bool) -> str:
        prefix = (
            (
                "Deterministic match score; semantic scoring is unavailable, "
                "so weights were renormalized. "
            )
            if degraded
            else "Deterministic match score. "
        )
        body = f"Overall score: {score:.2f}."
        if strengths:
            body += " Strengths: " + " ".join(strengths)
        if gaps:
            body += " Gaps: " + " ".join(gaps)
        return prefix + body
