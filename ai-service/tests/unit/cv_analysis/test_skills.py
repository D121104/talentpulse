import pytest

from talentpulse_ai.modules.cv_analysis.matching import MatchService
from talentpulse_ai.modules.cv_analysis.parser import CVParser
from talentpulse_ai.modules.cv_analysis.skills import canonical_skill, split_skills


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        (
            ["Front-end NextJS, TypeScript, HTML, CSS, Ant Design."],
            ["NextJS", "TypeScript", "HTML", "CSS", "Ant Design"],
        ),
        (
            ["Database PostgreSQL, MySQL, MongoDB, Redis, ClickHouse"],
            ["PostgreSQL", "MySQL", "MongoDB", "Redis", "ClickHouse"],
        ),
        (
            ["Kỹ năng: Next.js; TypeScript\nCơ sở dữ liệu: PostgreSQL, Redis."],
            ["Next.js", "TypeScript", "PostgreSQL", "Redis"],
        ),
        (["NextJS", "Next.js", "next js"], ["NextJS"]),
        (
            ["Machine Learning", "Ant Design", "C++", "C#", ".NET"],
            ["Machine Learning", "Ant Design", "C++", "C#", ".NET"],
        ),
        (["Python (advanced); SQL (thành thạo)"], ["Python", "SQL"]),
        (["Database", "Skills:", "Kỹ năng mềm"], []),
    ],
)
def test_skill_tokens(source: list[str], expected: list[str]) -> None:
    assert split_skills(source) == expected


def test_no_substring_or_prose_mining() -> None:
    keys = {
        canonical_skill(skill)
        for skill in split_skills(
            [
                "JavaScript",
                "Advanced Python",
                "I used Java and SQL in production",
            ]
        )
    }
    assert "java" not in keys
    assert "python" not in keys
    assert "sql" not in keys
    assert canonical_skill("Next.js") == canonical_skill("NextJS")


def test_parser_ordinary_grouped_lines() -> None:
    sections, _ = CVParser._extract_sections(
        "Skills\nFront-end NextJS, TypeScript; Ant Design.\n"
        "Cơ sở dữ liệu PostgreSQL, Redis\nEducation\nUniversity"
    )
    assert sections["skills"] == ["NextJS", "TypeScript", "Ant Design", "PostgreSQL", "Redis"]


def test_job_group_expansion() -> None:
    assert MatchService()._ordered_unique(["Front-end Next.js, TypeScript", "nextjs"]) == [
        ("nextjs", "Next.js"),
        ("typescript", "TypeScript"),
    ]


def test_category_word_in_atomic_skill_is_preserved() -> None:
    assert split_skills(["Database design", "Programming languages theory"]) == [
        "Database design",
        "Programming languages theory",
    ]


def test_standalone_proficiency_labels_are_not_skills() -> None:
    assert split_skills(["Advanced; Python; thành thạo"]) == ["Python"]
