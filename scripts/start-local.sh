#!/usr/bin/env bash
# shellcheck disable=SC2317 # Cleanup and liveness helpers are invoked indirectly.
# Start the local PostgreSQL/Redis dependencies and all three application services.
set -Eeuo pipefail
umask 077

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
readonly ROOT_DIR
readonly AI_DIR="$ROOT_DIR/ai-service"
readonly BACKEND_DIR="$ROOT_DIR/backend"
readonly FRONTEND_DIR="$ROOT_DIR/frontend"
readonly COMPOSE_FILE="$BACKEND_DIR/environment/docker-compose.yml"
readonly PRIVATE_KEY_FILE="$ROOT_DIR/.secret/service-private.pem"
readonly PUBLIC_KEY_FILE="$ROOT_DIR/.secret/service-public.pem"
readonly RUNTIME_DIR="/tmp/talentpulse-local"
readonly TLS_CERT="$RUNTIME_DIR/ai-service-tls.crt"
readonly TLS_KEY="$RUNTIME_DIR/ai-service-tls.key"
readonly AI_URL="https://127.0.0.1:8001"
readonly BACKEND_URL="http://127.0.0.1:8000"
readonly FRONTEND_URL="http://127.0.0.1:5173"
readonly QDRANT_URL="http://127.0.0.1:6333"
readonly OLLAMA_URL="http://127.0.0.1:11435"
readonly JWT_ISSUER="https://talentpulse.local"
readonly JWT_AUDIENCE="talentpulse-ai"
readonly JWT_SUBJECT="talentpulse-backend"
readonly LOCAL_OLLAMA_EMBEDDING_MODEL="${AI_OLLAMA_EMBEDDING_MODEL:-qwen3-embedding:0.6b}"
readonly LOCAL_OLLAMA_GENERATION_MODEL="${AI_OLLAMA_GENERATION_MODEL:-qwen3:1.7b}"
readonly LOCAL_OLLAMA_EMBEDDING_DIMENSIONS="${AI_OLLAMA_EMBEDDING_DIMENSIONS:-1024}"
readonly LOCAL_QDRANT_COLLECTION="jobs_ollama_${LOCAL_OLLAMA_EMBEDDING_DIMENSIONS}_local_v1"
readonly LOCAL_QDRANT_ALIAS="jobs_current_local"
readonly LOCAL_QDRANT_INDEX_VERSION="local-ollama-v1"
readonly LOCAL_OLLAMA_TIMEOUT_SECONDS=120
readonly DETERMINISTIC_AI_SERVICE_TIMEOUT_MS=10000
readonly OLLAMA_AI_SERVICE_TIMEOUT_MS=180000
readonly CV_OCR_NATIVE_TEXT_MIN_CHARS=250
readonly CV_OCR_MAX_PAGES=5
readonly CV_OCR_DPI=200
readonly CV_OCR_MAX_RENDER_PIXELS=10000000
readonly CV_OCR_RENDER_TIMEOUT_SECONDS=10
readonly CV_OCR_RECOGNIZE_TIMEOUT_SECONDS=15
readonly CV_OCR_TOTAL_TIMEOUT_SECONDS=60
readonly CV_OCR_MAX_STDOUT_BYTES=1000000
readonly CV_OCR_LANGUAGES='["eng","vie"]'

DRY_RUN=false
AI_PROFILE=deterministic
CV_OCR=false
INDEX_BOOTSTRAP=false
LOG_DIR=''
CLEANED_UP=false
PIDS=()
SERVICE_LOGS=()

usage() {
  cat <<'EOF'
Usage: scripts/start-local.sh [--ai-profile=deterministic|ollama] [--cv-ocr] [--index-bootstrap] [--dry-run] [--help]

Starts local PostgreSQL and Redis, then FastAPI, NestJS, and the Vite frontend.
The Ollama profile additionally starts local Ollama and Qdrant and pulls missing models.
OCR is disabled by default; --cv-ocr opts the local FastAPI child into host-local OCR.
Ctrl-C stops the three application processes; Docker dependencies remain running.

--ai-profile=...  Select deterministic (default) or the explicit Ollama/Qdrant profile.
--cv-ocr          Enable bounded local PDF OCR (requires pdftoppm, tesseract, eng, and vie).
--index-bootstrap Run the bounded local job-index command after all services are ready.
--dry-run         Print the planned commands and change nothing.
--help            Show this help.
EOF
}

