from __future__ import annotations

import hashlib
import io
import posixpath
import zipfile
from xml.etree import ElementTree

from docx import Document
from pypdf import PdfReader

from app.core.config import Settings
from app.core.errors import ServiceError
from app.domain.contracts import MediaType

_OOXML_CONTENT_TYPES = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
}
_CONTENT_TYPES_PATH = "[Content_Types].xml"


class CVParser:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def parse(self, content: bytes, media_type: MediaType) -> tuple[str, str]:
        if len(content) > self._settings.max_upload_bytes:
            raise ServiceError(
                "payload_too_large", "CV file exceeds the configured size limit.", 413
            )
        if not content:
            raise ServiceError("empty_file", "CV file is empty.")
        if media_type is MediaType.PDF:
            self._verify_pdf_signature(content)
            text = self._parse_pdf(content)
        elif media_type is MediaType.DOCX:
            self._inspect_docx_package(content)
            text = self._parse_docx(content)
        else:
            raise ServiceError(
                "unsupported_media_type", "Only PDF and DOCX files are supported.", 415
            )
        text = "\n".join(line.strip() for line in text.splitlines() if line.strip()).strip()
        if not text:
            raise ServiceError("no_extractable_text", "The CV contains no extractable text.")
        if len(text) > self._settings.max_extracted_chars:
            raise ServiceError(
                "extracted_text_too_large", "Extracted CV text exceeds the configured limit.", 413
            )
        return text, hashlib.sha256(content).hexdigest()

    def _verify_pdf_signature(self, content: bytes) -> None:
        if not content.startswith(b"%PDF-"):
            raise ServiceError(
                "invalid_file_signature",
                "CV file signature does not match the declared media type.",
            )

    def _inspect_docx_package(self, content: bytes) -> None:
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as archive:
                infos = archive.infolist()
                if len(infos) > self._settings.max_docx_members:
                    raise ServiceError(
                        "zip_member_count_exceeded",
                        "DOCX contains too many package members.",
                        413,
                    )
                total_uncompressed = 0
                names: set[str] = set()
                for info in infos:
                    name = info.filename
                    normalized = posixpath.normpath(name)
                    path_parts = name.split("/")
                    if (
                        not name
                        or "\x00" in name
                        or name.startswith("/")
                        or "\\" in name
                        or any(part in {".", ".."} for part in path_parts)
                        or normalized in {".", ".."}
                        or normalized.startswith("../")
                    ):
                        raise ServiceError(
                            "unsafe_zip_path",
                            "DOCX contains an unsafe package path.",
                        )
                    if normalized in names:
                        raise ServiceError(
                            "invalid_docx", "DOCX package contains duplicate members."
                        )
                    names.add(normalized)
                    if info.is_dir():
                        continue
                    if (info.external_attr >> 16) & 0o170000 == 0o120000:
                        raise ServiceError(
                            "unsafe_zip_path",
                            "DOCX contains an unsafe package entry.",
                        )
                    if info.compress_type not in {zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED}:
                        raise ServiceError(
                            "invalid_docx", "DOCX uses an unsupported package compression method."
                        )
                    if info.file_size > self._settings.max_docx_member_uncompressed_bytes:
                        raise ServiceError(
                            "zip_member_size_exceeded",
                            "DOCX contains an oversized package member.",
                            413,
                        )
                    total_uncompressed += info.file_size
                    if total_uncompressed > self._settings.max_docx_uncompressed_bytes:
                        raise ServiceError(
                            "decompression_limit_exceeded",
                            "DOCX decompressed content exceeds the configured limit.",
                            413,
                        )
                    if name.lower().endswith((".zip", ".jar", ".7z", ".rar", ".tar", ".gz")):
                        raise ServiceError(
                            "nested_archive_rejected",
                            "DOCX contains a nested archive.",
                        )
                required = {_CONTENT_TYPES_PATH, "word/document.xml"}
                if not required.issubset(names):
                    raise ServiceError(
                        "invalid_docx", "DOCX package is missing required OOXML parts."
                    )
                try:
                    root = ElementTree.fromstring(archive.read(_CONTENT_TYPES_PATH))
                except (ElementTree.ParseError, KeyError, RuntimeError) as exc:
                    raise ServiceError(
                        "invalid_docx", "DOCX content types could not be read safely."
                    ) from exc
                content_type = "{http://schemas.openxmlformats.org/package/2006/content-types}Override"
                document_types = {
                    element.attrib.get("ContentType")
                    for element in root.findall(content_type)
                    if element.attrib.get("PartName") == "/word/document.xml"
                }
                if not document_types.intersection(_OOXML_CONTENT_TYPES):
                    raise ServiceError(
                        "invalid_docx", "DOCX content types do not identify an OOXML document."
                    )
        except ServiceError:
            raise
        except (zipfile.BadZipFile, OSError, ValueError) as exc:
            raise ServiceError("invalid_docx", "DOCX could not be parsed safely.") from exc

    def _parse_pdf(self, content: bytes) -> str:
        try:
            reader = PdfReader(io.BytesIO(content), strict=True)
            if reader.is_encrypted:
                raise ServiceError("encrypted_file", "Encrypted PDF files are not supported.")
            if len(reader.pages) > self._settings.max_pdf_pages:
                raise ServiceError(
                    "page_limit_exceeded", "PDF exceeds the configured page limit.", 413
                )
            text_parts: list[str] = []
            text_size = 0
            for page in reader.pages:
                page_text = page.extract_text() or ""
                text_size += len(page_text)
                if text_size > self._settings.max_extracted_chars:
                    raise ServiceError(
                        "extracted_text_too_large",
                        "Extracted CV text exceeds the configured limit.",
                        413,
                    )
                text_parts.append(page_text)
            return "\n".join(text_parts)
        except ServiceError:
            raise
        except Exception as exc:
            raise ServiceError("parse_failed", "PDF could not be parsed safely.") from exc

    def _parse_docx(self, content: bytes) -> str:
        try:
            document = Document(io.BytesIO(content))
            paragraphs: list[str] = []
            text_size = 0
            for paragraph in document.paragraphs:
                text_size += len(paragraph.text)
                if text_size > self._settings.max_extracted_chars:
                    raise ServiceError(
                        "extracted_text_too_large",
                        "Extracted CV text exceeds the configured limit.",
                        413,
                    )
                paragraphs.append(paragraph.text)
            for table in document.tables:
                for row in table.rows:
                    for cell in row.cells:
                        text_size += len(cell.text)
                        if text_size > self._settings.max_extracted_chars:
                            raise ServiceError(
                                "extracted_text_too_large",
                                "Extracted CV text exceeds the configured limit.",
                                413,
                            )
                        paragraphs.append(cell.text)
            return "\n".join(paragraphs)
        except ServiceError:
            raise
        except (zipfile.BadZipFile, ValueError) as exc:
            raise ServiceError("invalid_docx", "DOCX could not be parsed safely.") from exc
        except Exception as exc:
            raise ServiceError("parse_failed", "DOCX could not be parsed safely.") from exc
