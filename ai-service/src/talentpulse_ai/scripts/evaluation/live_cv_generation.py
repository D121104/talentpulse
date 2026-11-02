"""Live, non-PII all-sections Ollama evaluation for CV localization."""

from __future__ import annotations

import json
import os
import re
from collections.abc import Iterator, Sequence
from dataclasses import dataclass
from typing import Any, cast
from uuid import uuid4

from talentpulse_ai.infrastructure.llm.ollama import OllamaGenerationAdapter
from talentpulse_ai.modules.cv_generator.context_builder import (
    _entry_target_terms,
    _group_skills,
    _selected_entry_indices,
)
from talentpulse_ai.modules.cv_generator.schemas import (
    CandidateEducation,
    CandidateExperience,
    CandidateProject,
    CvDraft,
    CvDraftRequest,
    DraftExperience,
    DraftProject,
)
from talentpulse_ai.modules.cv_generator.service import CvDraftGenerationService
from talentpulse_ai.modules.cv_generator.validators import (
    _SHORT_SCALAR_FIELDS,
    _application_role,
    _canonical_skill_member,
    _has_application_target,
    _is_intentionally_preserved,
    _locale_literals,
    _locale_matches,
    _salient_anchors,
    _short_scalar_locale_matches,
    _skill_member_display,
    _skill_member_is_relevant,
    _source_locale_matches,
    _target_skill_literal,
    _target_skill_pattern,
)

_CANONICAL_URL = "https://example.test/candidates/nguyen-an"
_OFFICIAL_CREDENTIAL = "AWS Certified Cloud Practitioner"
_TECHNOLOGIES = ["Python", "FastAPI", "PostgreSQL"]


def _candidate(locale: str) -> dict[str, Any]:
    vietnamese_source = locale.casefold().startswith("en")
    return {
        "candidate_id": str(uuid4()),
        "full_name": "Nguyễn An",
        "email": "synthetic.candidate@example.test",
        "phone": "+84 900 000 001",
        "link": _CANONICAL_URL,
        "address": "Hanoi, Vietnam",
        "headline": "Kỹ sư dữ liệu" if vietnamese_source else "Data Engineer",
        "career_objective": (
            "Tìm cơ hội phát triển các nền tảng dữ liệu đáng tin cậy."
            if vietnamese_source
            else "Seeking opportunities to build reliable data platforms."
        ),
        "skills": (
            [
                "Python",
                "Phân tích dữ liệu",
                "FastAPI",
                "PostgreSQL",
                "Docker",
                "ETL",
                "Tiếng Anh chuyên ngành",
            ]
            if vietnamese_source
            else [
                "Python",
                "Data Analysis",
                "FastAPI",
                "PostgreSQL",
                "Docker",
                "ETL",
                "Technical English",
            ]
        ),
        "experience": [
            {
                "company_name": "Acme Analytics",
                "position": "Kỹ sư backend" if vietnamese_source else "Backend Engineer",
                "start_date": "2022-01",
                "end_date": "2024-01",
                "description": (
                    "Phát triển dịch vụ FastAPI với Python và PostgreSQL; duy trì schema dữ liệu."
                    if vietnamese_source
                    else (
                        "Developed FastAPI services with Python and PostgreSQL; "
                        "maintained data schemas."
                    )
                ),
            },
            {
                "company_name": "Northwind Labs",
                "position": "Kỹ sư dữ liệu" if vietnamese_source else "Data Engineer",
                "start_date": "2020-06",
                "end_date": "2021-12",
                "description": (
                    "Xây dựng pipeline ETL bằng Python; lập tài liệu API và kiểm tra "
                    "chất lượng dữ liệu."
                    if vietnamese_source
                    else (
                        "Built ETL pipelines with Python; documented APIs and checked data quality."
                    )
                ),
            },
            {
                "company_name": "Lotus Commerce",
                "position": "Kỹ sư nền tảng" if vietnamese_source else "Platform Engineer",
                "start_date": "2018-07",
                "end_date": "2020-05",
                "description": (
                    "Triển khai dịch vụ bằng Docker; vận hành PostgreSQL và hỗ trợ "
                    "quy trình phát hành."
                    if vietnamese_source
                    else (
                        "Deployed services with Docker; operated PostgreSQL and supported "
                        "release workflows."
                    )
                ),
            },
        ],
        "education": [
            {
                "school_name": "Hanoi University",
                "degree": "Cử nhân Khoa học Máy tính"
                if vietnamese_source
                else "Bachelor of Computer Science",
                "major": "Khoa học Máy tính" if vietnamese_source else "Computer Science",
                "start_date": "2016",
                "end_date": "2020",
                "description": "Tốt nghiệp loại giỏi."
                if vietnamese_source
                else "Graduated with honors.",
            }
        ],
        "projects": [
            {
                "project_name": (
                    "Nền tảng tuyển dụng" if vietnamese_source else "Recruitment Platform"
                ),
                "role": "Nhà phát triển" if vietnamese_source else "Developer",
                "start_date": "2023-01",
                "end_date": "2023-08",
                "description": (
                    "Xây dựng API tuyển dụng bằng Python và FastAPI; thiết kế luồng hồ sơ ứng viên."
                    if vietnamese_source
                    else (
                        "Built a hiring API with Python and FastAPI; designed candidate "
                        "profile flows."
                    )
                ),
                "technologies": ["Python", "FastAPI"],
            },
            {
                "project_name": (
                    "Kho dữ liệu bán hàng" if vietnamese_source else "Sales Data Warehouse"
                ),
                "role": "Kỹ sư dữ liệu" if vietnamese_source else "Data Engineer",
                "start_date": "2021-02",
                "end_date": "2021-10",
                "description": (
                    "Xây dựng pipeline ETL bằng Python và PostgreSQL; lập báo cáo chất lượng "
                    "dữ liệu."
                    if vietnamese_source
                    else (
                        "Built ETL pipelines with Python and PostgreSQL; reported data "
                        "quality findings."
                    )
                ),
                "technologies": ["Python", "PostgreSQL", "ETL"],
            },
            {
                "project_name": (
                    "Cổng phân tích vận hành"
                    if vietnamese_source
                    else "Operations Analytics Portal"
                ),
                "role": "Kỹ sư nền tảng" if vietnamese_source else "Platform Engineer",
                "start_date": "2019-03",
                "end_date": "2019-11",
                "description": (
                    "Triển khai cổng phân tích bằng Docker; duy trì API và cơ sở dữ liệu "
                    "PostgreSQL."
                    if vietnamese_source
                    else (
                        "Deployed an analytics portal with Docker; maintained APIs and "
                        "PostgreSQL data stores."
                    )
                ),
                "technologies": ["Docker", "PostgreSQL"],
            },
        ],
        "certificates": [
            _OFFICIAL_CREDENTIAL,
            (
                "Chứng chỉ phân tích dữ liệu Google"
                if vietnamese_source
                else "Google Data Analytics Certificate"
            ),
            ("Chứng chỉ Docker Associate" if vietnamese_source else "Docker Certified Associate"),
        ],
        "activities": [
            "Tình nguyện viên cộng đồng công nghệ"
            if vietnamese_source
            else "Technology Community Volunteer",
            "Hướng dẫn sinh viên xây dựng API"
            if vietnamese_source
            else "Student API Workshop Mentor",
        ],
        "awards": [
            "Giải thưởng nhân viên xuất sắc" if vietnamese_source else "Outstanding Employee Award"
        ],
    }


