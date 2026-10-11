import base64
import io
import zipfile
from uuid import uuid4

from docx import Document


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


def docx_content(paragraphs: list[tuple[str, str]]) -> bytes:
    document = Document()
    for text, style in paragraphs:
        document.add_paragraph(text, style=style)
    output = io.BytesIO()
    document.save(output)
    return output.getvalue()
