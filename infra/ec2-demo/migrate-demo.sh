#!/usr/bin/env bash
# Apply reviewed TypeORM migrations to the isolated demo database only.
set -euo pipefail
umask 077
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/demo-lib.sh"
demo_load_env_file
demo_require_command npm
demo_require_env NODE_ENV DB_DATABASE DB_SYNCHRONIZE DB_SSL_CA_FILE
[[ "$NODE_ENV" == demo ]] || _demo_die "NODE_ENV must be exactly demo"
[[ "$DB_DATABASE" == talentpulse_demo ]] || _demo_die "DB_DATABASE must be exactly talentpulse_demo"
[[ "$DB_SYNCHRONIZE" == false ]] || _demo_die "DB_SYNCHRONIZE must be exactly false"
[[ -r "$DB_SSL_CA_FILE" ]] || _demo_die "DB_SSL_CA_FILE must be readable"
repo_root="$(demo_repo_root)"
# migration:show is intentionally visible for operator review; no secret value is printed.
npm --prefix "$repo_root/backend" run migration:show
npm --prefix "$repo_root/backend" run migration:run
printf 'typeorm_migrations=applied db=talentpulse_demo synchronize=false\n'
