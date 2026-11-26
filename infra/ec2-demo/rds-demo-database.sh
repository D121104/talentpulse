#!/usr/bin/env bash
# Create/verify only the isolated demo database. Creation is an explicit
# privileged step; this script never drops, renames, or alters a database.
set -euo pipefail
umask 077
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/demo-lib.sh"
demo_load_env_file

action="${1:-verify}"
case "$action" in
  verify|create) ;;
  *) _demo_die "usage: rds-demo-database.sh [verify|create]" ;;
esac

demo_require_command psql
demo_require_command createdb
demo_require_env DB_HOST DB_PORT DB_USERNAME DB_DATABASE DB_SSL_CA_FILE DEMO_ADMIN_DB_PASSWORD
demo_require_demo_runtime
[[ "$DB_HOST" != localhost && "$DB_HOST" != 127.0.0.1 ]] || _demo_die "RDS host must not be local"
[[ "$DB_DATABASE" == talentpulse_demo ]] || _demo_die "database name is not isolated"
[[ "$DEMO_ADMIN_DB_PASSWORD" != *$'\n'* && -n "$DEMO_ADMIN_DB_PASSWORD" ]] || _demo_die "admin password input is invalid"

export PGHOST="$DB_HOST"
export PGPORT="$DB_PORT"
export PGUSER="$DB_USERNAME"
export PGPASSWORD="$DEMO_ADMIN_DB_PASSWORD"
export PGSSLMODE=verify-full
export PGSSLROOTCERT="$DB_SSL_CA_FILE"
admin_database="${DEMO_ADMIN_DB_NAME:-postgres}"
[[ "$admin_database" != talentpulse_demo ]] || _demo_die "maintenance database must not be the demo database"
export PGDATABASE="$admin_database"

exists="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT 1 FROM pg_database WHERE datname = 'talentpulse_demo'")" || _demo_die "privileged database inspection failed"
if [[ "$action" == create && "$exists" != 1 ]]; then
  [[ "${DEMO_RDS_PRIVILEGED_CONFIRM:-}" == CREATE_TALENTPULSE_DEMO_DB ]] || _demo_die "database creation requires DEMO_RDS_PRIVILEGED_CONFIRM=CREATE_TALENTPULSE_DEMO_DB"
  # CREATE DATABASE cannot run in a transaction. createdb receives the password
  # from PGPASSWORD and the exact fixed identifier is not shell-interpolated.
  createdb --no-password --maintenance-db "$admin_database" talentpulse_demo >/dev/null || _demo_die "isolated database creation failed"
  exists=1
fi
[[ "$exists" == 1 ]] || _demo_die "isolated database talentpulse_demo does not exist"

export PGDATABASE=talentpulse_demo
actual="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT current_database()")" || _demo_die "demo database verification failed"
[[ "$actual" == talentpulse_demo ]] || _demo_die "connected database is not talentpulse_demo"
tls="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT CASE WHEN ssl THEN 'on' ELSE 'off' END FROM pg_stat_ssl WHERE pid = pg_backend_pid()")" || _demo_die "database TLS verification failed"
[[ "$tls" == on ]] || _demo_die "RDS connection is not using verified TLS"
printf 'rds_database=talentpulse_demo status=ready tls=on\n'
