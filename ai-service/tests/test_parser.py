import base64
import io
import zipfile
from uuid import uuid4


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