die() {
  printf 'start-local: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command is unavailable: $1"
}

check_cv_ocr_prerequisites() {
  [[ "$CV_OCR" == true ]] || return 0

  require_command pdftoppm
  require_command tesseract

  local installed_languages language language_marker
  installed_languages="$(tesseract --list-langs 2>/dev/null)" || \
    die 'Tesseract could not report its installed language packs'
  for language in eng vie; do
    language_marker=$'\n'"$language"$'\n'
    [[ $'\n'"$installed_languages"$'\n' == *"$language_marker"* ]] || \
      die "Tesseract language pack is unavailable: $language (install it before using --cv-ocr)"
  done
}

check_layout() {
  [[ -f "$COMPOSE_FILE" ]] || die "Compose file is missing: $COMPOSE_FILE"
  [[ -f "$AI_DIR/pyproject.toml" ]] || die "AI service project file is missing: $AI_DIR/pyproject.toml"
  [[ -f "$AI_DIR/uv.lock" ]] || die "AI service lockfile is missing: $AI_DIR/uv.lock"
  [[ -f "$BACKEND_DIR/package.json" ]] || die "backend package.json is missing"
  [[ -f "$BACKEND_DIR/package-lock.json" ]] || die "backend package-lock.json is missing"
  [[ -f "$FRONTEND_DIR/package.json" ]] || die "frontend package.json is missing"
  [[ -f "$FRONTEND_DIR/package-lock.json" ]] || die "frontend package-lock.json is missing"
}

check_prerequisites() {
  local command_name
  for command_name in docker uv npm node openssl curl setsid cmp mktemp grep timeout; do
    require_command "$command_name"
  done

  docker compose version >/dev/null 2>&1 || die 'Docker Compose v2 is required (docker compose)'
  docker info >/dev/null 2>&1 || die 'Docker daemon is unavailable; start Docker Desktop or dockerd'

  [[ -x "$BACKEND_DIR/node_modules/.bin/nest" ]] || \
    die 'backend dependencies are missing; run npm ci in backend (not done automatically)'
  [[ -x "$FRONTEND_DIR/node_modules/.bin/vite" ]] || \
    die 'frontend dependencies are missing; run npm ci in frontend (not done automatically)'
  [[ -x "$AI_DIR/.venv/bin/python" ]] || \
    die 'AI dependencies are missing; create ai-service/.venv and run uv sync (not done automatically)'

  (cd "$AI_DIR" && uv run --no-sync python -c 'import fastapi, uvicorn') >/dev/null 2>&1 || \
    die 'AI dependencies are incomplete; run uv sync in ai-service (not done automatically)'
}

ensure_env_file() {
  local env_file="$1"
  local example_file="$2"

  if [[ -e "$env_file" || -L "$env_file" ]]; then
    [[ -f "$env_file" && ! -L "$env_file" ]] || die "environment file must be a regular file: $env_file"
    return
  fi

  [[ -f "$example_file" ]] || die "environment file is missing and no example exists: $env_file"
  cp -n -- "$example_file" "$env_file" || die "could not create $env_file from its example"
  [[ -f "$env_file" ]] || die "environment file was not created: $env_file"
  chmod 0600 "$env_file"
  printf 'Created %s from %s; existing files are never overwritten.\n' "$env_file" "$example_file"
}

ensure_environment_files() {
  # AI and backend .env files are created only when absent; existing files are preserved.
  ensure_env_file "$AI_DIR/.env" "$AI_DIR/.env.example"
  ensure_env_file "$BACKEND_DIR/.env" "$BACKEND_DIR/.env.example"
}

ensure_runtime_dir() {
  if [[ -L "$RUNTIME_DIR" || ( -e "$RUNTIME_DIR" && ! -d "$RUNTIME_DIR" ) ]]; then
    die "runtime path must be a directory and not a symlink: $RUNTIME_DIR"
  fi
  mkdir -p -- "$RUNTIME_DIR"
  chmod 0700 "$RUNTIME_DIR"
  LOG_DIR="$RUNTIME_DIR/logs-$$"
  mkdir -- "$LOG_DIR"
  chmod 0700 "$LOG_DIR"
}

