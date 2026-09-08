#!/usr/bin/env bash
# Host-side demo release installer. The historical filename is retained because
# the bundle contract already publishes it; it is never used as a container
# entrypoint and never receives secret values on argv.
set -Eeuo pipefail
umask 077

readonly CONFIG_FILE=/etc/talentpulse/demo-runtime.conf
readonly ROOT=/opt/talentpulse
readonly RUN_ROOT=/run/talentpulse
readonly PROJECT=talentpulse-demo

die() {
  printf 'demo deployment refused: %s\n' "$*" >&2
  exit 1
}

[[ "$(id -u)" == 0 ]] || die 'must run as root'
[[ -r "$CONFIG_FILE" ]] || die 'host deployment configuration is missing'
# shellcheck disable=SC1091
source "$CONFIG_FILE"

for command_name in aws curl docker jq sha256sum sed stat install mktemp grep wc readlink sleep; do
  command -v "$command_name" >/dev/null 2>&1 || die "required command is unavailable: $command_name"
done

usage() {
  printf 'usage: deploy-demo --commit SHA --bundle s3://.../bundles/SHA --backend-image IMAGE@sha256:DIGEST --ai-image IMAGE@sha256:DIGEST --migration-mode skip|run\n' >&2
  exit 2
}

commit=''
bundle=''
backend_image=''
ai_image=''
migration_mode='skip'
resume=false
while (($#)); do
  case "$1" in
    --commit) commit="${2:-}"; shift 2 ;;
    --bundle) bundle="${2:-}"; shift 2 ;;
    --backend-image) backend_image="${2:-}"; shift 2 ;;
    --ai-image) ai_image="${2:-}"; shift 2 ;;
    --migration-mode) migration_mode="${2:-}"; shift 2 ;;
    --resume) resume=true; shift ;;
    *) usage ;;
  esac
done

[[ "$commit" =~ ^[0-9a-fA-F]{40}$ ]] || die 'commit must be a 40-character SHA'
[[ "$migration_mode" == skip || "$migration_mode" == run ]] || die 'migration mode must be skip or run'
[[ "$backend_image" =~ ^[^[:space:]@]+@sha256:[0-9a-fA-F]{64}$ ]] || die 'backend image must be digest-pinned'
[[ "$ai_image" =~ ^[^[:space:]@]+@sha256:[0-9a-fA-F]{64}$ ]] || die 'AI image must be digest-pinned'
[[ "$backend_image" == "$BACKEND_REPOSITORY_URI@"* ]] || die 'backend image repository is not approved'
[[ "$ai_image" == "$AI_REPOSITORY_URI@"* ]] || die 'AI image repository is not approved'