def request(locale: str) -> CvDraftRequest:
    return CvDraftRequest.model_validate(
        {
            "identity": {
                "request_id": str(uuid4()),
                "trace_id": str(uuid4()),
                "operation_attempt_id": str(uuid4()),
            },
            "candidate": _candidate(locale),
            "job": {
                "job_id": str(uuid4()),
                "title": "Senior Data Engineer",
                "company_name": "Example Hiring Co.",
                "required_skills": ["Python", "FastAPI"],
            },
            "template_type": "template1",
            "locale": locale,
            "source_version": "eval-all-sections-v2",
            "content_version": 1,
        }
    )


def mixed_entity_request(locale: str, title: str, skills: list[str]) -> CvDraftRequest:
    """Synthetic 3/3/1/3/7 profile with Vietnamese prose and English owned names."""
    payload = request(locale).model_dump(mode="json")
    candidate = payload["candidate"]
    candidate["headline"] = "Kỹ sư phần mềm"
    candidate["career_objective"] = "Phát triển phần mềm và mô hình phục vụ sản phẩm."
    candidate["skills"] = [
        "Python",
        "PyTorch",
        "React",
        "NestJS",
        "FastAPI",
        "PostgreSQL",
        "Docker",
    ]
    candidate["certificates"] = [_OFFICIAL_CREDENTIAL, "Google Data Analytics Certificate", "CCNA"]
    candidate["activities"] = []
    candidate["awards"] = []
    names = ["Orion Data Technology", "Lyra Technology Solutions", "Vela Data Platform"]
    prose = [
        "Huấn luyện mô hình PyTorch bằng Python; xây dựng giao diện React; phát triển API NestJS",
        "Kiểm thử mô hình PyTorch bằng Python; bảo trì giao diện React; vận hành API NestJS",
        "Triển khai mô hình PyTorch với Docker; bảo trì dịch vụ FastAPI; kiểm thử giao diện React",
    ]
    project_names = ["Orion Data Platform", "Lyra Technology Portal", "Vela API"]
    for index, entry in enumerate(candidate["experience"]):
        entry["company_name"] = names[index]
        entry["position"] = "Software Engineer"
        entry["description"] = f"{prose[index]} tại {names[index]}."
    for index, entry in enumerate(candidate["projects"]):
        entry["project_name"] = project_names[index]
        entry["role"] = "Developer"
        entry["description"] = f"{prose[index]} cho {project_names[index]}."
        entry["technologies"] = candidate["skills"]
    candidate["education"][0].update(
        school_name="Trường Đại học Mẫu",
        degree="Cử nhân",
        major="Khoa học Máy tính",
        description=None,
    )
    payload["job"] = {"job_id": str(uuid4()), "title": title, "required_skills": skills}
    payload["source_version"] = "eval-mixed-owned-entities-v1"
    return CvDraftRequest.model_validate(payload)