validate_service_key_pair() {
  local private_der public_der
  private_der="$(mktemp "$LOG_DIR/private-public.XXXXXX")"
  public_der="$(mktemp "$LOG_DIR/public-key.XXXXXX")"
  chmod 0600 "$private_der" "$public_der"

  [[ -f "$PRIVATE_KEY_FILE" && ! -L "$PRIVATE_KEY_FILE" ]] || {
    rm -f -- "$private_der" "$public_der"
    die "private service key is missing or is not a regular file: $PRIVATE_KEY_FILE"
  }
  [[ -f "$PUBLIC_KEY_FILE" && ! -L "$PUBLIC_KEY_FILE" ]] || {
    rm -f -- "$private_der" "$public_der"
    die "public service key is missing or is not a regular file: $PUBLIC_KEY_FILE"
  }

  if ! openssl pkey -in "$PRIVATE_KEY_FILE" -check -noout >/dev/null 2>&1 || \
     ! openssl pkey -in "$PRIVATE_KEY_FILE" -pubout -outform DER -out "$private_der" >/dev/null 2>&1 || \
     ! openssl pkey -pubin -in "$PUBLIC_KEY_FILE" -pubout -outform DER -out "$public_der" >/dev/null 2>&1 || \
     ! cmp -s "$private_der" "$public_der"; then
    rm -f -- "$private_der" "$public_der"
    die 'service-private.pem and service-public.pem are not a valid matching key pair'
  fi

  rm -f -- "$private_der" "$public_der"
}

local_tls_is_valid() {
  local san cert_der key_der
  [[ -f "$TLS_CERT" && ! -L "$TLS_CERT" ]] || return 1
  [[ -f "$TLS_KEY" && ! -L "$TLS_KEY" ]] || return 1

  openssl x509 -in "$TLS_CERT" -noout >/dev/null 2>&1 || return 1
  openssl x509 -in "$TLS_CERT" -checkend 86400 -noout >/dev/null 2>&1 || return 1
  san="$(openssl x509 -in "$TLS_CERT" -noout -ext subjectAltName 2>/dev/null)" || return 1
  [[ "$san" == *'DNS:localhost'* && "$san" == *'IP Address:127.0.0.1'* ]] || return 1

  cert_der="$(mktemp "$LOG_DIR/cert-public.XXXXXX")"
  key_der="$(mktemp "$LOG_DIR/tls-public.XXXXXX")"
  chmod 0600 "$cert_der" "$key_der"
  if ! openssl x509 -in "$TLS_CERT" -pubkey -noout 2>/dev/null | \
       openssl pkey -pubin -outform DER -out "$cert_der" >/dev/null 2>&1 || \
     ! openssl pkey -in "$TLS_KEY" -pubout -outform DER -out "$key_der" >/dev/null 2>&1 || \
     ! cmp -s "$cert_der" "$key_der"; then
    rm -f -- "$cert_der" "$key_der"
    return 1
  fi
  rm -f -- "$cert_der" "$key_der"
  return 0
}

ensure_local_tls() {
  local temporary_cert temporary_key

  if local_tls_is_valid; then
    chmod 0600 "$TLS_CERT" "$TLS_KEY"
    printf 'Reusing valid local TLS certificate: %s\n' "$TLS_CERT"
    return
  fi

  [[ ! -L "$TLS_CERT" && ! -L "$TLS_KEY" ]] || \
    die 'refusing to replace a symlink at the local TLS certificate path'
  temporary_cert="$(mktemp "$RUNTIME_DIR/ai-service-tls.crt.XXXXXX")"
  temporary_key="$(mktemp "$RUNTIME_DIR/ai-service-tls.key.XXXXXX")"
  chmod 0600 "$temporary_cert" "$temporary_key"

  if ! openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 7 \
      -subj '/CN=localhost' \
      -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1' \
      -keyout "$temporary_key" -out "$temporary_cert" >/dev/null 2>&1; then
    rm -f -- "$temporary_cert" "$temporary_key"
    die 'could not generate the local FastAPI TLS certificate'
  fi

  mv -f -- "$temporary_cert" "$TLS_CERT"
  mv -f -- "$temporary_key" "$TLS_KEY"
  chmod 0600 "$TLS_CERT" "$TLS_KEY"
  local_tls_is_valid || die 'generated local TLS certificate failed validation'
  printf 'Generated short-lived local TLS certificate: %s\n' "$TLS_CERT"
}

