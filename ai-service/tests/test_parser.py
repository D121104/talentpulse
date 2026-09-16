import base64
import hashlib
import io
import os
import stat
import subprocess
import tempfile
import zipfile
from pathlib import Path
from uuid import uuid4

import app.infrastructure.parsers as parser_module
import pytest
from app.core.config import Settings
from app.core.errors import ServiceError
from app.domain.contracts import MediaType
from app.infrastructure.parsers import CVParser
from docx import Document
from pydantic import ValidationError


def parse_payload(
    content: bytes,
    filename: str = "resume.pdf",
    media_type: str = "application/pdf",
) -> dict[str, str]:
    return {
        "cv_id": str(uuid4()),
        "filename": filename,
        "media_type": media_type,
        "content_base64": base64.b64encode(content).decode(),
    }


def zip_package(members: dict[str, bytes]) -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, content in members.items():
            archive.writestr(name, content)
    return output.getvalue()


def test_parser_rejects_upload_above_configured_limit(client) -> None:
    response = client.post("/internal/v1/cv/parse", json=parse_payload(b"x" * 1025))
    assert response.status_code == 413
    assert response.json() == {
        "code": "payload_too_large",
        "message": "CV file exceeds the configured size limit.",
    }


def test_parser_rejects_invalid_base64_without_exposing_content(client) -> None:
    payload = parse_payload(b"x")
    payload["content_base64"] = "not base64"
    response = client.post("/internal/v1/cv/parse", json=payload)
    assert response.status_code == 400
    assert response.json()["code"] == "invalid_base64"
    assert "not base64" not in response.text


def test_parser_rejects_encoded_content_above_configured_limit(client, settings) -> None:
    settings.max_encoded_upload_chars = 4
    response = client.post(
        "/internal/v1/cv/parse",
        json=parse_payload(b"%PDF-"),
    )
    assert response.status_code == 413
    assert response.json()["code"] == "encoded_payload_too_large"


def test_parser_rejects_media_type_and_filename_mismatch(client) -> None:
    payload = parse_payload(b"%PDF-", filename="resume.docx")
    response = client.post("/internal/v1/cv/parse", json=payload)
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_request"


def test_parser_rejects_pdf_without_pdf_magic(client) -> None:
    response = client.post("/internal/v1/cv/parse", json=parse_payload(b"not a pdf"))
    assert response.status_code == 400
    assert response.json() == {
        "code": "invalid_file_signature",
        "message": "CV file signature does not match the declared media type.",
    }


def test_parser_rejects_docx_with_invalid_ooxml_content_type(client) -> None:
    content = zip_package(
        {
            "[Content_Types].xml": (
                b'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                b'<Override PartName="/word/document.xml" ContentType="text/plain"/>'
                b"</Types>"
            ),
            "_rels/.rels": b"rels",
            "word/document.xml": b"document",
        }
    )
    response = client.post(
        "/internal/v1/cv/parse",
        json=parse_payload(
            content,
            filename="resume.docx",
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ),
    )
    assert response.status_code == 400
    assert response.json()["code"] == "invalid_docx"


def test_parser_rejects_docx_with_too_many_zip_members(client, settings) -> None:
    settings.max_docx_members = 2
    content = zip_package(
        {
            "[Content_Types].xml": b"types",
            "_rels/.rels": b"rels",
            "word/document.xml": b"document",
        }
    )
    response = client.post(
        "/internal/v1/cv/parse",
        json=parse_payload(
            content,
            filename="resume.docx",
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ),
    )
    assert response.status_code == 413
    assert response.json() == {
        "code": "zip_member_count_exceeded",
        "message": "DOCX contains too many package members.",
    }


def test_parser_rejects_unsafe_docx_member_path(client) -> None:
    content = zip_package(
        {
            "../word/document.xml": b"document",
        }
    )
    response = client.post(
        "/internal/v1/cv/parse",
        json=parse_payload(
            content,
            filename="resume.docx",
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ),
    )
    assert response.status_code == 400
    assert response.json() == {
        "code": "unsafe_zip_path",
        "message": "DOCX contains an unsafe package path.",
    }