def data_engineer_request(locale: str, title: str, skills: list[str]) -> CvDraftRequest:
    """Synthetic evidence-limited variant, not a reconstruction of a user profile."""
    payload = mixed_entity_request(locale, title, skills).model_dump(mode="json")
    candidate = payload["candidate"]
    candidate["skills"] = ["Docker", "Kafka", "Python", "Spring Boot", "Airflow", "dbt", "FastAPI"]
    candidate["headline"] = "Kỹ sư dữ liệu"
    candidate["career_objective"] = "Phát triển hệ thống xử lý dữ liệu phục vụ sản phẩm."
    prose = [
        "Xử lý dữ liệu bằng Python; xây dựng API với PostgreSQL",
        "Điều phối luồng dữ liệu bằng Airflow; triển khai dịch vụ với Docker",
        "Kiểm thử xử lý dữ liệu Python; bảo trì API PostgreSQL",
    ]
    for index, entry in enumerate(candidate["experience"]):
        entry["description"] = f"{prose[index]} tại {entry['company_name']}."
    for index, entry in enumerate(candidate["projects"]):
        entry["description"] = f"{prose[index]} cho {entry['project_name']}."
        entry["technologies"] = (
            ["Airflow", "Docker"] if index == 1 else ["Python", "PostgreSQL", "API"]
        )
    return CvDraftRequest.model_validate(payload)


def selection_request(locale: str, title: str, skills: list[str]) -> CvDraftRequest:
    payload = data_engineer_request(locale, title, skills).model_dump(mode="json")
    candidate = payload["candidate"]
    candidate["experience"].extend(
        [
            {
                "company_name": "Orion Data Technology",
                "position": "Data Engineer",
                "description": "Xây dựng luồng ETL Python; triển khai Docker và kiểm thử dữ liệu.",
            },
            {
                "company_name": "Synthetic Desktop Studio",
                "position": "Java Developer",
                "description": "Phát triển ứng dụng máy tính bằng Java.",
            },
        ]
    )
    candidate["projects"].extend(
        [
            {
                "project_name": "Orion Data Warehouse",
                "role": "Data Engineer",
                "description": "Xây dựng luồng ETL Python và Airflow; triển khai Docker; "
                "giảm thời gian xử lý 15%; lưu dữ liệu vào fact_orders.",
                "technologies": ["Python", "Airflow", "Docker"],
            },
            {
                "project_name": "Synthetic Desktop App",
                "role": "Java Developer",
                "description": "Phát triển ứng dụng máy tính bằng Java.",
                "technologies": ["Java"],
            },
        ]
    )
    payload["source_version"] = "eval-selection-v1"
    return CvDraftRequest.model_validate(payload)