compose() {
  docker compose -f "$COMPOSE_FILE" "$@"
}

wait_for_dependencies() {
  local service attempt
  for service in postgres redis; do
    printf 'Waiting for Docker dependency: %s\n' "$service"
    for ((attempt = 1; attempt <= 60; attempt += 1)); do
      if [[ "$service" == postgres ]] && \
         compose exec -T postgres pg_isready -U postgres -d recruitment_db >/dev/null 2>&1; then
        break
      fi
      if [[ "$service" == redis ]] && \
         compose exec -T redis redis-cli -a redis123 ping 2>/dev/null | grep -Fxq PONG; then
        break
      fi
      if (( attempt == 60 )); then
        die "$service did not become ready within 60 seconds"
      fi
      sleep 1
    done
  done

  if [[ "$AI_PROFILE" == ollama ]]; then
    wait_for_http_dependency qdrant "$QDRANT_URL/healthz"
    wait_for_http_dependency ollama "$OLLAMA_URL/api/tags"
  fi
}

wait_for_http_dependency() {
  local name="$1"
  local url="$2"
  local attempt

  printf 'Waiting for Docker dependency: %s (%s)\n' "$name" "$url"
  for ((attempt = 1; attempt <= 60; attempt += 1)); do
    if curl --fail --silent --output /dev/null --max-time 2 "$url"; then
      printf 'Ready dependency %-8s\n' "$name"
      return
    fi
    if (( attempt == 60 )); then
      die "$name did not become ready within 60 seconds"
    fi
    sleep 1
  done
}

validate_ollama_model_name() {
  [[ "$1" =~ ^[A-Za-z0-9._:/-]+$ ]] || die 'invalid local Ollama model name'
}

pull_ollama_model_if_missing() {
  local model="$1"
  validate_ollama_model_name "$model"
  if compose exec -T ollama ollama list 2>/dev/null | grep -Fq -- "$model"; then
    printf 'Ollama model already present: %s\n' "$model"
    return
  fi

  printf 'Pulling missing Ollama model: %s\n' "$model"
  timeout --signal=TERM 15m docker compose -f "$COMPOSE_FILE" --profile ollama exec -T ollama ollama pull "$model" || \
    die "Ollama model pull failed or exceeded 15 minutes: $model"
}

initialize_local_qdrant() {
  printf 'Initializing local Qdrant collection (non-destructive): %s\n' "$LOCAL_QDRANT_COLLECTION"
  (
    cd -- "$AI_DIR"
    AI_ENVIRONMENT=local \
      AI_EMBEDDING_PROVIDER=ollama \
      AI_QDRANT_ADMIN_ENABLED=true \
      AI_OLLAMA_URL="$OLLAMA_URL" \
      AI_OLLAMA_EMBEDDING_MODEL="$LOCAL_OLLAMA_EMBEDDING_MODEL" \
      AI_OLLAMA_EMBEDDING_DIMENSIONS="$LOCAL_OLLAMA_EMBEDDING_DIMENSIONS" \
      AI_QDRANT_URL="$QDRANT_URL" \
      AI_QDRANT_COLLECTION="$LOCAL_QDRANT_COLLECTION" \
      AI_QDRANT_ALIAS="$LOCAL_QDRANT_ALIAS" \
      AI_QDRANT_INDEX_VERSION="$LOCAL_QDRANT_INDEX_VERSION" \
      AI_COHERE_MODEL="$LOCAL_OLLAMA_EMBEDDING_MODEL" \
      AI_COHERE_DIMENSIONS="$LOCAL_OLLAMA_EMBEDDING_DIMENSIONS" \
      timeout --signal=TERM 60s uv run --no-sync python -m app.qdrant_admin initialize >/dev/null
  ) || die 'local Qdrant initialization failed; existing aliases are never repointed'
}