def docx_content(paragraphs: list[tuple[str, str]]) -> bytes:
    document = Document()
    for text, style in paragraphs:
        document.add_paragraph(text, style=style)
    output = io.BytesIO()
    document.save(output)
    return output.getvalue()


def test_parser_extracts_sections_from_no_colon_flattened_text_fixture() -> None:
    flattened_text = (
        Path(__file__)
        .with_name("fixtures")
        .joinpath("flattened_cv.txt")
        .read_text(encoding="utf-8")
    )

    sections, warnings = CVParser._extract_sections(flattened_text)

    assert sections["skills"] == [
        "Python",
        "FastAPI",
        "PostgreSQL",
        "Docker",
        "Communication",
        "teamwork",
    ]
    assert sections["education"] == ["BSc Computer Science, Example University"]
    assert sections["experience"] == ["Backend Engineer at Example Co (2022-2025)"]
    assert sections["certificates"] == ["AWS Certified Developer"]
    assert warnings == ["Some CV content was outside recognized sections."]


def test_parser_ignores_personal_projects_between_stored_sections() -> None:
    structured_text = """\
EDUCATION
BSc Computer Science
Example University
2020-2024
PERSONAL PROJECTS
Project Atlas
Built a synthetic hiring dashboard.
Python, FastAPI, PostgreSQL
Role: Backend contributor
Result: Reduced review time
CERTIFICATES
AWS Certified Developer
"""

    sections, warnings = CVParser._extract_sections(structured_text)

    assert sections == {
        "skills": [],
        "education": ["BSc Computer Science", "Example University", "2020-2024"],
        "experience": [],
        "certificates": ["AWS Certified Developer"],
    }
    assert warnings == ["Some CV content was outside recognized sections."]


def test_parser_ignores_personal_projects_in_inline_heading_text() -> None:
    inline_text = (
        "Education: BSc Synthetic University "
        "Personal Projects: Project Atlas, synthetic dashboard, FastAPI "
        "Certificates: Synthetic Cloud Certificate"
    )

    sections, warnings = CVParser._extract_sections(inline_text)

    assert sections == {
        "skills": [],
        "education": ["BSc Synthetic University"],
        "experience": [],
        "certificates": ["Synthetic Cloud Certificate"],
    }
    assert warnings == ["Some CV content was outside recognized sections."]