def diagnostic_shape_request(locale: str, title: str, skills: list[str]) -> CvDraftRequest:
    """Synthetic longer entries built from diagnostic shapes, never raw account prose."""
    payload = data_engineer_request(locale, title, skills).model_dump(mode="json")
    candidate = payload["candidate"]
    candidate["experience"][1]["position"] = "Junior Data Engineer"
    candidate["projects"][0]["project_name"] = "Data Pipeline"
    candidate["projects"][1]["project_name"] = "Realtime Event Processing System"
    candidate["projects"][2]["project_name"] = "Data Warehouse Analytics Platform"
    candidate["certificates"] = [
        "AWS Certified Data Engineer – Associate",
        "Databricks Certified Data Engineer Associate",
        "Astronomer Certification for Apache Airflow Fundamentals",
    ]
    descriptions = [
        "Xây dựng luồng ETL bằng Python và Airflow để nhập dữ liệu vào PostgreSQL. "
        "Đóng gói tác vụ với Docker; kiểm tra dữ liệu bằng SQL trước khi cung cấp API. "
        "Tối ưu lịch xử lý giúp giảm thời gian chờ 12%. "
        "Theo dõi lỗi nhập dữ liệu và bổ sung kiểm tra đầu vào để phát hiện bản ghi thiếu. "
        "Phối hợp kiểm thử luồng xử lý, ghi lại cách vận hành và cập nhật tài liệu bàn giao. "
        "Sử dụng SQL query để kiểm tra pipeline trong data warehouse trước khi cung cấp REST API.",
        "Điều phối luồng ETL bằng Airflow và xử lý dữ liệu bằng Python. "
        "Xây dựng mô hình dbt trên PostgreSQL; sử dụng SQL để kiểm tra tính nhất quán. "
        "Cải thiện thời gian xử lý 18%. "
        "Phân tích lỗi phát sinh từ dữ liệu đầu vào, bổ sung kiểm tra và sửa tác vụ liên quan. "
        "Thực hiện kiểm thử trước khi cập nhật lịch chạy và theo dõi kết quả sau mỗi lần chạy. "
        "Ghi lại quy trình xử lý và trao đổi với nhóm phụ trách dữ liệu để xác nhận thay đổi. "
        "Kiểm tra data quality và schema, theo dõi dashboard của data warehouse và sử dụng "
        "partitioning để tổ chức dữ liệu cho pipeline cùng SQL query.",
        "Vận hành luồng nhận dữ liệu Kafka trong môi trường Docker. "
        "Sử dụng Airflow để điều phối các bước xử lý và theo dõi trạng thái tác vụ. "
        "Kiểm tra thông điệp lỗi, xác định nguyên nhân gián đoạn và cập nhật cấu hình phù hợp. "
        "Phối hợp kiểm thử quá trình nhận dữ liệu khi thay đổi cấu hình. "
        "Theo dõi nhật ký kỹ thuật để xác định tác vụ cần chạy lại và kiểm tra kết quả xử lý. "
        "Chuẩn bị tài liệu vận hành, ghi lại các bước kiểm tra và hướng dẫn xử lý lỗi cho nhóm. "
        "Theo dõi pipeline bằng monitoring, logging và alert; kiểm thử streaming cùng "
        "incremental loading trong data warehouse. Kiểm tra partitioning trước khi "
        "chạy lại pipeline và xác nhận đầu ra sau mỗi bước xử lý.",
    ]
    project_descriptions = [
        "Thiết kế luồng ETL bằng Python, Airflow và dbt. "
        "Đóng gói tác vụ bằng Docker và lưu dữ liệu vào bảng fact_orders. "
        "Tối ưu bước xử lý giúp giảm thời gian chạy 15%. "
        "Kiểm tra dữ liệu đầu vào và bổ sung điều kiện kiểm tra trước khi ghi bảng đích. "
        "Ghi lại các bước xử lý, cách chạy lại tác vụ và quy trình kiểm thử khi có thay đổi. "
        "Phân tích lỗi từ từng lần chạy để cập nhật kiểm tra dữ liệu và xác nhận kết quả. "
        "Kiểm tra schema của fact_orders trong data warehouse, đối chiếu các trường "
        "customer, product và date trước khi cập nhật dashboard. Chạy thử incremental "
        "loading trong pipeline và kiểm tra bản ghi mới trước khi cập nhật kết quả.",
        "Xây dựng luồng tiếp nhận thông điệp Kafka và đóng gói dịch vụ với Docker. "
        "Lưu kết quả xử lý vào PostgreSQL và kiểm tra tính nhất quán của bản ghi. "
        "Thiết kế quy trình chạy thử để kiểm tra việc tiếp nhận và xử lý thông điệp lỗi. "
        "Theo dõi trạng thái dịch vụ và xác định nguyên nhân gián đoạn trong quá trình vận hành. "
        "Viết tài liệu cấu hình và bổ sung hướng dẫn kiểm tra dữ liệu sau mỗi lần cập nhật. "
        "Kiểm tra dữ liệu đầu vào của từng tác vụ và đối chiếu bản ghi đã lưu để xác nhận "
        "quá trình tiếp nhận. Phối hợp kiểm thử thay đổi cấu hình và ghi lại kết quả cho nhóm.",
        "Phát triển API FastAPI để truy vấn dữ liệu trong PostgreSQL. "
        "Điều phối luồng ETL bằng Airflow và kiểm tra kết quả xử lý trước khi cung cấp API. "
        "Kiểm thử đầu vào truy vấn để xác nhận cách xử lý dữ liệu thiếu và điều kiện lọc. "
        "Theo dõi tác vụ lỗi, bổ sung kiểm tra và cập nhật tài liệu kỹ thuật cho nhóm sử dụng. "
        "Chuẩn bị hướng dẫn chạy thử và ghi lại cách xác nhận kết quả sau mỗi lần cập nhật. "
        "Bổ sung logging cho pipeline để theo dõi các bước xử lý và phát hiện dữ liệu thiếu. "
        "Phối hợp kiểm thử truy vấn với nhóm sử dụng API, kiểm tra điều kiện lọc và đối chiếu "
        "kết quả. Ghi lại cách chạy thử pipeline và các bước kiểm tra trước khi bàn giao.",
    ]
    for entry, description in zip(candidate["experience"], descriptions, strict=True):
        entry["description"] = description
    for entry, description in zip(candidate["projects"], project_descriptions, strict=True):
        entry["description"] = description
        entry["technologies"] = []
    return CvDraftRequest.model_validate(payload)


@dataclass(frozen=True)
class EvaluatedField:
    label: str
    section: str
    source_index: int
    field: str
    source: str
    value: str

    def __iter__(self) -> Iterator[str]:
        # Keep the old ``for label, value`` shape usable by small external probes.
        yield self.label
        yield self.value


def _omitted_indices(result: CvDraft, section: str, field: str) -> set[int]:
    pattern = re.compile(rf"{re.escape(section)}\[(\d+)\]\.{re.escape(field)}:")
    indices: set[int] = set()
    for warning in result.warnings:
        if not warning.startswith("cv_generation.localization_omission="):
            continue
        indices.update(int(match.group(1)) for match in pattern.finditer(warning))
    return indices


def _compact_values_by_source_index(
    requested: CvDraftRequest,
    result: CvDraft,
    section: str,
    field: str,
    sources: Sequence[str],
    outputs: Sequence[str],
) -> dict[int, str]:
    """Align compacted string arrays using service omission metadata, never position alone."""
    omitted = _omitted_indices(result, section, field)
    excluded = {
        index
        for index, source in enumerate(sources)
        if source.strip()
        and (
            _source_locale_matches(source, requested.locale, section, field)
            or _is_intentionally_preserved(requested, section, index, field, source)
        )
    }
    mapping: dict[int, str] = {}
    used_output: set[int] = set()

    # Canonical/same-locale values survive compaction. Match them by content first so an
    # omitted earlier value cannot be attributed to the next source index.
    for index in sorted(excluded):
        source_key = " ".join(sources[index].casefold().split())
        for output_index, output in enumerate(outputs):
            if (
                output_index not in used_output
                and " ".join(output.casefold().split()) == source_key
            ):
                mapping[index] = output
                used_output.add(output_index)
                break

    remaining_sources = [
        index
        for index, source in enumerate(sources)
        if source.strip() and index not in excluded and index not in omitted
    ]
    remaining_outputs = [
        output for output_index, output in enumerate(outputs) if output_index not in used_output
    ]
    for index, output in zip(remaining_sources, remaining_outputs, strict=False):
        mapping[index] = output
    for index in omitted:
        mapping[index] = ""
    return mapping