configure_cv_ocr_environment() {
  if [[ "$CV_OCR" == true ]]; then
    export AI_CV_OCR_ENABLED=true
  else
    export AI_CV_OCR_ENABLED=false
  fi
  export AI_CV_OCR_NATIVE_TEXT_MIN_CHARS="$CV_OCR_NATIVE_TEXT_MIN_CHARS"
  export AI_CV_OCR_MAX_PAGES="$CV_OCR_MAX_PAGES"
  export AI_CV_OCR_DPI="$CV_OCR_DPI"
  export AI_CV_OCR_MAX_RENDER_PIXELS="$CV_OCR_MAX_RENDER_PIXELS"
  export AI_CV_OCR_RENDER_TIMEOUT_SECONDS="$CV_OCR_RENDER_TIMEOUT_SECONDS"
  export AI_CV_OCR_RECOGNIZE_TIMEOUT_SECONDS="$CV_OCR_RECOGNIZE_TIMEOUT_SECONDS"
  export AI_CV_OCR_TOTAL_TIMEOUT_SECONDS="$CV_OCR_TOTAL_TIMEOUT_SECONDS"
  export AI_CV_OCR_MAX_STDOUT_BYTES="$CV_OCR_MAX_STDOUT_BYTES"
  export AI_CV_OCR_LANGUAGES="$CV_OCR_LANGUAGES"
}

clear_cv_ocr_environment() {
  unset AI_CV_OCR_ENABLED \
    AI_CV_OCR_NATIVE_TEXT_MIN_CHARS \
    AI_CV_OCR_MAX_PAGES \
    AI_CV_OCR_DPI \
    AI_CV_OCR_MAX_RENDER_PIXELS \
    AI_CV_OCR_RENDER_TIMEOUT_SECONDS \
    AI_CV_OCR_RECOGNIZE_TIMEOUT_SECONDS \
    AI_CV_OCR_TOTAL_TIMEOUT_SECONDS \
    AI_CV_OCR_MAX_STDOUT_BYTES \
    AI_CV_OCR_LANGUAGES
}

configure_ai_profile() {
  export AI_OLLAMA_URL="$OLLAMA_URL"
  export AI_OLLAMA_EMBEDDING_MODEL="$LOCAL_OLLAMA_EMBEDDING_MODEL"
  export AI_OLLAMA_GENERATION_MODEL="$LOCAL_OLLAMA_GENERATION_MODEL"
  export AI_OLLAMA_EMBEDDING_DIMENSIONS="$LOCAL_OLLAMA_EMBEDDING_DIMENSIONS"

  if [[ "$AI_PROFILE" == deterministic ]]; then
    export AI_EMBEDDING_PROVIDER=deterministic
    export AI_VECTOR_STORE_PROVIDER=memory
    export AI_GENERATION_PROVIDER=deterministic
    export AI_COHERE_DIMENSIONS=1024
    return
  fi

  export AI_EMBEDDING_PROVIDER=ollama
  export AI_VECTOR_STORE_PROVIDER=qdrant
  export AI_GENERATION_PROVIDER=ollama
  export AI_COHERE_DIMENSIONS="$LOCAL_OLLAMA_EMBEDDING_DIMENSIONS"
  export AI_QDRANT_URL="$QDRANT_URL"
  export AI_QDRANT_COLLECTION="$LOCAL_QDRANT_COLLECTION"
  export AI_QDRANT_ALIAS="$LOCAL_QDRANT_ALIAS"
  export AI_QDRANT_INDEX_VERSION="$LOCAL_QDRANT_INDEX_VERSION"
  export AI_JOB_INDEX_REPRESENTATION_VERSION="$LOCAL_QDRANT_INDEX_VERSION"
  export AI_OLLAMA_TIMEOUT_SECONDS="$LOCAL_OLLAMA_TIMEOUT_SECONDS"
}

bootstrap_local_index_if_requested() {
  [[ "$INDEX_BOOTSTRAP" == true ]] || return 0
  printf 'Running explicitly requested bounded local job indexing bootstrap.\n'
  (
    cd -- "$BACKEND_DIR"
    timeout --signal=TERM 15m npm run index:jobs -- --environment=local --max-operations=100
  ) || die 'local job indexing bootstrap failed'
}

