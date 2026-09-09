from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import release_bundle

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "infra/ec2-demo/release_bundle.py"
COMMIT = "a" * 40
BACKEND = "123456789012.dkr.ecr.ap-southeast-2.amazonaws.com/talentpulse-backend@sha256:" + "1" * 64
AI = "123456789012.dkr.ecr.ap-southeast-2.amazonaws.com/talentpulse-ai@sha256:" + "2" * 64


class ReleaseBundleTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.source = self.root / "source"
        self.bundle = self.root / "bundle"
        (self.source / "ai-service").mkdir(parents=True)
        (self.bundle / "nginx").mkdir(parents=True)
        for relative in release_bundle.BUNDLE_FILES:
            source = ROOT / "infra/ec2-demo" / relative
            destination = self.bundle / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, destination)
        for relative in release_bundle.PROVENANCE_FILES:
            source = ROOT / relative
            destination = self.source / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, destination)
            bundle_destination = self.bundle / relative
            bundle_destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, bundle_destination)
        env = (self.bundle / ".env.example").read_text()
        env = env.replace("example.invalid/talentpulse/backend@sha256:replace-me", BACKEND)
        env = env.replace("example.invalid/talentpulse/ai-service@sha256:replace-me", AI)
        (self.bundle / ".env.example").write_text(env)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def run_cli(self, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(SCRIPT), *args],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )

    def generate(self) -> None:
        result = self.run_cli(
            "generate",
            "--bundle-dir",
            str(self.bundle),
            "--source-root",
            str(self.source),
            "--source-commit",
            COMMIT,
            "--backend-image",
            BACKEND,
            "--ai-image",
            AI,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def verify(self, *, commit: str = COMMIT, backend: str = BACKEND, ai: str = AI) -> subprocess.CompletedProcess[str]:
        return self.run_cli(
            "verify",
            "--bundle-dir",
            str(self.bundle),
            "--source-root",
            str(self.source),
            "--source-commit",
            commit,
            "--backend-image",
            backend,
            "--ai-image",
            ai,
        )

    def test_generate_copy_and_verify_uses_relative_paths(self) -> None:
        self.generate()
        copied = self.root / "copied"
        shutil.copytree(self.bundle, copied)
        result = self.run_cli(
            "verify",
            "--bundle-dir",
            str(copied),
            "--source-root",
            str(self.source),
            "--source-commit",
            COMMIT,
            "--backend-image",
            BACKEND,
            "--ai-image",
            AI,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        checksums = (copied / release_bundle.CHECKSUMS_NAME).read_text()
        self.assertTrue(all("  /" not in line for line in checksums.splitlines()))
        manifest = json.loads((copied / release_bundle.MANIFEST_NAME).read_text())
        self.assertEqual(
            {entry["path"] for entry in manifest["provenance_files"]},
            set(release_bundle.PROVENANCE_FILES),
        )

    def test_rejects_absolute_paths_and_extra_objects(self) -> None:
        self.generate()
        checksums = self.bundle / release_bundle.CHECKSUMS_NAME
        lines = checksums.read_text().splitlines()
        checksums.write_text(lines[0].split("  ")[0] + "  /tmp/absolute-path\n" + "\n".join(lines[1:]) + "\n")
        result = self.verify()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("relative", result.stderr)
        checksums.write_text("\n".join(lines) + "\n")
        manifest_path = self.bundle / release_bundle.MANIFEST_NAME
        manifest = json.loads(manifest_path.read_text())
        manifest["bundle_files"][0]["path"] = "/tmp/absolute-path"
        manifest_path.write_text(json.dumps(manifest))
        self.assertNotEqual(self.verify().returncode, 0)
        self.generate()
        (self.bundle / "unexpected.txt").write_text("unexpected\n")
        self.assertNotEqual(self.verify().returncode, 0)

    def test_rejects_mismatched_commit_and_digests(self) -> None:
        self.generate()
        self.assertNotEqual(self.verify(commit="b" * 40).returncode, 0)
        self.assertNotEqual(self.verify(backend=BACKEND.replace("1" * 64, "3" * 64)).returncode, 0)
        self.assertNotEqual(self.verify(ai=AI.replace("2" * 64, "4" * 64)).returncode, 0)

    def test_rejects_secret_like_provenance_content(self) -> None:
        self.generate()
        pyproject = self.source / "ai-service/pyproject.toml"
        pyproject.write_text(pyproject.read_text() + "\nAWS_SECRET_ACCESS_KEY=AKIA1234567890ABCDEF\n")
        result = self.verify()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("secret", result.stderr.lower())

    def test_rejects_missing_pyproject_provenance_object(self) -> None:
        self.generate()
        (self.bundle / "ai-service/pyproject.toml").unlink()
        result = self.verify()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("object set", result.stderr.lower())

    def test_rejects_tampered_uv_lock_provenance_object(self) -> None:
        self.generate()
        uv_lock = self.bundle / "ai-service/uv.lock"
        uv_lock.write_text(uv_lock.read_text() + "\n# tampered\n")
        result = self.verify()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("sha256sums", result.stderr.lower())

    def test_host_entrypoint_extracts_ai_provenance_before_verification(self) -> None:
        entrypoint = (ROOT / "infra/ec2-demo/ai-entrypoint.sh").read_text(encoding="utf-8")
        self.assertIn('docker pull "$ai_image"', entrypoint)
        self.assertIn('ai_container="$(docker create "$ai_image")"', entrypoint)
        self.assertIn('docker cp "$ai_container:/app/pyproject.toml"', entrypoint)
        self.assertIn('docker cp "$ai_container:/app/uv.lock"', entrypoint)
        self.assertIn('--source-root "$provenance_source"', entrypoint)
        self.assertIn('cmp -s "$release/ai-service/pyproject.toml"', entrypoint)
        self.assertIn('cmp -s "$release/ai-service/uv.lock"', entrypoint)


if __name__ == "__main__":
    unittest.main()
