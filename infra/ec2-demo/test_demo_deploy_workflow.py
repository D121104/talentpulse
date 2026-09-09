from __future__ import annotations

import unittest
from pathlib import Path


WORKFLOW = Path(__file__).resolve().parents[2] / ".github/workflows/demo-deploy.yml"


class DemoDeployWorkflowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.workflow = WORKFLOW.read_text(encoding="utf-8")

    def test_quality_job_covers_history_ai_format_and_release_contract(self) -> None:
        self.assertIn("fetch-depth: 0", self.workflow)
        self.assertIn("git merge-base --is-ancestor \"$COMMIT_SHA\" origin/develop", self.workflow)
        self.assertIn("uv run ruff format --check app tests", self.workflow)
        self.assertIn('npx eslint "{src,apps,libs,test}/**/*.ts" --no-fix', self.workflow)
        self.assertIn("python3 -m unittest discover -s infra/ec2-demo -p 'test_*.py' -v", self.workflow)

    def test_oidc_permission_is_limited_to_deployment_job(self) -> None:
        global_permissions = self.workflow.split("jobs:", 1)[0]
        deployment_job = self.workflow.split("  build_and_deploy:", 1)[1]
        self.assertNotIn("id-token: write", global_permissions)
        self.assertIn("permissions:\n      contents: read\n      id-token: write", deployment_job)

    def test_image_admission_waits_for_complete_scan(self) -> None:
        self.assertIn("aws ecr wait image-scan-complete", self.workflow)
        self.assertIn("--query 'imageScanStatus.status'", self.workflow)
        self.assertIn('test "$scan_status" = COMPLETE', self.workflow)

    def test_embedded_shell_uses_checked_conditions_and_safe_jmespath_quotes(self) -> None:
        self.assertNotIn("\n          ! grep ", self.workflow)
        self.assertNotIn("\n          ! python ", self.workflow)
        self.assertIn("if grep -E 'replace-with-runtime-secret", self.workflow)
        self.assertIn(
            '--query "Stacks[0].Outputs[?OutputKey==\\`DemoInstanceId\\`].OutputValue"',
            self.workflow,
        )
        self.assertIn(
            '--query "Stacks[0].Outputs[?OutputKey==\\`DemoDistributionId\\`].OutputValue"',
            self.workflow,
        )

    def test_ssm_rollout_validates_deployment_boundary_values(self) -> None:
        rollout = self.workflow.split("      - name: Send bounded SSM rollout and verify readiness", 1)[1].split(
            "      - name: Enable CloudFront", 1
        )[0]
        for variable in (
            "DEPLOYMENT_BUNDLE_BUCKET",
            "INSTANCE_ID",
            "COMMIT_SHA",
            "MIGRATION_MODE",
            "BACKEND_IMAGE",
            "AI_SERVICE_IMAGE",
        ):
            self.assertIn(f'"{variable}"', rollout)
        self.assertIn('r"[0-9a-f]{40}"', rollout)
        self.assertIn('r"(?:skip|run)"', rollout)
        self.assertIn('r"i-[0-9a-f]{8}(?:[0-9a-f]{9})?"', rollout)
        self.assertIn("@sha256:[0-9a-f]{64}", rollout)

    def test_ssm_rollout_serializes_argv_with_shell_quoting(self) -> None:
        rollout = self.workflow.split("      - name: Send bounded SSM rollout and verify readiness", 1)[1].split(
            "      - name: Enable CloudFront", 1
        )[0]
        self.assertIn("import shlex", rollout)
        self.assertIn("shlex.quote(argument) for argument in argv", rollout)
        self.assertNotIn("' + os.environ['DEPLOYMENT_BUNDLE_BUCKET']", rollout)
        self.assertIn('--parameters "commands=$rollout_command"', rollout)

    def test_deployment_generates_and_verifies_release_bundle(self) -> None:
        self.assertIn("release_bundle.py generate", self.workflow)
        self.assertIn("release_bundle.py verify", self.workflow)
        release_tests = (WORKFLOW.parent.parent.parent / "infra/ec2-demo/test_release_bundle.py").read_text(
            encoding="utf-8"
        )
        self.assertIn("PROVENANCE_FILES", release_tests)
        self.assertIn("test_rejects_secret_like_provenance_content", release_tests)

    def test_source_secret_scan_excludes_workflow_and_covers_deployment_config(self) -> None:
        scan = self.workflow.split("          if python - <<'PY'", 1)[1].split("          PY", 1)[0]
        self.assertNotIn(".github/workflows/demo-deploy.yml", scan)
        for path in (
            "infra/ec2-demo/template.yaml",
            "infra/ec2-demo/docker-compose.yml",
            "infra/ec2-demo/.env.example",
        ):
            self.assertIn(path, scan)
        self.assertIn("if grep -E 'replace-with-runtime-secret", self.workflow)
        self.assertIn("/tmp/talentpulse-compose.config", self.workflow)

    def test_entrypoint_verifies_ai_provenance_from_pinned_image(self) -> None:
        entrypoint = (WORKFLOW.parent.parent.parent / "infra/ec2-demo/ai-entrypoint.sh").read_text(
            encoding="utf-8"
        )
        self.assertIn('docker pull "$ai_image"', entrypoint)
        self.assertIn('docker cp "$ai_container:/app/pyproject.toml"', entrypoint)
        self.assertIn('docker cp "$ai_container:/app/uv.lock"', entrypoint)
        self.assertIn('--source-root "$provenance_source"', entrypoint)

    def test_bootstrap_downloads_explicit_ai_provenance_objects(self) -> None:
        template = (WORKFLOW.parent.parent.parent / "infra/ec2-demo/template.yaml").read_text(
            encoding="utf-8"
        )
        bootstrap = template.split("cat >/opt/talentpulse/bin/deploy-demo <<'BOOTSTRAP'", 1)[1].split(
            "BOOTSTRAP", 1
        )[0]
        self.assertIn('mkdir -p "$tmp/nginx" "$tmp/ai-service"', bootstrap)
        self.assertIn("ai-service/pyproject.toml", bootstrap)
        self.assertIn("ai-service/uv.lock", bootstrap)
        self.assertIn('aws --no-cli-pager s3 cp "$bundle/$object" "$tmp/$object"', bootstrap)
        self.assertIn('python3 "$tmp/release_bundle.py" verify', bootstrap)


if __name__ == "__main__":
    unittest.main()