start_process() {
  local name="$1"
  local log_file="$2"
  local working_directory="$3"
  shift 3

  # Each service gets its own process group so cleanup does not orphan npm/uv children.
  # shellcheck disable=SC2016 # The child shell must expand these positional parameters.
  setsid bash -c 'cd -- "$1" && shift && exec "$@"' start-local \
    "$working_directory" "$@" >"$log_file" 2>&1 &
  PIDS+=("$!")
  SERVICE_LOGS+=("$log_file")
  printf 'Started %-8s pid=%s log=%s\n' "$name" "${PIDS[-1]}" "$log_file"
}

process_is_running() {
  kill -0 "$1" >/dev/null 2>&1
}

port_is_open() {
  node -e '
    const net = require("node:net");
    const port = Number(process.argv[1]);
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => { socket.destroy(); process.exit(0); });
    socket.once("error", () => process.exit(1));
    setTimeout(() => process.exit(1), 300);
  ' "$1" >/dev/null 2>&1
}

check_application_ports() {
  local port
  for port in 8000 8001 5173; do
    if port_is_open "$port"; then
      die "application port $port is already in use; stop that process before starting locally"
    fi
  done
  return 0
}

wait_for_http() {
  local name="$1"
  local pid="$2"
  local url="$3"
  local ca_file="${4:-}"
  local attempt curl_args

  printf 'Waiting for %s health: %s\n' "$name" "$url"
  curl_args=(--fail --silent --output /dev/null --max-time 2)
  [[ -z "$ca_file" ]] || curl_args+=(--cacert "$ca_file")
  for ((attempt = 1; attempt <= 60; attempt += 1)); do
    if ! process_is_running "$pid"; then
      die "$name exited before becoming ready; inspect its log: ${SERVICE_LOGS[*]}"
    fi
    if curl "${curl_args[@]}" "$url"; then
      printf 'Ready %-8s %s\n' "$name" "$url"
      return
    fi
    if (( attempt == 60 )); then
      die "$name health check timed out; inspect its log: ${SERVICE_LOGS[*]}"
    fi
    sleep 1
  done
}

cleanup() {
  local exit_code=$?
  local pid
  [[ "$CLEANED_UP" == true ]] && return "$exit_code"
  CLEANED_UP=true
  trap - EXIT INT TERM

  for pid in "${PIDS[@]}"; do
    kill -TERM -- "-$pid" >/dev/null 2>&1 || kill -TERM "$pid" >/dev/null 2>&1 || true
  done
  for _ in {1..20}; do
    local any_running=false
    for pid in "${PIDS[@]}"; do
      if process_is_running "$pid"; then
        any_running=true
        break
      fi
    done
    [[ "$any_running" == true ]] || break
    sleep 0.1
  done
  for pid in "${PIDS[@]}"; do
    kill -KILL -- "-$pid" >/dev/null 2>&1 || true
    wait "$pid" >/dev/null 2>&1 || true
  done

  if ((${#PIDS[@]} > 0)); then
    printf 'Stopped application processes. Logs are retained in %s\n' "$LOG_DIR"
  fi
  return "$exit_code"
}

check_layout

while (($#)); do
  case "$1" in
    --ai-profile=deterministic) AI_PROFILE=deterministic; shift ;;
    --ai-profile=ollama) AI_PROFILE=ollama; shift ;;
    --cv-ocr) CV_OCR=true; shift ;;
    --index-bootstrap) INDEX_BOOTSTRAP=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    --help|-h) usage; exit 0 ;;
    *) die "unknown option: $1" ;;
  esac
done

check_cv_ocr_prerequisites

if [[ "$DRY_RUN" == true ]]; then
  cat <<EOF
