# Backend observability

This directory runs the metrics, logging, and alerting stack for the NestJS backend alongside PostgreSQL, Redis, and Elasticsearch.

## Stack components and ports

| Service | Host port | Purpose | Config file |
| :--- | :--- | :--- | :--- |
| Prometheus | `9090` | Scrapes metrics and evaluates metric alert rules | `config/prometheus.yml` |
| Alertmanager | `9093` | Deduplicates, inhibits, and sends alerts to Slack | `config/alertmanager.yml.tmpl` |
| Loki | `3100` | Stores logs and evaluates log alert rules | `config/loki-config.yml` |
| Promtail | `9080` | Tails `backend/logs/*.log` and container logs into Loki | `config/promtail-config.yml` |
| Grafana | `3001` | Hosts provisioned dashboards and datasources | `config/grafana/provisioning/` |
| cAdvisor | `8088` | Exports Docker container CPU, memory, and network stats | `docker-compose.yml` |
| `postgres-exporter` | internal `9187` | Exports PostgreSQL metrics on `backend-net` | `docker-compose.yml` |
| `redis-exporter` | internal `9121` | Exports Redis metrics on `backend-net` | `docker-compose.yml` |
| `elasticsearch-exporter` | internal `9114` | Exports Elasticsearch cluster and index metrics | `docker-compose.yml` |

## Prerequisites and environment setup

1. Copy `backend/environment/.env.example` to `backend/environment/.env`:

   ```bash
   cp backend/environment/.env.example backend/environment/.env
   ```

2. Set credentials and retention in `backend/environment/.env`:
   - `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `REDIS_PASSWORD`
   - `PROMETHEUS_RETENTION_TIME` (defaults to `15d`)
   - `GRAFANA_ADMIN_USER` and `GRAFANA_ADMIN_PASSWORD` (defaults to `admin` / `admin`)
   - `SLACK_WEBHOOK_URL`, `SLACK_CHANNEL`, `SLACK_USERNAME` (leave `SLACK_WEBHOOK_URL=` empty to run Alertmanager locally with Slack delivery disabled)

3. Configure backend logging and metrics variables in `backend/.env`:
   - `LOG_LEVEL`: `fatal`, `error`, `warn`, `info`, `debug`, `trace`, or `silent` (defaults to `info`; forced to `silent` when `NODE_ENV=test`)
   - `LOG_DIR`: directory for `app.log` (defaults to `<cwd>/logs`; Promtail mounts `../logs`)
   - `LOG_FILE_ENABLED`: `true` or `false` (defaults to `true`)
   - `LOG_PRETTY`: `true` or `false` (defaults to `true`; pretty-prints stdout only when `NODE_ENV` is `development` or `local`)
   - `METRICS_BEARER_TOKEN`: optional non-whitespace token up to 512 characters; when set, `GET /metrics` requires `Authorization: Bearer <token>`

If `METRICS_BEARER_TOKEN` is set in `backend/.env`, add an `authorization` block to the `nestjs-backend` scrape job in `backend/environment/config/prometheus.yml`:

```yaml
  - job_name: 'nestjs-backend'
    scrape_interval: 10s
    metrics_path: '/metrics'
    authorization:
      type: Bearer
      credentials: '<your-metrics-bearer-token>'
    static_configs:
      - targets: ['host.docker.internal:8000']
```

## Starting and verifying the stack

Start the infrastructure and observability services:

```bash
docker compose -f backend/environment/docker-compose.yml up -d
```

Start the NestJS backend on port `8000`:

```bash
cd backend && npm run dev
```

Verify each component:

- Backend metrics endpoint: `curl http://localhost:8000/metrics` (include `-H "Authorization: Bearer $METRICS_BEARER_TOKEN"` when enabled). Response status is `200`, `Content-Type` starts with `text/plain`, and the body uses Prometheus exposition text without the `{ statusCode, data }` API wrapper.
- Prometheus targets: open `http://localhost:9090/targets` and confirm `nestjs-backend`, `postgres-exporter`, `redis-exporter`, `elasticsearch-exporter`, `cadvisor`, `loki`, `promtail`, `alertmanager`, and `prometheus` show `UP`.
- Grafana dashboards: open `http://localhost:3001`, log in with `GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASSWORD`, and open the `TalentPulse Backend` folder. Three dashboards load automatically:
  - `TalentPulse - NestJS Backend Overview` (`tp-backend-overview`)
  - `TalentPulse - Backend Infrastructure & Exporters` (`tp-backend-infra`)
  - `TalentPulse - Centralized Logs & Alerts` (`tp-backend-logs`)