[[ "$bundle" =~ ^s3://([^/]+)/bundles/([0-9a-fA-F]{40})$ ]] || die 'bundle must be an exact S3 bundles/<commit> URI'
bundle_bucket="${BASH_REMATCH[1]}"
bundle_commit="${BASH_REMATCH[2]}"
[[ "$bundle_bucket" == "$DEPLOYMENT_BUNDLE_BUCKET" ]] || die 'bundle bucket is not approved'
[[ "${bundle_commit,,}" == "${commit,,}" ]] || die 'bundle commit does not match requested commit'

[[ "$EXPECTED_ACCOUNT" =~ ^[0-9]{12}$ ]] || die 'expected account is invalid'
[[ "$EXPECTED_REGION" =~ ^[a-z0-9-]+$ ]] || die 'expected region is invalid'
[[ -n "$EXPECTED_INSTANCE_NAME" ]] || die 'expected instance identity is incomplete'

aws_call() {
  AWS_DEFAULT_REGION="$EXPECTED_REGION" AWS_REGION="$EXPECTED_REGION" aws --no-cli-pager "$@"
}

verify_instance() {
  local token instance_id instance_region account instance_name state
  token="$(curl --fail --silent --show-error --max-time 5 -X PUT \
    -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' \
    http://169.254.169.254/latest/api/token)" || die 'IMDSv2 token request failed'
  instance_id="$(curl --fail --silent --show-error --max-time 5 \
    -H "X-aws-ec2-metadata-token: $token" \
    http://169.254.169.254/latest/meta-data/instance-id)" || die 'instance identity lookup failed'
  instance_region="$(curl --fail --silent --show-error --max-time 5 \
    -H "X-aws-ec2-metadata-token: $token" \
    http://169.254.169.254/latest/meta-data/placement/region)" || die 'instance region lookup failed'
  if [[ -n "${EXPECTED_INSTANCE_ID:-}" && "$instance_id" != "$EXPECTED_INSTANCE_ID" ]]; then
    die 'target instance does not match'
  fi
  [[ "$instance_region" == "$EXPECTED_REGION" ]] || die 'target instance region does not match'

  account="$(aws_call sts get-caller-identity --query Account --output text)" || die 'AWS account admission failed'
  [[ "$account" == "$EXPECTED_ACCOUNT" ]] || die 'AWS account does not match'
  instance_name="$(aws_call ec2 describe-instances --instance-ids "$instance_id" \
    --query "Reservations[0].Instances[0].Tags[?Key=='Name'].Value | [0]" --output text)" || die 'instance tag admission failed'
  state="$(aws_call ec2 describe-instances --instance-ids "$instance_id" \
    --query 'Reservations[0].Instances[0].State.Name' --output text)" || die 'instance state admission failed'
  [[ "$instance_name" == "$EXPECTED_INSTANCE_NAME" ]] || die 'instance Name tag does not match'
  [[ "$state" == running ]] || die 'target instance is not running'
}

verify_image_digest() {
  local image="$1" repository digest
  repository="${image%%@*}"
  repository="${repository##*/}"
  digest="${image##*@}"
  aws_call ecr describe-images --repository-name "$repository" --image-ids "imageDigest=$digest" \
    --query 'imageDetails[0].imageDigest' --output text | grep -Fxq "$digest" || die 'image digest is not present in the approved ECR repository'
}

json_value() {
  local file="$1" key="$2"
  jq -er --arg key "$key" 'if has($key) and .[$key] != null and ((.[$key] | tostring) | length) > 0 then .[$key] | tostring else error("required field missing") end' "$file"
}

write_env_value() {
  local output="$1" name="$2" json_file="$3" json_key="$4"
  jq -er --arg name "$name" --arg key "$json_key"     'if has($key) and .[$key] != null and ((.[$key] | tostring) | length) > 0
     then ($name + "=" + (.[$key] | tostring | @sh))
     else error("required field missing") end' "$json_file" >> "$output"     || die "required runtime field is missing: $json_key"
}

write_secret_file() {
  local output="$1" json_file="$2" json_key="$3"
  jq -er --arg key "$json_key"     'if has($key) and .[$key] != null and ((.[$key] | tostring) | length) > 0
     then .[$key] | tostring
     else error("required field missing") end' "$json_file" > "$output"     || die "required certificate field is missing: $json_key"
  chmod 0600 "$output"
}

fetch_secret() {
  local arn="$1" output="$2"
  [[ "$arn" =~ ^arn:[^:]+:secretsmanager:[^:]+:[0-9]{12}:secret:.+$ ]] || die 'secret reference is not an exact Secrets Manager ARN'
  aws_call secretsmanager get-secret-value --secret-id "$arn" --query SecretString --output text > "$output" || die 'Secrets Manager read failed'
  [[ -s "$output" ]] || die 'secret did not contain SecretString JSON'
  jq -e 'type == "object"' "$output" >/dev/null || die 'secret JSON must be an object'
  chmod 0600 "$output"
}

verify_instance
verify_image_digest "$backend_image"
verify_image_digest "$ai_image"

stage="$(mktemp -d "$ROOT/.staging.XXXXXX")"
cleanup_stage() { rm -rf "$stage"; }
trap cleanup_stage EXIT
mkdir -p "$stage/nginx"

for object in docker-compose.yml nginx/default.conf ai-entrypoint.sh .env.example SHA256SUMS; do
  aws_call s3 cp "$bundle/$object" "$stage/$object" --only-show-errors >/dev/null || die "bundle object download failed: $object"
done
(
  cd "$stage"
  [[ "$(wc -l < SHA256SUMS)" == 5 ]] || die 'bundle checksum manifest has an unexpected file count'
  for object in docker-compose.yml nginx/default.conf ai-entrypoint.sh .env.example; do
    grep -Fq "  $object" SHA256SUMS || die "bundle checksum manifest is missing: $object"
  done
  sha256sum -c SHA256SUMS >/dev/null || die 'bundle checksum verification failed'
)
grep -Fq "BACKEND_IMAGE=$backend_image" "$stage/.env.example" || die 'backend digest does not match bundle metadata'
grep -Fq "AI_SERVICE_IMAGE=$ai_image" "$stage/.env.example" || die 'AI digest does not match bundle metadata'

release="$ROOT/releases/$commit"
runtime="$RUN_ROOT/releases/$commit"
if [[ -e "$release" && "$resume" != true ]]; then
  die 'release commit already exists; use a new immutable release'
fi
mkdir -p "$release/nginx" "$runtime"
chmod 0750 "$ROOT" "$ROOT/releases" "$ROOT/bin" "$release" "$runtime"
cp "$stage/docker-compose.yml" "$release/docker-compose.yml"
cp "$stage/nginx/default.conf" "$release/nginx/default.conf"
chmod 0640 "$release/docker-compose.yml" "$release/nginx/default.conf"

backend_json="$runtime/.backend.json"
ai_json="$runtime/.ai.json"
valkey_json="$runtime/.valkey.json"
fetch_secret "$BACKEND_SECRET_ARN" "$backend_json"
fetch_secret "$AI_SECRET_ARN" "$ai_json"
fetch_secret "$VALKEY_SECRET_ARN" "$valkey_json"

backend_env="$runtime/backend.env"
ai_env="$runtime/ai.env"
: > "$backend_env"
: > "$ai_env"
chmod 0600 "$backend_env" "$ai_env"
cat >> "$backend_env" <<'EOF'
NODE_ENV=demo
PORT=8000
DB_PORT=5432
DB_DATABASE=talentpulse_demo
DB_SYNCHRONIZE=false
REDIS_ENABLED=true
REDIS_TLS=false
REDIS_HOST=valkey
REDIS_PORT=6379
RUN_BACKGROUND_JOBS=true
RUN_INDEXING_WORKER=true
AI_INDEX_ENVIRONMENT=demo
AI_INDEX_OUTBOX_ENVIRONMENT=demo
AI_SERVICE_URL=https://ai-service:8000
AI_SERVICE_JWT_ALGORITHM=RS256
AI_SERVICE_JWT_TTL_SECONDS=60
AI_SERVICE_TIMEOUT_MS=10000
NODE_EXTRA_CA_CERTS=/run/secrets/ai-ca-cert
DB_SSL_CA_FILE=/run/secrets/db-ca.pem
EOF
write_env_value "$backend_env" DB_HOST "$backend_json" DB_HOST
write_env_value "$backend_env" DB_USERNAME "$backend_json" DB_USERNAME
write_env_value "$backend_env" DB_PASSWORD "$backend_json" DB_PASSWORD
write_env_value "$backend_env" JWT_SECRET "$backend_json" JWT_SECRET
write_env_value "$backend_env" JWT_REFRESH_SECRET "$backend_json" JWT_REFRESH_SECRET
write_env_value "$backend_env" AI_SERVICE_ISSUER "$backend_json" AI_SERVICE_ISSUER
write_env_value "$backend_env" AI_SERVICE_AUDIENCE "$backend_json" AI_SERVICE_AUDIENCE
write_env_value "$backend_env" AI_SERVICE_JWT_PRIVATE_KEY "$backend_json" AI_SERVICE_JWT_PRIVATE_KEY
write_env_value "$backend_env" URL_FRONTEND "$backend_json" URL_FRONTEND

cat >> "$ai_env" <<EOF
AI_ENVIRONMENT=demo
AI_AUTH_REQUIRED=true
AI_JWT_ALGORITHMS=[\"RS256\"]
AI_CV_PARSE_SCOPE=cv:parse
AI_CV_MATCH_SCOPE=cv:match
AI_RAG_RETRIEVE_SCOPE=rag:retrieve
AI_RAG_GENERATE_SCOPE=rag:generate
AI_JOB_INDEX_SCOPE=jobs:index
AI_EMBEDDING_PROVIDER=cohere
AI_VECTOR_STORE_PROVIDER=qdrant
AI_GENERATION_PROVIDER=bedrock
AI_COHERE_MODEL=cohere.embed-multilingual-v3
AI_COHERE_DIMENSIONS=1024
AI_QDRANT_COLLECTION=jobs_cohere_multilingual_v3_1024_demo_v1
AI_QDRANT_ALIAS=jobs_current_demo
AI_QDRANT_INDEX_VERSION=demo-v1
AI_BEDROCK_REGION=$EXPECTED_REGION
AI_BEDROCK_MODEL=amazon.nova-lite-v1:0
EOF
write_env_value "$ai_env" AI_JWT_PUBLIC_KEY "$ai_json" AI_JWT_PUBLIC_KEY
write_env_value "$ai_env" AI_JWT_ISSUER "$backend_json" AI_SERVICE_ISSUER
write_env_value "$ai_env" AI_JWT_AUDIENCE "$backend_json" AI_SERVICE_AUDIENCE
write_env_value "$ai_env" AI_QDRANT_URL "$ai_json" AI_QDRANT_URL
write_env_value "$ai_env" AI_QDRANT_API_KEY "$ai_json" AI_QDRANT_API_KEY

write_secret_file "$runtime/db-ca.pem" "$backend_json" DB_SSL_CA_PEM
write_secret_file "$runtime/ai-ca.crt" "$ai_json" AI_TLS_CA_PEM
write_secret_file "$runtime/ai-tls.crt" "$ai_json" AI_TLS_CERT_PEM
write_secret_file "$runtime/ai-tls.key" "$ai_json" AI_TLS_KEY_PEM

jq -er '.REDIS_PASSWORD | strings | select(length > 0 and test("^[^\\\"\r\n]+$")) | "appendonly yes\nrequirepass \"" + . + "\"\n"' \
  "$valkey_json" > "$runtime/valkey.conf" || die 'Valkey password is missing or contains unsupported config characters'
jq -er '.REDIS_PASSWORD | strings | select(length > 0 and test("^[^\\\"\r\n]+$"))' \
  "$valkey_json" > "$runtime/valkey-password" || die 'Valkey password is missing or contains unsupported config characters'
chmod 0600 "$runtime/valkey.conf" "$runtime/valkey-password"

cat > "$release/runtime.env" <<EOF
BACKEND_IMAGE=$backend_image
AI_SERVICE_IMAGE=$ai_image
AWS_REGION=$EXPECTED_REGION
TALENTPULSE_RUNTIME_DIR=$RUN_ROOT/current
COMPOSE_PROJECT_NAME=$PROJECT
EOF
chmod 0640 "$release/runtime.env"
printf 'commit=%s\nbundle=%s\nbackend_image=%s\nai_image=%s\nrelease_dir=%s\nruntime_dir=%s\n' \
  "$commit" "$bundle" "$backend_image" "$ai_image" "$release" "$runtime" > "$release/release.info"
chmod 0600 "$release/release.info"

previous_release=''
previous_runtime=''
if [[ -L "$ROOT/current" ]]; then previous_release="$(readlink -f "$ROOT/current")"; fi
if [[ -L "$RUN_ROOT/current" ]]; then previous_runtime="$(readlink -f "$RUN_ROOT/current")"; fi
if [[ "$resume" == true && "$previous_release" == "$release" ]]; then
  previous_release=''
  previous_runtime=''
fi
printf 'previous_commit=%s\nprevious_release=%s\nprevious_runtime=%s\n' \
  "${previous_release##*/}" "$previous_release" "$previous_runtime" > "$ROOT/previous-release"
chmod 0600 "$ROOT/previous-release"

compose() {
  docker compose --env-file "$1/runtime.env" -f "$1/docker-compose.yml" "${@:2}"
}

run_migrations() {
  [[ "$migration_mode" == run ]] || { printf 'migration_mode=skip\n'; return; }
  printf 'migration_mode=run database=talentpulse_demo\n'
  compose "$release" run --rm --no-deps backend node node_modules/typeorm/cli.js migration:show -d dist/database/data-source.js >/dev/null
  compose "$release" run --rm --no-deps backend node node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js >/dev/null
  printf 'typeorm_migrations=applied database=talentpulse_demo\n'
}

wait_health() {
  local service container status attempt
  for service in valkey ai-service backend nginx; do
    status=''
    for attempt in {1..60}; do
      container="$(compose "$release" ps -q "$service")"
      if [[ -n "$container" ]]; then
        status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container" 2>/dev/null || true)"
        [[ "$status" == healthy ]] && break
      fi
      sleep 2
    done
    [[ "$status" == healthy ]] || return 1
  done
  for attempt in {1..30}; do
    curl --fail --silent --show-error --max-time 5 http://127.0.0.1/origin-health >/dev/null && break
    sleep 2
  done
  curl --fail --silent --show-error --max-time 5 http://127.0.0.1/origin-health >/dev/null
  printf 'readiness=passed ai=/health backend=/api/health nginx=/origin-health\n'
}

rollback() {
  [[ -n "$previous_release" && -n "$previous_runtime" ]] || return 0
  compose "$release" down --remove-orphans >/dev/null 2>&1 || true
  ln -sfn "$previous_release" "$ROOT/current"
  ln -sfn "$previous_runtime" "$RUN_ROOT/current"
  compose "$previous_release" up -d --remove-orphans >/dev/null 2>&1 || true
}

ln -sfn "$release" "$ROOT/current"
ln -sfn "$runtime" "$RUN_ROOT/current"
if ! run_migrations; then
  ln -sfn "${previous_release:-$release}" "$ROOT/current"
  ln -sfn "${previous_runtime:-$runtime}" "$RUN_ROOT/current"
  die 'migration failed; previous application was left running'
fi
if ! compose "$release" up -d --remove-orphans; then
  rollback
  die 'compose startup failed; previous release was restored'
fi
if ! wait_health; then
  rollback
  die 'application readiness failed; previous release was restored (database migrations are not reversed)'
fi
systemctl restart talentpulse-demo.service >/dev/null 2>&1 || true

printf 'deployment=ready commit=%s migration_mode=%s previous_release_retained=%s\n' \
  "$commit" "$migration_mode" "${previous_release:-none}"