Dry run: no files or services will be changed.
AI profile: $AI_PROFILE
CV OCR: $(if [[ "$CV_OCR" == true ]]; then printf 'enabled for FastAPI only (pdftoppm + tesseract; eng+vie verified)'; else printf 'disabled (default; no OCR binaries required)'; fi)
CV OCR limits: $(if [[ "$CV_OCR" == true ]]; then printf 'native threshold=%s chars, pages=%s, DPI=%s, render pixels=%s, render timeout=%ss, recognition timeout=%ss, total timeout=%ss, output bytes=%s, languages=%s' "$CV_OCR_NATIVE_TEXT_MIN_CHARS" "$CV_OCR_MAX_PAGES" "$CV_OCR_DPI" "$CV_OCR_MAX_RENDER_PIXELS" "$CV_OCR_RENDER_TIMEOUT_SECONDS" "$CV_OCR_RECOGNIZE_TIMEOUT_SECONDS" "$CV_OCR_TOTAL_TIMEOUT_SECONDS" "$CV_OCR_MAX_STDOUT_BYTES" "$CV_OCR_LANGUAGES"; else printf 'inactive (FastAPI receives AI_CV_OCR_ENABLED=false)'; fi)
Compose: $(if [[ "$AI_PROFILE" == ollama ]]; then printf 'docker compose -f %s --profile ollama up -d postgres redis qdrant ollama' "$COMPOSE_FILE"; else printf 'docker compose -f %s up -d postgres redis' "$COMPOSE_FILE"; fi)
Dependency waits: PostgreSQL and Redis$(if [[ "$AI_PROFILE" == ollama ]]; then printf ', Qdrant %s, Ollama %s' "$QDRANT_URL" "$OLLAMA_URL"; fi)
Ollama models: $(if [[ "$AI_PROFILE" == ollama ]]; then printf '%s, %s (pull only when absent)' "$LOCAL_OLLAMA_EMBEDDING_MODEL" "$LOCAL_OLLAMA_GENERATION_MODEL"; else printf 'skipped (deterministic profile)'; fi)
Qdrant initialization: $(if [[ "$AI_PROFILE" == ollama ]]; then printf '%s via the non-destructive operator command' "$LOCAL_QDRANT_COLLECTION"; else printf 'skipped (deterministic profile)'; fi)
FastAPI: (cd $AI_DIR && uv run --no-sync uvicorn app.main:app --app-dir . --host 127.0.0.1 --port 8001 --ssl-keyfile $TLS_KEY --ssl-certfile $TLS_CERT)
NestJS:  (cd $BACKEND_DIR && npm run start:dev)
Frontend: (cd $FRONTEND_DIR && npm run dev -- --host 127.0.0.1 --port 5173)
AI health: $AI_URL/health/ready (verified with the local CA)
Backend health: $BACKEND_URL/api/v1/health/ready
Frontend: $FRONTEND_URL/
Environment files are preserved; backend launch variables explicitly override .env AI connection settings.
Index bootstrap: $(if [[ "$INDEX_BOOTSTRAP" == true ]]; then printf 'requested explicitly (bounded to 100 jobs)'; else printf 'not run'; fi)
NestJS AI timeout: $(if [[ "$AI_PROFILE" == ollama ]]; then printf '%sms (local Ollama)' "$OLLAMA_AI_SERVICE_TIMEOUT_MS"; else printf '%sms (deterministic)' "$DETERMINISTIC_AI_SERVICE_TIMEOUT_MS"; fi)
FastAPI Ollama provider timeout: $(if [[ "$AI_PROFILE" == ollama ]]; then printf '%ss (bounded)' "$LOCAL_OLLAMA_TIMEOUT_SECONDS"; else printf 'not used (deterministic profile)'; fi)
EOF
  exit 0
fi

check_prerequisites
ensure_environment_files
ensure_runtime_dir
validate_service_key_pair
ensure_local_tls

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

check_application_ports
if [[ "$AI_PROFILE" == ollama ]]; then
  compose --profile ollama up -d postgres redis qdrant ollama >/dev/null || \
    die 'could not start PostgreSQL, Redis, Qdrant, and Ollama with Docker Compose'
else
  compose up -d postgres redis >/dev/null || die 'could not start PostgreSQL and Redis with Docker Compose'
fi
wait_for_dependencies
configure_ai_profile

if [[ "$AI_PROFILE" == ollama ]]; then
  pull_ollama_model_if_missing "$LOCAL_OLLAMA_EMBEDDING_MODEL"
  pull_ollama_model_if_missing "$LOCAL_OLLAMA_GENERATION_MODEL"
  initialize_local_qdrant
fi

public_key="$(<"$PUBLIC_KEY_FILE")"
private_key="$(<"$PRIVATE_KEY_FILE")"