def _needs_translation(
    requested: CvDraftRequest, section: str, source_index: int, field: str, source: str
) -> bool:
    return bool(
        source.strip()
        and not _source_locale_matches(
            source,
            requested.locale,
            section,
            field,
            preserved_literals=_locale_literals(requested.candidate),
        )
        and not _is_intentionally_preserved(requested, section, source_index, field, source)
    )


def _translatable_fields(requested: CvDraftRequest, result: CvDraft) -> list[EvaluatedField]:
    """Return only fields requiring localization, with source indices preserved."""
    values: list[EvaluatedField] = []

    def add(
        label: str,
        section: str,
        source_index: int,
        field: str,
        source: str | None,
        output: str | None,
    ) -> None:
        if source and _needs_translation(requested, section, source_index, field, source):
            values.append(EvaluatedField(label, section, source_index, field, source, output or ""))

    candidate = requested.candidate
    if _has_application_target(requested):
        values.extend(
            [
                EvaluatedField(
                    "application_headline",
                    "application",
                    0,
                    "title",
                    requested.job.title,
                    result.position or "",
                ),
                EvaluatedField(
                    "objective",
                    "objective",
                    0,
                    "career_objective",
                    requested.job.title,
                    result.career_objective or "",
                ),
            ]
        )
    else:
        add("headline", "headline", 0, "headline", candidate.headline, result.position)
        add(
            "objective",
            "objective",
            0,
            "career_objective",
            candidate.career_objective,
            result.career_objective,
        )
    for index, source_education in enumerate(candidate.education):
        output_education = result.education[index] if index < len(result.education) else None
        for field in ("degree", "major", "description"):
            add(
                f"education[{index}].{field}",
                "education",
                index,
                field,
                getattr(source_education, field),
                getattr(output_education, field, None),
            )
    selected_experience, selected_projects = _selected_entry_indices(requested)
    experience_by_index = {entry.source_index: entry for entry in result.work_experience}
    projects_by_index = {entry.source_index: entry for entry in result.projects}
    for index in selected_experience:
        source_experience = candidate.experience[index]
        output_experience = experience_by_index.get(index)
        for field in ("position", "description"):
            add(
                f"experience[{index}].{field}",
                "experience",
                index,
                field,
                getattr(source_experience, field),
                getattr(output_experience, field, None),
            )
        if _entry_has_source_text(source_experience) and source_experience.description:
            add(
                f"experience[{index}].bullets",
                "experience",
                index,
                "description",
                source_experience.description,
                " ".join(output_experience.bullets) if output_experience else "",
            )
    for index in selected_projects:
        source_project = candidate.projects[index]
        output_project = projects_by_index.get(index)
        for field in ("project_name", "role", "description"):
            add(
                f"projects[{index}].{field}",
                "projects",
                index,
                field,
                getattr(source_project, field),
                getattr(output_project, field, None),
            )
        if _entry_has_source_text(source_project) and source_project.description:
            add(
                f"projects[{index}].bullets",
                "projects",
                index,
                "description",
                source_project.description,
                " ".join(output_project.bullets) if output_project else "",
            )
    for index, group in enumerate(result.skills):
        for field, value in (("name", group.name),):
            values.append(
                EvaluatedField(
                    f"skill_groups[{index}].{field}", "skill_groups", index, field, value, value
                )
            )

    for index, source in enumerate(candidate.skills):
        if not _skill_member_is_relevant(requested, source):
            continue
        if _canonical_skill_member(requested, source):
            continue
        display = _skill_member_display(requested, source)
        output = next(
            (
                variant
                for variant in (display, source)
                if variant
                and any(
                    re.search(rf"(?:^|; ){re.escape(variant)}(?:; |$)", group.description or "")
                    for group in result.skills
                )
            ),
            "",
        )
        values.append(
            EvaluatedField(f"skill_members[{index}]", "skills", index, "name", source, output)
        )

    text_sources: list[tuple[str, Sequence[str], Sequence[str]]] = [
        ("certificates", candidate.certificates, result.certificates),
        ("activities", candidate.activities, result.activities),
        ("awards", candidate.awards, result.awards),
    ]
    for section, sources, outputs in text_sources:
        mapped = _compact_values_by_source_index(
            requested, result, section, "text", sources, outputs
        )
        for index, source in enumerate(sources):
            add(
                f"{section}[{index}]",
                section,
                index,
                "text",
                source,
                mapped.get(index),
            )
    return values


