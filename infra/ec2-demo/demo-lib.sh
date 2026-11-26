#!/usr/bin/env bash
# Shared fail-closed helpers for the demo bootstrap/admission scripts.
set -euo pipefail
umask 077

_demo_die() {
  printf 'demo operation refused: %s\n' "$*" >&2
  exit 1
}

demo_require_command() {
  command -v "$1" >/dev/null 2>&1 || _demo_die "required command is unavailable: $1"
}

demo_require_env() {
  local name
  for name in "$@"; do
    [[ -n "${!name:-}" ]] || _demo_die "required runtime input is missing: $name"
  done
}

demo_load_env_file() {
  local env_file="${DEMO_ENV_FILE:-}"
  [[ -z "$env_file" ]] && return 0
  [[ -f "$env_file" ]] || _demo_die "DEMO_ENV_FILE does not exist"
  [[ "$env_file" != *.example ]] || _demo_die "refusing to load an example environment file"
  local mode
  mode="$(stat -c '%a' "$env_file")"
  [[ "$mode" =~ ^[0-7]*[0-6]0$ ]] || _demo_die "DEMO_ENV_FILE must not be group/world writable"
  # The file is operator-provided protected runtime input. Never trace or print it.
  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  set +a
}

demo_require_demo_runtime() {
  [[ "${NODE_ENV:-}" == demo ]] || _demo_die "NODE_ENV must be exactly demo"
  [[ "${DB_DATABASE:-}" == talentpulse_demo ]] || _demo_die "DB_DATABASE must be exactly talentpulse_demo"
  [[ "${DB_SYNCHRONIZE:-}" == false ]] || _demo_die "DB_SYNCHRONIZE must be exactly false"
  [[ -n "${DB_SSL_CA_FILE:-}" && -r "$DB_SSL_CA_FILE" ]] || _demo_die "DB_SSL_CA_FILE must be readable"
}

demo_repo_root() {
  cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd
}

demo_secure_parent() {
  local target="$1"
  local parent
  parent="$(dirname "$target")"
  mkdir -p "$parent"
  chmod 700 "$parent"
}