export AI_ENVIRONMENT=local
export AI_AUTH_REQUIRED=true
export AI_JWT_ALGORITHMS='["RS256"]'
export AI_JWT_ISSUER="$JWT_ISSUER"
export AI_JWT_AUDIENCE="$JWT_AUDIENCE"
export AI_JWT_SUBJECT="$JWT_SUBJECT"
export AI_JWT_PUBLIC_KEY="$public_key"
export AI_CV_PARSE_SCOPE=cv:parse
export AI_CV_MATCH_SCOPE=cv:match
export AI_RAG_RETRIEVE_SCOPE=rag:retrieve
export AI_RAG_GENERATE_SCOPE=rag:generate
export AI_JOB_INDEX_SCOPE=jobs:index
configure_cv_ocr_environment
start_process fastapi "$LOG_DIR/fastapi.log" "$AI_DIR" \
  uv run --no-sync uvicorn app.main:app --app-dir . --host 127.0.0.1 --port 8001 \
  --ssl-keyfile "$TLS_KEY" --ssl-certfile "$TLS_CERT"
clear_cv_ocr_environment
unset AI_JWT_PUBLIC_KEY

export NODE_ENV=development
export PORT=8000
export DB_HOST=127.0.0.1
export DB_PORT=5432
export DB_USERNAME=postgres
export DB_PASSWORD=postgres123
export DB_DATABASE=recruitment_db
export REDIS_ENABLED=true
export REDIS_TLS=false
export REDIS_HOST=127.0.0.1
export REDIS_PORT=6379
export REDIS_PASSWORD=redis123
export URL_FRONTEND=http://localhost:5173
export AI_SERVICE_URL="$AI_URL"
export AI_SERVICE_ISSUER="$JWT_ISSUER"
export AI_SERVICE_AUDIENCE="$JWT_AUDIENCE"
export AI_SERVICE_JWT_ALGORITHM=RS256
export AI_SERVICE_JWT_TTL_SECONDS=60
if [[ "$AI_PROFILE" == ollama ]]; then
  export AI_SERVICE_TIMEOUT_MS="$OLLAMA_AI_SERVICE_TIMEOUT_MS"
else
  export AI_SERVICE_TIMEOUT_MS="$DETERMINISTIC_AI_SERVICE_TIMEOUT_MS"
fi
export AI_SERVICE_JWT_SUBJECT="$JWT_SUBJECT"
export AI_SERVICE_JWT_PRIVATE_KEY="$private_key"
export AI_CV_PARSE_SCOPE=cv:parse
export AI_CV_MATCH_SCOPE=cv:match
export AI_RAG_RETRIEVE_SCOPE=rag:retrieve
export AI_RAG_GENERATE_SCOPE=rag:generate
export AI_JOB_INDEX_SCOPE=jobs:index
export NODE_EXTRA_CA_CERTS="$TLS_CERT"
start_process nestjs "$LOG_DIR/nestjs.log" "$BACKEND_DIR" npm run start:dev
unset AI_SERVICE_JWT_PRIVATE_KEY

export VITE_API_URL="$BACKEND_URL/api/v1"
export VITE_BACKEND_URL="$BACKEND_URL"
export VITE_SOCKET_URL="$BACKEND_URL"
start_process frontend "$LOG_DIR/frontend.log" "$FRONTEND_DIR" \
  npm run dev -- --host 127.0.0.1 --port 5173
unset VITE_API_URL VITE_BACKEND_URL VITE_SOCKET_URL

wait_for_http fastapi "${PIDS[0]}" "$AI_URL/health/ready" "$TLS_CERT"
wait_for_http nestjs "${PIDS[1]}" "$BACKEND_URL/api/v1/health/ready"
wait_for_http frontend "${PIDS[2]}" "$FRONTEND_URL/"
bootstrap_local_index_if_requested
printf 'All local services are ready. Ctrl-C stops application processes; Docker dependencies remain running.\n'
printf 'PIDs: fastapi=%s nestjs=%s frontend=%s\n' "${PIDS[0]}" "${PIDS[1]}" "${PIDS[2]}"
printf 'Logs: %s\n' "$LOG_DIR"

wait -n "${PIDS[@]}" >/dev/null 2>&1 || true
die 'an application process exited unexpectedly; inspect the retained logs'
