#!/usr/bin/env python3
"""Generate and verify the immutable EC2 demo release bundle contract."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path, PurePosixPath
from typing import Any

SCHEMA_VERSION = 1
MANIFEST_NAME = "RELEASE-MANIFEST.json"
CHECKSUMS_NAME = "SHA256SUMS"
BUNDLE_FILES = (
    ".env.example",
    "ai-entrypoint.sh",
    "docker-compose.yml",
    "nginx/default.conf",
    "release_bundle.py",
)
PROVENANCE_FILES = (
    "ai-service/pyproject.toml",
    "ai-service/uv.lock",
)
COMMIT_RE = re.compile(r"^[0-9a-f]{40}$")
DIGEST_IMAGE_RE = re.compile(r"^[^@\s]+@sha256:[0-9a-f]{64}$")
CHECKSUM_RE = re.compile(r"^([0-9a-f]{64})  (.+)$")
SECRET_VALUE_RE = re.compile(
    r"(?im)^\s*[A-Za-z_][A-Za-z0-9_]*(?:SECRET|PASSWORD|PASSWD|TOKEN|"
    r"API[_-]?KEY|PRIVATE[_-]?KEY|CREDENTIALS?)\s*=\s*([^\r\n]*)$"
)
SECRET_PATTERN_RE = re.compile(
    r"(?i)(?:AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|"
    r"-----BEGIN [^-\r\n]*PRIVATE KEY-----|"
    r"-----END [^-\r\n]*PRIVATE KEY-----|"
    r"(?:gh[pousr]|xox[baprs])-[A-Za-z0-9-]{20,}|"
    r"sk-[A-Za-z0-9_-]{20,})"
)


class ReleaseBundleError(ValueError):
    """Raised when a release bundle violates the local release contract."""


def _fail(message: str) -> None:
    raise ReleaseBundleError(message)


def _relative_path(value: str) -> str:
    if not value or value.startswith("/") or "\\" in value:
        _fail(f"path must be relative and POSIX-style: {value!r}")
    path = PurePosixPath(value)
    if str(path) != value or path.is_absolute() or any(part in ("", ".", "..") for part in path.parts):
        _fail(f"path must be a normalized relative path: {value!r}")
    return value


def _file(root: Path, relative: str) -> Path:
    _relative_path(relative)
    root = root.resolve()
    candidate = (root / relative).resolve()
    try:
        candidate.relative_to(root)
    except ValueError:
        _fail(f"path escapes bundle root: {relative!r}")
    if not candidate.is_file() or candidate.is_symlink():
        _fail(f"bundle object is not a regular file: {relative}")
    return candidate


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _placeholder(value: str) -> bool:
    value = value.strip().strip('"').strip("'").strip().lower()
    return (
        not value
        or value.startswith("replace-with")
        or value.startswith("replace_me")
        or value in {"placeholder", "dummy"}
        or value.startswith("your-")
        or value.startswith("example.invalid")
        or (value.startswith("<") and value.endswith(">"))
    )


def _assert_no_secrets(path: Path) -> None:
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        _fail(f"release provenance file is not UTF-8 text: {path.name}")
    if SECRET_PATTERN_RE.search(text):
        _fail(f"secret-like value found in release provenance file: {path.name}")
    for match in SECRET_VALUE_RE.finditer(text):
        if not _placeholder(match.group(1)):
            _fail(f"non-placeholder secret-like assignment in: {path.name}")


def _commit(value: str) -> str:
    normalized = value.lower()
    if not COMMIT_RE.fullmatch(normalized):
        _fail("source commit must be a 40-character lowercase hexadecimal SHA")
    return normalized


def _image(value: str, name: str) -> str:
    if (
        not DIGEST_IMAGE_RE.fullmatch(value)
        or "://" in value
        or any(character in value for character in "?$%\"'\n\r")
        or SECRET_PATTERN_RE.search(value)
    ):
        _fail(f"{name} image must be a non-secret immutable @sha256 digest URI")
    return value


def _json_hash_entries(value: Any, field: str, expected_paths: tuple[str, ...]) -> dict[str, str]:
    if not isinstance(value, list):
        _fail(f"manifest {field} must be a list")
    entries: dict[str, str] = {}
    for entry in value:
        if not isinstance(entry, dict) or set(entry) != {"path", "sha256"}:
            _fail(f"manifest {field} contains an invalid entry")
        relative = _relative_path(str(entry["path"]))
        digest = entry["sha256"]
        if not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest):
            _fail(f"manifest {field} has an invalid SHA256 for {relative}")
        if relative in entries:
            _fail(f"manifest {field} contains a duplicate path: {relative}")
        entries[relative] = digest
    if set(entries) != set(expected_paths):
        _fail(f"manifest {field} object set does not match the release contract")
    return entries


def _actual_files(root: Path) -> set[str]:
    actual: set[str] = set()
    for path in root.rglob("*"):
        if path.is_file() and not path.is_symlink():
            actual.add(path.relative_to(root).as_posix())
    return actual


def _read_manifest(bundle_dir: Path) -> dict[str, Any]:
    manifest_path = _file(bundle_dir, MANIFEST_NAME)
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        _fail(f"release manifest is not valid JSON: {exc}")
    if not isinstance(manifest, dict):
        _fail("release manifest must be a JSON object")
    return manifest


def _checksum_entries(bundle_dir: Path) -> dict[str, str]:
    checksums_path = _file(bundle_dir, CHECKSUMS_NAME)
    entries: dict[str, str] = {}
    for line_number, line in enumerate(checksums_path.read_text(encoding="utf-8").splitlines(), 1):
        match = CHECKSUM_RE.fullmatch(line)
        if match is None:
            _fail(f"SHA256SUMS line {line_number} is not a relative-path checksum entry")
        digest, relative = match.groups()
        relative = _relative_path(relative)
        if relative in entries:
            _fail(f"SHA256SUMS contains a duplicate path: {relative}")
        entries[relative] = digest
    return entries


def generate_bundle(
    bundle_dir: Path,
    source_root: Path,
    source_commit: str,
    backend_image: str,
    ai_image: str,
) -> dict[str, Any]:
    bundle_dir = bundle_dir.resolve()
    source_root = source_root.resolve()
    commit = _commit(source_commit)
    backend = _image(backend_image, "backend")
    ai = _image(ai_image, "AI")
    for relative in BUNDLE_FILES:
        _file(bundle_dir, relative)
        _assert_no_secrets(bundle_dir / relative)
    provenance: list[dict[str, str]] = []
    for relative in PROVENANCE_FILES:
        source_file = _file(source_root, relative)
        _assert_no_secrets(source_file)
        destination = bundle_dir / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(source_file.read_bytes())
        provenance.append({"path": relative, "sha256": sha256_file(source_file)})
    manifest: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "source_commit": commit,
        "images": {"backend": backend, "ai": ai},
        "bundle_files": [
            {"path": relative, "sha256": sha256_file(_file(bundle_dir, relative))}
            for relative in BUNDLE_FILES
        ],
        "provenance_files": provenance,
        "checksum_manifest": CHECKSUMS_NAME,
    }
    (bundle_dir / MANIFEST_NAME).write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    checksum_paths = (*BUNDLE_FILES, *PROVENANCE_FILES, MANIFEST_NAME)
    (bundle_dir / CHECKSUMS_NAME).write_text(
        "".join(f"{sha256_file(_file(bundle_dir, relative))}  {relative}\n" for relative in checksum_paths),
        encoding="utf-8",
    )
    verify_bundle(bundle_dir, source_root, commit, backend, ai)
    return manifest


def verify_bundle(
    bundle_dir: Path,
    source_root: Path | None,
    source_commit: str,
    backend_image: str,
    ai_image: str,
) -> None:
    bundle_dir = bundle_dir.resolve()
    commit = _commit(source_commit)
    backend = _image(backend_image, "backend")
    ai = _image(ai_image, "AI")
    manifest = _read_manifest(bundle_dir)
    if manifest.get("schema_version") != SCHEMA_VERSION:
        _fail("unsupported release manifest schema version")
    if manifest.get("source_commit") != commit:
        _fail("release manifest source commit does not match the requested commit")
    if manifest.get("images") != {"backend": backend, "ai": ai}:
        _fail("release manifest image digests do not match the requested images")
    bundle_hashes = _json_hash_entries(manifest.get("bundle_files"), "bundle_files", BUNDLE_FILES)
    provenance_hashes = _json_hash_entries(manifest.get("provenance_files"), "provenance_files", PROVENANCE_FILES)
    if manifest.get("checksum_manifest") != CHECKSUMS_NAME:
        _fail("release manifest checksum manifest name is invalid")

    expected_objects = set(BUNDLE_FILES) | set(PROVENANCE_FILES) | {MANIFEST_NAME, CHECKSUMS_NAME}
    if _actual_files(bundle_dir) != expected_objects:
        _fail("bundle object set does not match the release contract")
    checksums = _checksum_entries(bundle_dir)
    expected_checksums = set(BUNDLE_FILES) | set(PROVENANCE_FILES) | {MANIFEST_NAME}
    if set(checksums) != expected_checksums:
        _fail("SHA256SUMS object set does not match the release contract")
    for relative, expected in checksums.items():
        actual = sha256_file(_file(bundle_dir, relative))
        if actual != expected:
            _fail(f"SHA256SUMS hash mismatch: {relative}")
    for relative, expected in bundle_hashes.items():
        if sha256_file(_file(bundle_dir, relative)) != expected:
            _fail(f"manifest bundle hash mismatch: {relative}")
        _assert_no_secrets(_file(bundle_dir, relative))
    for relative, expected in provenance_hashes.items():
        provenance_file = _file(bundle_dir, relative)
        _assert_no_secrets(provenance_file)
        if sha256_file(provenance_file) != expected:
            _fail(f"manifest provenance object hash mismatch: {relative}")
    if source_root is not None:
        source_root = source_root.resolve()
        for relative, expected in provenance_hashes.items():
            source_file = _file(source_root, relative)
            _assert_no_secrets(source_file)
            if sha256_file(source_file) != expected:
                _fail(f"manifest provenance hash mismatch: {relative}")

    env_text = _file(bundle_dir, ".env.example").read_text(encoding="utf-8")
    env_values = dict(re.findall(r"(?m)^((?:BACKEND_IMAGE|AI_SERVICE_IMAGE))=(.+)$", env_text))
    if env_values.get("BACKEND_IMAGE") != backend or env_values.get("AI_SERVICE_IMAGE") != ai:
        _fail("bundle environment image digests do not match the requested images")


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    for command in ("generate", "verify"):
        subparser = subparsers.add_parser(command)
        subparser.add_argument("--bundle-dir", type=Path, required=True)
        subparser.add_argument("--source-commit", required=True)
        subparser.add_argument("--backend-image", required=True)
        subparser.add_argument("--ai-image", required=True)
        if command == "generate":
            subparser.add_argument("--source-root", type=Path, required=True)
        else:
            subparser.add_argument("--source-root", type=Path)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        if args.command == "generate":
            generate_bundle(args.bundle_dir, args.source_root, args.source_commit, args.backend_image, args.ai_image)
        else:
            verify_bundle(args.bundle_dir, args.source_root, args.source_commit, args.backend_image, args.ai_image)
    except (OSError, ReleaseBundleError) as exc:
        print(f"release bundle rejected: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