- Alertmanager status: open `http://localhost:9093`.

## Metrics reference

`MetricsService` creates an isolated Prometheus `Registry` with default label `service="talentpulse-backend"`, registers `collectDefaultMetrics`, and exposes the application metrics below:

| Metric | Type | Labels | Source |
| :--- | :--- | :--- | :--- |
| `http_requests_total` | Counter | `method`, `route`, `status_code` | `HttpMetricsMiddleware` |
| `http_request_duration_seconds` | Histogram | `method`, `route`, `status_code` | `HttpMetricsMiddleware` |
| `http_requests_in_flight` | Gauge | `method` | `HttpMetricsMiddleware` |
| `bull_queue_jobs` | Gauge | `queue`, `state` | `BullMetricsService` (every 15s) |
| `bull_queue_scrape_errors_total` | Counter | `queue` | `BullMetricsService` |
| `backend_dependency_up` | Gauge | `dependency` | `BullMetricsService` (`postgres`, `redis`, `elasticsearch`) |
| `backend_dependency_check_duration_seconds` | Histogram | `dependency` | `BullMetricsService` |

HTTP route normalization and exclusions:

- `HttpMetricsMiddleware` skips `/metrics` and `/favicon.ico`.
- `normalizeRoutePath` uses `baseUrl + route.path` for matched Express routes. For unmatched paths, it strips query strings and replaces UUIDs and numeric path segments with `:id`.
- `BullMetricsService` scrapes the `cv-processing`, `job-sync-es`, `mail-queue`, `online-cv-generation`, and `user-cv-parse` Bull queues across states `waiting`, `active`, `completed`, `failed`, `delayed`, and `paused`. It probes PostgreSQL, Redis, and Elasticsearch with a 1500ms timeout and does not probe the external AI service.

## Structured logs and correlation

`createPinoLoggerOptions` configures `nestjs-pino` without worker-thread transports:

- Request IDs: incoming `x-request-id` headers (up to 128 non-whitespace printable characters) are reused; otherwise a UUID is generated and returned in the `x-request-id` response header.
- Redaction: `req.headers.authorization`, `req.headers.cookie`, `res.headers['set-cookie']`, and nested `password`, `refreshToken`, `accessToken`, `token`, and `secret` fields are redacted.
- Ignored auto-logging paths: `/metrics`, `/api/v1/health`, `/api/v1/health/ready`, and `/favicon.ico`.
- Grafana correlation: the provisioned Loki datasource extracts `reqId` from JSON logs and generates an Explore link to query all log lines matching that request ID.

## Alert rules and Slack routing

Metric alert rules live in `config/prometheus-rules/backend-alerts.yml`:

- `talentpulse-backend-api`: `BackendDown`, `BackendHigh5xxErrorRate`, `BackendHigh4xxErrorRate`, `BackendHighLatencyP95`
- `talentpulse-backend-runtime-queues`: `BackendHighEventLoopLag`, `BackendHighMemoryUsage`, `BackendDependencyDown`, `BullQueueFailedJobsSpike`, `BullQueueBacklogHigh`
- `talentpulse-backend-infrastructure`: `PostgresDown`, `PostgresHighConnectionUsage`, `RedisDown`, `RedisHighMemoryUsage`, `ElasticsearchDown`, `ElasticsearchClusterRed`, `ContainerHighMemoryUsage`, `ScrapeTargetDown`

Log alert rules live in `config/loki-rules/fake/backend-log-alerts.yml`:

- `talentpulse-backend-log-alerts`: `BackendErrorLogSpike`, `BackendFatalOrUncaughtException`, `BackendDependencyLogErrors`

Alertmanager (`config/alertmanager.yml.tmpl`) groups alerts by `alertname`, `severity`, and `service`, routes critical alerts with a 10s `group_wait` and 1h `repeat_interval`, and inhibits warning alerts on the same `service`/`instance` when a critical or service-down alert is firing.

## Reloading configuration

- Reload Prometheus config and alert rules without restarting the container:

  ```bash
  curl -X POST http://localhost:9090/-/reload
  ```

- Reload Alertmanager template changes after editing `backend/environment/.env` or `config/alertmanager.yml.tmpl`:

  ```bash
  docker compose -f backend/environment/docker-compose.yml up -d --force-recreate alertmanager
  ```