def _preserved_fields(requested: CvDraftRequest) -> list[str]:
    fields: list[str] = []

    def add(label: str, section: str, index: int, field: str, source: str | None) -> None:
        if source and _is_intentionally_preserved(requested, section, index, field, source):
            fields.append(label)

    candidate = requested.candidate
    add("headline", "headline", 0, "headline", candidate.headline)
    add("objective", "objective", 0, "career_objective", candidate.career_objective)
    entry: CandidateEducation | CandidateExperience | CandidateProject
    for index, entry in enumerate(candidate.education):
        for field in ("degree", "major", "description"):
            add(f"education[{index}].{field}", "education", index, field, getattr(entry, field))
    for index, entry in enumerate(candidate.experience):
        for field in ("position", "description"):
            add(f"experience[{index}].{field}", "experience", index, field, getattr(entry, field))
    for index, entry in enumerate(candidate.projects):
        for field in ("project_name", "role", "description"):
            add(f"projects[{index}].{field}", "projects", index, field, getattr(entry, field))
    for index, source in enumerate(candidate.skills):
        if _skill_member_is_relevant(requested, source) and _canonical_skill_member(
            requested, source
        ):
            fields.append(f"skills[{index}].name")
    for section, sources in (
        ("certificates", candidate.certificates),
        ("activities", candidate.activities),
        ("awards", candidate.awards),
    ):
        for index, source in enumerate(sources):
            add(f"{section}[{index}]", section, index, "text", source)
    return fields


def _entry_has_source_text(entry: Any) -> bool:
    return any(isinstance(value, str) and value.strip() for value in entry.model_dump().values())


def _mixed_or_wrong_locale(
    values: list[EvaluatedField],
    locale: str,
    preserved_literals: Sequence[str] = (),
    application_role: str | None = None,
) -> list[str]:
    wrong: list[str] = []
    for value in values:
        if not value.value.strip():
            continue
        checked_text = value.value
        # Only the authoritative application-role reference is metadata; prose stays localized.
        if application_role and (
            (
                value.section == "application"
                and checked_text.startswith(
                    (f"Ứng tuyển: {application_role}", f"Applying for: {application_role}")
                )
            )
            or (
                value.section == "objective"
                and checked_text.startswith(
                    (
                        f"Ứng tuyển vị trí {application_role}.",
                        f"Applying for the {application_role} role.",
                    )
                )
            )
        ):
            checked_text = checked_text.replace(application_role, "", 1)
        locale_ok = (
            _short_scalar_locale_matches(checked_text, locale)
            if (value.section, value.field) in _SHORT_SCALAR_FIELDS
            or value.section == "skill_groups"
            else _locale_matches(checked_text, locale, preserved_literals=preserved_literals)
        )
        if value.label.startswith("skill_members["):
            locale_ok = locale_ok and _locale_matches(checked_text, locale)
        if not locale_ok:
            wrong.append(value.label)
    return wrong


def _canonical_failures(requested: CvDraftRequest, result: CvDraft) -> list[str]:
    candidate = requested.candidate
    failures: list[str] = []
    if result.full_name != candidate.full_name:
        failures.append("full_name")
    if result.email != candidate.email or result.phone != candidate.phone:
        failures.append("contact")
    if result.link != candidate.link:
        failures.append("url")
    selected_experience, selected_projects = _selected_entry_indices(requested)
    if [entry.source_index for entry in result.work_experience] != selected_experience:
        failures.append("experience.selection_indices")
    if [entry.source_index for entry in result.projects] != selected_projects:
        failures.append("projects.selection_indices")
    if result.skills != _group_skills(requested):
        failures.append("skills.owned_groups")
    for output_experience in result.work_experience:
        index = output_experience.source_index
        if index >= len(candidate.experience):
            failures.append("experience.source_index_range")
            continue
        source_experience = candidate.experience[index]
        for field in ("company_name", "start_date", "end_date"):
            if getattr(source_experience, field) != getattr(output_experience, field):
                failures.append(f"experience[{index}].{field}")
    for index, (source_education, output_education) in enumerate(
        zip(candidate.education, result.education, strict=True)
    ):
        for field in ("school_name", "start_date", "end_date"):
            if getattr(source_education, field) != getattr(output_education, field):
                failures.append(f"education[{index}].{field}")
    for output_project in result.projects:
        index = output_project.source_index
        if index >= len(candidate.projects):
            failures.append("projects.source_index_range")
            continue
        source_project = candidate.projects[index]
        for field in ("project_name", "start_date", "end_date", "technologies"):
            if field == "project_name" and not _is_intentionally_preserved(
                requested, "projects", index, field, source_project.project_name
            ):
                continue
            if getattr(source_project, field) != getattr(output_project, field):
                failures.append(f"projects[{index}].{field}")
    for index, source_certificate in enumerate(candidate.certificates):
        if (
            _is_intentionally_preserved(
                requested, "certificates", index, "text", source_certificate
            )
            and source_certificate not in result.certificates
        ):
            failures.append(f"certificates[{index}].canonical")
    if (
        _OFFICIAL_CREDENTIAL in candidate.certificates
        and result.certificates.count(_OFFICIAL_CREDENTIAL) != 1
    ):
        failures.append("official_certificate")
    return failures


def _duplicate_count(result: CvDraft) -> int:
    groups = [
        [bullet.casefold().strip() for entry in result.work_experience for bullet in entry.bullets],
        [bullet.casefold().strip() for entry in result.projects for bullet in entry.bullets],
        [value.casefold().strip() for value in result.certificates],
        [value.casefold().strip() for value in result.activities],
        [value.casefold().strip() for value in result.awards],
    ]
    return sum(len(values) - len(set(values)) for values in groups)