def test_parser_returns_bounded_structured_sections(client, settings) -> None:
    settings.max_upload_bytes = 100_000
    content = docx_content(
        [
            ("Profile text without a recognized section", "Normal"),
            ("Skills:", "Heading 1"),
            ("Python", "List Bullet"),
            ("Python", "List Bullet"),
            ("PostgreSQL", "List Bullet"),
            ("Education", "Heading 1"),
            ("BSc Computer Science, Example University", "Normal"),
            ("Experience", "Heading 1"),
            ("Backend Engineer - Acme (2022-2025)", "List Bullet"),
            ("Certificates:", "Heading 1"),
            ("AWS Certified Developer", "List Bullet"),
        ]
    )

    response = client.post(
        "/internal/v1/cv/parse",
        json=parse_payload(
            content,
            filename="resume.docx",
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["extracted_text"]
    assert body["text_char_count"] == len(body["extracted_text"])
    assert body["skills"] == ["Python", "PostgreSQL"]
    assert body["education"] == ["BSc Computer Science, Example University"]
    assert body["experience"] == ["Backend Engineer - Acme (2022-2025)"]
    assert body["certificates"] == ["AWS Certified Developer"]
    assert body["warnings"] == ["Some CV content was outside recognized sections."]
    assert body["parser_version"] == "structured-parser-v1"
    assert len(body["skills"]) <= 50
    assert all(len(item) <= 500 for item in body["skills"])


def test_parser_rejects_empty_and_no_text_documents(client, settings) -> None:
    with pytest.raises(ServiceError, match="CV file is empty"):
        CVParser(settings).parse(b"", MediaType.PDF)

    settings.max_upload_bytes = 100_000
    no_text = docx_content([])
    no_text_response = client.post(
        "/internal/v1/cv/parse",
        json=parse_payload(
            no_text,
            filename="resume.docx",
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ),
    )
    assert no_text_response.status_code == 400
    assert no_text_response.json()["code"] == "no_extractable_text"


def test_parser_bounds_structured_items_and_reports_truncation(client, settings) -> None:
    settings.max_upload_bytes = 100_000
    content = docx_content(
        [("Skills", "Heading 1")] + [(f"Skill {index}", "List Bullet") for index in range(60)]
    )
    response = client.post(
        "/internal/v1/cv/parse",
        json=parse_payload(
            content,
            filename="resume.docx",
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ),
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body["skills"]) == 50
    assert body["warnings"] == ["The skills section was truncated to 50 items."]
    assert all(len(item) <= 500 for item in body["skills"])


SYNTHETIC_PDF = b"%PDF-1.7 synthetic parser fixture"


class SyntheticMediaBox:
    def __init__(self, width: float = 612, height: float = 792) -> None:
        self.width = width
        self.height = height


class SyntheticPdfPage:
    def __init__(
        self,
        text: str,
        *,
        width: float = 612,
        height: float = 792,
    ) -> None:
        self._text = text
        self.mediabox = SyntheticMediaBox(width, height)

    def extract_text(self) -> str:
        return self._text


def install_synthetic_pdf_reader(
    monkeypatch: pytest.MonkeyPatch,
    pages: list[SyntheticPdfPage],
    *,
    encrypted: bool = False,
) -> None:
    class SyntheticPdfReader:
        def __init__(self, *_args: object, **_kwargs: object) -> None:
            self.pages = pages
            self.is_encrypted = encrypted

    monkeypatch.setattr(parser_module, "PdfReader", SyntheticPdfReader)


class FakeProcess:
    def __init__(
        self,
        arguments: list[str],
        *,
        stdout: bytes | None = b"",
        returncode: int = 0,
        timeout: bool = False,
    ) -> None:
        self.arguments = arguments
        self.pid = 99_999_999
        self._returncode = returncode
        self._timeout = timeout
        self._killed = False
        self.wait_timeouts: list[float | None] = []
        self.stdout = None
        if stdout is not None:
            read_fd, write_fd = os.pipe()
            self.stdout = os.fdopen(read_fd, "rb")
            remaining = stdout
            while remaining:
                written = os.write(write_fd, remaining)
                remaining = remaining[written:]
            os.close(write_fd)

    def poll(self) -> int | None:
        if self._timeout and not self._killed:
            return None
        return self._returncode

    def wait(self, timeout: float | None = None) -> int:
        self.wait_timeouts.append(timeout)
        if self._timeout and not self._killed:
            raise subprocess.TimeoutExpired(self.arguments, timeout)
        return self._returncode

    def kill(self) -> None:
        self._killed = True
        self._returncode = -9


class FakePopenRecorder:
    def __init__(
        self,
        ocr_outputs: list[bytes] | None = None,
        *,
        unavailable: bool = False,
        failure_on: str | None = None,
        timeout_on: str | None = None,
    ) -> None:
        self.ocr_outputs = list(ocr_outputs or [])
        self.unavailable = unavailable
        self.failure_on = failure_on
        self.timeout_on = timeout_on
        self.calls: list[list[str]] = []
        self.kwargs: list[dict[str, object]] = []
        self.processes: list[FakeProcess] = []
        self.observed_modes: dict[str, int] = {}

    def __call__(self, arguments: list[str], **kwargs: object) -> FakeProcess:
        command = list(arguments)
        self.calls.append(command)
        self.kwargs.append(kwargs)
        executable = command[0]
        if self.unavailable:
            raise FileNotFoundError("/sensitive/tool/path")
        if executable == "pdftoppm":
            output_stem = Path(command[-1])
            rendered_path = output_stem.with_suffix(".png")
            rendered_path.write_bytes(b"synthetic-image")
            process = FakeProcess(command, stdout=None)
        else:
            image_path = Path(command[1])
            self.observed_modes["directory"] = stat.S_IMODE(image_path.parent.stat().st_mode)
            self.observed_modes["image"] = stat.S_IMODE(image_path.stat().st_mode)
            input_paths = list(image_path.parent.glob("input-*.pdf"))
            if input_paths:
                self.observed_modes["input"] = stat.S_IMODE(input_paths[0].stat().st_mode)
            output = self.ocr_outputs.pop(0) if self.ocr_outputs else b""
            process = FakeProcess(
                command,
                stdout=output,
                returncode=1 if self.failure_on == executable else 0,
                timeout=self.timeout_on == executable,
            )
        self.processes.append(process)
        return process


def enable_ocr(settings: Settings) -> None:
    settings.cv_ocr_enabled = True
    settings.max_pdf_pages = 10


def native_structured_text() -> str:
    return (
        "Profile: Synthetic candidate\n"
        "Skills:\nPython\n"
        "Education:\nBSc Synthetic University\n"
        "Experience:\nBackend Engineer\n"
        "Certificates:\nSynthetic Cloud Certificate"
    )


def ocr_structured_text() -> str:
    return (
        "Skills:\nPython\nFastAPI\n"
        "Education:\nBSc OCR University\n"
        "Experience:\nOCR Engineer\n"
        "Certificates:\nOCR Certificate"
    )


def test_ocr_settings_are_disabled_bounded_and_allowlisted() -> None:
    defaults = Settings(_env_file=None)
    assert defaults.cv_ocr_enabled is False
    assert defaults.cv_ocr_native_text_min_chars == 250
    assert defaults.cv_ocr_max_pages == 5
    assert defaults.cv_ocr_dpi == 200
    assert defaults.cv_ocr_max_stdout_bytes == 1_000_000
    assert defaults.cv_ocr_languages == ("eng", "vie")

    with pytest.raises(ValidationError):
        Settings(_env_file=None, cv_ocr_languages=("fra",))
    with pytest.raises(ValidationError):
        Settings(_env_file=None, cv_ocr_languages=("eng", "vie", "deu"))
    with pytest.raises(ValidationError):
        Settings(_env_file=None, cv_ocr_dpi=149)
    with pytest.raises(ValidationError):
        Settings(_env_file=None, cv_ocr_max_pages=11)


def test_ocr_is_not_invoked_for_good_native_parse(monkeypatch, settings) -> None:
    enable_ocr(settings)
    settings.cv_ocr_native_text_min_chars = 50
    pages = [SyntheticPdfPage(native_structured_text())]
    install_synthetic_pdf_reader(monkeypatch, pages)
    recorder = FakePopenRecorder()
    monkeypatch.setattr(subprocess, "Popen", recorder)

    result = CVParser(settings).parse(SYNTHETIC_PDF, MediaType.PDF)

    assert result.parser_version == "structured-parser-v1"
    assert result.skills == ["Python"]
    assert recorder.calls == []


def test_ocr_triggers_for_native_text_with_empty_structure(monkeypatch, settings) -> None:
    enable_ocr(settings)
    native_text = "Profile " + ("synthetic candidate ") * 30
    install_synthetic_pdf_reader(monkeypatch, [SyntheticPdfPage(native_text)])
    recorder = FakePopenRecorder([b"No recognized headings"])
    monkeypatch.setattr(subprocess, "Popen", recorder)

    result = CVParser(settings).parse(SYNTHETIC_PDF, MediaType.PDF)

    assert result.parser_version == "structured-parser-v1"
    assert [call[0] for call in recorder.calls] == ["pdftoppm", "tesseract"]


def test_scanned_pdf_uses_ocr_candidate(monkeypatch, settings) -> None:
    enable_ocr(settings)
    install_synthetic_pdf_reader(monkeypatch, [SyntheticPdfPage("")])
    recorder = FakePopenRecorder([ocr_structured_text().encode()])
    monkeypatch.setattr(subprocess, "Popen", recorder)

    result = CVParser(settings).parse(SYNTHETIC_PDF, MediaType.PDF)

    assert result.parser_version == "structured-parser-v1+local-ocr-v1"
    assert result.extracted_text == CVParser._normalize_text(ocr_structured_text())
    assert result.skills == ["Python", "FastAPI"]
    assert result.content_sha256 == hashlib.sha256(SYNTHETIC_PDF).hexdigest()


def test_ocr_wins_only_when_quality_strictly_improves(monkeypatch, settings) -> None:
    enable_ocr(settings)
    native_text = "Native profile\nSkills:\nNative Python"
    install_synthetic_pdf_reader(monkeypatch, [SyntheticPdfPage(native_text)])
    recorder = FakePopenRecorder([ocr_structured_text().encode()])
    monkeypatch.setattr(subprocess, "Popen", recorder)

    result = CVParser(settings).parse(SYNTHETIC_PDF, MediaType.PDF)

    assert result.parser_version == "structured-parser-v1+local-ocr-v1"
    assert result.extracted_text == CVParser._normalize_text(ocr_structured_text())
    assert "Native profile" not in result.extracted_text


def test_native_candidate_wins_ocr_quality_tie(monkeypatch, settings) -> None:
    enable_ocr(settings)
    native_text = "Native profile\nSkills:\nNative Python"
    install_synthetic_pdf_reader(monkeypatch, [SyntheticPdfPage(native_text)])
    recorder = FakePopenRecorder([b"Skills:\nOCR Python"])
    monkeypatch.setattr(subprocess, "Popen", recorder)

    result = CVParser(settings).parse(SYNTHETIC_PDF, MediaType.PDF)

    assert result.parser_version == "structured-parser-v1"
    assert result.extracted_text == CVParser._normalize_text(native_text)
    assert "OCR Python" not in result.extracted_text


def test_disabled_ocr_keeps_native_empty_behavior(monkeypatch, settings) -> None:
    install_synthetic_pdf_reader(monkeypatch, [SyntheticPdfPage("")])
    recorder = FakePopenRecorder([ocr_structured_text().encode()])
    monkeypatch.setattr(subprocess, "Popen", recorder)

    with pytest.raises(ServiceError) as error:
        CVParser(settings).parse(SYNTHETIC_PDF, MediaType.PDF)

    assert error.value.code == "no_extractable_text"
    assert recorder.calls == []


def test_docx_remains_native_only_when_ocr_enabled(monkeypatch, settings) -> None:
    enable_ocr(settings)
    settings.max_upload_bytes = 100_000
    recorder = FakePopenRecorder()
    monkeypatch.setattr(subprocess, "Popen", recorder)
    content = docx_content([("Skills", "Heading 1"), ("Python", "List Bullet")])

    result = CVParser(settings).parse(content, MediaType.DOCX)

    assert result.parser_version == "structured-parser-v1"
    assert result.skills == ["Python"]
    assert recorder.calls == []


@pytest.mark.parametrize("failure", ["unavailable", "timeout", "nonzero"])
def test_ocr_failure_falls_back_without_sensitive_details(monkeypatch, settings, failure) -> None:
    enable_ocr(settings)
    native_text = "Native text that is usable even without recognized sections."
    install_synthetic_pdf_reader(monkeypatch, [SyntheticPdfPage(native_text)])
    recorder = FakePopenRecorder(
        [ocr_structured_text().encode()],
        unavailable=failure == "unavailable",
        timeout_on="tesseract" if failure == "timeout" else None,
        failure_on="tesseract" if failure == "nonzero" else None,
    )
    monkeypatch.setattr(subprocess, "Popen", recorder)

    result = CVParser(settings).parse(SYNTHETIC_PDF, MediaType.PDF)

    assert result.parser_version == "structured-parser-v1"
    assert result.extracted_text == CVParser._normalize_text(native_text)
    assert any("Local OCR" in warning for warning in result.warnings)
    assert "/sensitive/tool/path" not in " ".join(result.warnings)
    assert "synthetic" not in " ".join(result.warnings).lower()


def test_no_native_text_and_unavailable_ocr_returns_retryable_sanitized_error(
    monkeypatch, settings
) -> None:
    enable_ocr(settings)
    install_synthetic_pdf_reader(monkeypatch, [SyntheticPdfPage("")])
    recorder = FakePopenRecorder(unavailable=True)
    monkeypatch.setattr(subprocess, "Popen", recorder)

    with pytest.raises(ServiceError) as error:
        CVParser(settings).parse(SYNTHETIC_PDF, MediaType.PDF)

    assert error.value.code == "ocr_unavailable"
    assert error.value.status_code == 503
    assert "/sensitive/tool/path" not in str(error.value)
    assert recorder.calls
    assert recorder.calls[0][0] == "pdftoppm"


def test_ocr_page_and_pixel_bounds_are_enforced(monkeypatch, settings) -> None:
    enable_ocr(settings)
    settings.cv_ocr_max_pages = 1
    settings.cv_ocr_max_render_pixels = 10_000_000
    pages = [
        SyntheticPdfPage("", width=612, height=792),
        SyntheticPdfPage("", width=612, height=792),
    ]
    install_synthetic_pdf_reader(monkeypatch, pages)
    recorder = FakePopenRecorder([ocr_structured_text().encode()])
    monkeypatch.setattr(subprocess, "Popen", recorder)

    result = CVParser(settings).parse(SYNTHETIC_PDF, MediaType.PDF)

    assert result.parser_version == "structured-parser-v1+local-ocr-v1"
    render_calls = [call for call in recorder.calls if call[0] == "pdftoppm"]
    assert len(render_calls) == 1
    assert render_calls[0][render_calls[0].index("-f") + 1] == "1"
    assert any("page count" in warning.lower() for warning in result.warnings)


def test_ocr_pixel_bound_skips_oversized_page_and_processes_safe_page(
    monkeypatch, settings
) -> None:
    enable_ocr(settings)
    settings.cv_ocr_max_render_pixels = 100_000
    pages = [
        SyntheticPdfPage("", width=1_000, height=1_000),
        SyntheticPdfPage("", width=72, height=72),
    ]
    install_synthetic_pdf_reader(monkeypatch, pages)
    recorder = FakePopenRecorder([ocr_structured_text().encode()])
    monkeypatch.setattr(subprocess, "Popen", recorder)

    result = CVParser(settings).parse(SYNTHETIC_PDF, MediaType.PDF)

    render_calls = [call for call in recorder.calls if call[0] == "pdftoppm"]
    assert len(render_calls) == 1
    assert render_calls[0][render_calls[0].index("-f") + 1] == "2"
    assert any("pixel" in warning.lower() for warning in result.warnings)


def test_ocr_stdout_bound_falls_back_to_native(monkeypatch, settings) -> None:
    enable_ocr(settings)
    settings.cv_ocr_max_stdout_bytes = 1_024
    native_text = "Native text remains available when OCR output is too large."
    install_synthetic_pdf_reader(monkeypatch, [SyntheticPdfPage(native_text)])
    recorder = FakePopenRecorder([b"x" * 2_048])
    monkeypatch.setattr(subprocess, "Popen", recorder)

    result = CVParser(settings).parse(SYNTHETIC_PDF, MediaType.PDF)

    assert result.parser_version == "structured-parser-v1"
    assert result.extracted_text == CVParser._normalize_text(native_text)
    assert any("Local OCR" in warning for warning in result.warnings)
    assert "x" * 100 not in " ".join(result.warnings)


def test_ocr_commands_are_fixed_and_do_not_include_user_content(monkeypatch, settings) -> None:
    enable_ocr(settings)
    settings.cv_ocr_languages = ("eng", "vie")
    native_text = "Profile --dangerous; Skills are described in arbitrary prose."
    install_synthetic_pdf_reader(monkeypatch, [SyntheticPdfPage(native_text)])
    recorder = FakePopenRecorder([ocr_structured_text().encode()])
    monkeypatch.setattr(subprocess, "Popen", recorder)

    CVParser(settings).parse(SYNTHETIC_PDF, MediaType.PDF)

    render, recognize = recorder.calls
    assert render[0] == "pdftoppm"
    assert recognize[0] == "tesseract"
    assert recognize[recognize.index("-l") + 1] == "eng+vie"
    assert recognize[recognize.index("--oem") + 1] == "1"
    assert recognize[recognize.index("--psm") + 1] == "3"
    assert all("dangerous" not in argument for argument in render + recognize)
    assert all("Skills are described" not in argument for argument in render + recognize)
    for kwargs in recorder.kwargs:
        assert kwargs["shell"] is False
        assert kwargs["stderr"] is subprocess.DEVNULL
        assert kwargs["stdin"] is subprocess.DEVNULL


def test_ocr_temp_files_are_private_and_cleaned_up(monkeypatch, settings, tmp_path) -> None:
    enable_ocr(settings)
    install_synthetic_pdf_reader(monkeypatch, [SyntheticPdfPage("")])
    recorder = FakePopenRecorder([ocr_structured_text().encode()])
    monkeypatch.setattr(subprocess, "Popen", recorder)
    monkeypatch.setattr(tempfile, "tempdir", str(tmp_path))

    result = CVParser(settings).parse(SYNTHETIC_PDF, MediaType.PDF)

    assert result.parser_version == "structured-parser-v1+local-ocr-v1"
    assert recorder.observed_modes == {"directory": 0o700, "image": 0o600, "input": 0o600}
    assert list(tmp_path.iterdir()) == []


def test_encrypted_pdf_is_rejected_before_ocr(monkeypatch, settings) -> None:
    enable_ocr(settings)
    install_synthetic_pdf_reader(monkeypatch, [SyntheticPdfPage("")], encrypted=True)
    recorder = FakePopenRecorder([ocr_structured_text().encode()])
    monkeypatch.setattr(subprocess, "Popen", recorder)

    with pytest.raises(ServiceError) as error:
        CVParser(settings).parse(SYNTHETIC_PDF, MediaType.PDF)

    assert error.value.code == "encrypted_file"
    assert recorder.calls == []


def test_invalid_pdf_is_rejected_before_ocr(monkeypatch, settings) -> None:
    enable_ocr(settings)

    class InvalidPdfReader:
        def __init__(self, *_args: object, **_kwargs: object) -> None:
            raise ValueError("sensitive PDF parser details")

    monkeypatch.setattr(parser_module, "PdfReader", InvalidPdfReader)
    recorder = FakePopenRecorder([ocr_structured_text().encode()])
    monkeypatch.setattr(subprocess, "Popen", recorder)

    with pytest.raises(ServiceError) as error:
        CVParser(settings).parse(SYNTHETIC_PDF, MediaType.PDF)

    assert error.value.code == "parse_failed"
    assert "sensitive PDF parser details" not in str(error.value)
    assert recorder.calls == []


def test_ocr_timeout_is_capped_by_total_budget(monkeypatch, settings) -> None:
    enable_ocr(settings)
    settings.cv_ocr_total_timeout_seconds = 5.0
    settings.cv_ocr_render_timeout_seconds = 30.0
    settings.cv_ocr_recognize_timeout_seconds = 30.0
    install_synthetic_pdf_reader(monkeypatch, [SyntheticPdfPage("Native text")])
    recorder = FakePopenRecorder([ocr_structured_text().encode()])
    monkeypatch.setattr(subprocess, "Popen", recorder)

    CVParser(settings).parse(SYNTHETIC_PDF, MediaType.PDF)

    assert all(
        timeout is None or timeout <= settings.cv_ocr_total_timeout_seconds
        for process in recorder.processes
        for timeout in process.wait_timeouts
    )