def _safe_missing_details(result: CvDraft) -> list[dict[str, str]]:
    details: list[dict[str, str]] = []
    prefix = "cv_generation.localization_omission="
    for warning in result.warnings:
        if not warning.startswith(prefix):
            continue
        for item in warning.removeprefix(prefix).split("; "):
            path, separator, reason = item.partition(":")
            if separator and path and reason:
                details.append({"path": path, "reason": reason})
    return details


def _latency_distribution(values: Sequence[float]) -> dict[str, float]:
    """Summarize provider-call latency without retaining prompts or provider payloads."""
    if not values:
        return {}
    ordered = sorted(values)

    def percentile(fraction: float) -> float:
        index = min(len(ordered) - 1, int(round((len(ordered) - 1) * fraction)))
        return round(ordered[index], 2)

    return {
        "min_ms": round(ordered[0], 2),
        "p50_ms": percentile(0.50),
        "p95_ms": percentile(0.95),
        "max_ms": round(ordered[-1], 2),
    }


def _matching_target_terms(text: str, skills: Sequence[str]) -> list[str]:
    return list(
        dict.fromkeys(
            _target_skill_literal(skill)
            for skill in skills
            if re.search(_target_skill_pattern(skill), text, re.IGNORECASE)
        )
    )


def _evaluate(
    locale: str, provider: OllamaGenerationAdapter, source_request: CvDraftRequest | None = None
) -> dict[str, Any]:
    source_request = source_request or request(locale)
    service = CvDraftGenerationService(provider)
    result = service.generate(source_request)
    selected_experience, selected_projects = _selected_entry_indices(source_request)
    experience_outputs = {entry.source_index: entry.bullets for entry in result.work_experience}
    project_outputs = {entry.source_index: entry.bullets for entry in result.projects}
    focus_omissions = [
        f"{section}[{index}]"
        for section, sources, indices, outputs in (
            (
                "experience",
                source_request.candidate.experience,
                selected_experience,
                experience_outputs,
            ),
            ("projects", source_request.candidate.projects, selected_projects, project_outputs),
        )
        for index in indices
        if (own_terms := _entry_target_terms(source_request, sources[index]))
        and (bullets := outputs.get(index, [])) is not None
        and (not bullets or not _matching_target_terms(bullets[0], own_terms))
    ]
    salient_omissions = [
        f"{section}[{index}]"
        for section, sources, indices, outputs in (
            (
                "experience",
                source_request.candidate.experience,
                selected_experience,
                experience_outputs,
            ),
            ("projects", source_request.candidate.projects, selected_projects, project_outputs),
        )
        for index in indices
        if not _salient_anchors(sources[index].description or "").issubset(
            _salient_anchors(" ".join(outputs.get(index, [])))
        )
    ]
    translatable = _translatable_fields(source_request, result)
    application_role = _application_role(source_request)
    prefix = "Ứng tuyển: " if locale.casefold().startswith("vi") else "Applying for: "
    objective_prefix = (
        f"Ứng tuyển vị trí {application_role}."
        if locale.casefold().startswith("vi")
        else f"Applying for the {application_role} role."
    )
    application_role_bound = application_role is None or (
        result.position == prefix + application_role
        and bool(result.career_objective and result.career_objective.startswith(objective_prefix))
    )
    mixed_fields = _mixed_or_wrong_locale(
        translatable, locale, _locale_literals(source_request.candidate), application_role
    )
    canonical_failures = _canonical_failures(source_request, result)
    expected = len(translatable)
    target_locale_count = sum(1 for field in translatable if field.value.strip()) - len(
        mixed_fields
    )
    provider_localized = sum(
        1
        for warning in result.warnings
        if warning.startswith("cv_generation.localization=provider")
    )
    fallback_localized = sum(
        1
        for warning in result.warnings
        if warning.startswith("cv_generation.localization=fallback")
    )
    missing = [field.label for field in translatable if not field.value.strip()]
    generic_fillers = [
        "career objective based on the supplied profile",
        "documented technologies",
    ]
    generic_filler_fields = [
        field.label
        for field in translatable
        if any(filler in field.value.casefold() for filler in generic_fillers)
    ]
    omission_warning_count = sum(
        1
        for warning in result.warnings
        if "omitted" in warning.casefold() or "omission" in warning.casefold()
    )
    rich_fallback_used = (
        "cv_generation.provenance=fallback" in result.warnings
        or "cv_generation.localization=fallback" in result.warnings
        or "Some rich source content was omitted" in " ".join(result.warnings)
        or "Career objective was omitted" in " ".join(result.warnings)
    )
    metrics = service.last_metrics
    raw_latencies = metrics.get("provider_call_latencies_ms", [])
    call_latencies = (
        [
            float(value)
            for value in raw_latencies
            if isinstance(value, (int, float)) and not isinstance(value, bool)
        ]
        if isinstance(raw_latencies, list)
        else []
    )
    raw_call_kinds = metrics.get("provider_call_kinds", [])
    call_kinds = [value for value in cast(list[object], raw_call_kinds) if isinstance(value, str)]
    raw_timeout_kinds = metrics.get("provider_timeout_kinds", [])
    timeout_kinds = [
        value for value in cast(list[object], raw_timeout_kinds) if isinstance(value, str)
    ]
    return {
        "locale": locale,
        "source_language": (
            "vi-with-owned-English-literals"
            if source_request.source_version == "eval-mixed-owned-entities-v1"
            else "vi"
            if locale == "en-US"
            else "en"
        ),
        "provider": provider.provider_name,
        "model": provider.model_name,
        "fixture_counts": {
            "experience": len(source_request.candidate.experience),
            "projects": len(source_request.candidate.projects),
            "education": len(source_request.candidate.education),
            "skills": len(source_request.candidate.skills),
            "certificates": len(source_request.candidate.certificates),
        },
        "selected_experience_indices": selected_experience,
        "selected_project_indices": selected_projects,
        "skill_groups": [group.model_dump() for group in result.skills],
        "expected_translatable_fields": expected,
        "application_role_bound": application_role_bound,
        "experience_bullet_counts": [len(entry.bullets) for entry in result.work_experience],
        "project_bullet_counts": [len(entry.bullets) for entry in result.projects],
        "empty_rich_entry_count": sum(
            not entry.bullets
            for entry in cast(
                list[DraftExperience | DraftProject], [*result.work_experience, *result.projects]
            )
        ),
        "experience_leading_target_skills": [
            _matching_target_terms(entry.bullets[0], source_request.job.required_skills)
            if entry.bullets
            else []
            for entry in result.work_experience
        ],
        "project_leading_target_skills": [
            _matching_target_terms(entry.bullets[0], source_request.job.required_skills)
            if entry.bullets
            else []
            for entry in result.projects
        ],
        "target_locale_fields": target_locale_count,
        "mixed_or_wrong_locale_count": len(mixed_fields),
        "mixed_or_wrong_locale_fields": mixed_fields,
        "missing_field_count": len(missing),
        "missing_fields": missing,
        "omitted_fields": missing,
        "missing_field_details": _safe_missing_details(result),
        "intentionally_preserved_field_count": len(_preserved_fields(source_request)),
        "intentionally_preserved_fields": _preserved_fields(source_request),
        "provider_localization_warning_count": provider_localized,
        "fallback_localization_warning_count": fallback_localized,
        "provider_bullet_used": "cv_generation.provenance=provider" in result.warnings,
        "fallback_bullet_used": "cv_generation.provenance=fallback" in result.warnings,
        "rich_fallback_used": rich_fallback_used,
        "omission_warning_count": omission_warning_count,
        "generic_filler_fields": generic_filler_fields,
        "generic_filler_present": bool(generic_filler_fields),
        "salient_fact_omissions": salient_omissions,
        "target_focus_omissions": focus_omissions,
        "duplicate_count": _duplicate_count(result),
        "canonical_failures": canonical_failures,
        "provider_call_count": metrics.get("provider_calls", 0),
        "provider_call_kinds": call_kinds,
        "provider_call_latencies_ms": call_latencies,
        "provider_call_latency_distribution_ms": _latency_distribution(call_latencies),
        "provider_timeout_count": metrics.get("provider_timeout_count", 0),
        "provider_timeout_kinds": timeout_kinds,
        "cache_hits": metrics.get("cache_hits", 0),
        "localization_target_count": metrics.get("localization_targets", 0),
        "localization_unique_target_count": metrics.get("localization_unique_targets", 0),
        "localization_chunk_count": metrics.get("localization_primary_chunks", 0),
        "localization_repair_calls": metrics.get("localization_repair_calls", 0),
        "localization_unresolved_count": metrics.get("localization_unresolved", 0),
        "locale_rejection_count": sum(
            int(warning.rsplit("=", 1)[1])
            for warning in result.warnings
            if warning.startswith("cv_generation.diagnostic=locale_rejection:count=")
        ),
        "timeout": bool(timeout_kinds)
        or any(
            code in warning.casefold()
            for warning in result.warnings
            for code in ("provider_timeout", "provider_deadline")
        ),
        "oom": any(
            marker in warning.casefold()
            for warning in result.warnings
            for marker in ("out of memory", "oom", "killed")
        ),
        "provider_elapsed_ms": metrics.get("provider_elapsed_ms", 0),
        "total_elapsed_ms": metrics.get("total_elapsed_ms", 0),
        "call_cap": metrics.get("call_cap", 0),
        "total_deadline_seconds": metrics.get("deadline_seconds", 0),
        "warning_codes": [
            warning.split("=", 1)[0]
            for warning in result.warnings
            if warning.startswith("cv_generation.")
        ],
    }


def main() -> None:
    provider = OllamaGenerationAdapter(
        os.getenv("OLLAMA_URL", "http://127.0.0.1:11435"),
        os.getenv("OLLAMA_MODEL", "qwen3:4b"),
        float(os.getenv("OLLAMA_TIMEOUT", "120")),
    )
    rows = [_evaluate(locale, provider) for locale in ("vi-VN", "en-US")]
    failures = [
        row
        for row in rows
        if row["mixed_or_wrong_locale_count"]
        or row["empty_rich_entry_count"]
        or row["localization_unresolved_count"]
        or row["missing_field_count"]
        or row["duplicate_count"]
        or row["salient_fact_omissions"]
        or row["target_focus_omissions"]
        or not row["application_role_bound"]
        or row["canonical_failures"]
        or row["generic_filler_present"]
        or row["rich_fallback_used"]
    ]
    output = {"model": provider.model_name, "locales": rows, "passed": not failures}
    print(json.dumps(output, ensure_ascii=False, indent=2))
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
