# AWS Lambda Deployment

This project deploys the NestJS HTTP API to AWS Lambda through API Gateway.
It does not make Lambda a replacement for the application's long-running
background worker or Socket.IO server.

## Deployment choice

The current backend production dependency tree is larger than Lambda's 250 MB
uncompressed ZIP limit. Deploy it as a Lambda container image. The ZIP command
is retained only as a size check and will fail instead of producing an invalid
deployment artifact.

## 1. Build the Lambda container image

Prerequisites:

- Docker Desktop running locally.
- AWS CLI authenticated for the target AWS account and region.

Build the Linux Lambda image from the `backend` directory:

```powershell
npm run package:lambda-image
```

## Staging ECR and SAM deployment

Do not push or deploy a mutable `latest` image tag. Every workload image URI
must be immutable and use the form:

```text
<ecr-repository-uri>@sha256:<64-hex-character-digest>
```

`infra/sam/template.yaml` is authoritative for the SAM stack, image URI
parameters, and Lambda resources. Follow `docs/STAGING_MANUAL_DEPLOYMENT.md`
for the staging bootstrap, image push and digest resolution, scan review, and
SAM deployment procedure. Do not create the ECR repositories or Lambda
functions manually when deploying that stack.

## 2. ZIP package check

Run from the `backend` directory on Windows PowerShell:

```powershell
npm run package:lambda
```

The command performs these steps:

1. Installs build dependencies with `npm ci --include=dev`.
2. Builds `dist/` using Nest CLI and TypeScript.
3. Copies `dist/`, `package.json`, and `package-lock.json` to `.lambda-package/`.
4. Installs only production dependencies in `.lambda-package/node_modules/`.
5. Creates `lambda-deploy.zip` only when the uncompressed package is within
   Lambda's 250 MB ZIP deployment limit.

Do not run `npm ci --omit=dev` before `npm run build`. Nest CLI, TypeScript,
and type declarations are dev dependencies required during compilation.

## 3. Lambda configuration notes

The SAM template configures the deployed Lambda resources. These settings are
useful when reviewing the resulting Lambda configuration:

| Setting | Value |
| --- | --- |
| Runtime | Node.js 22.x |
| Architecture | x86_64 unless all native dependencies are built for arm64 |
| Handler | `dist/lambda.handler` |
| Timeout | Start at 30 seconds |
| Memory | Start at 1024 MB |

For the current project, use the container image. The ZIP workflow exits with
an error when the uncompressed package exceeds Lambda's 250 MB limit.

## 4. Configure API Gateway

Create an HTTP API (recommended) with a Lambda integration to this function.
Configure a catch-all route:

```text
ANY /{proxy+}
```

The Lambda application owns its REST routes. Important paths include:

```text
GET  /api/v1/health
GET  /api/v1/auth/google
GET  /api/v1/auth/google/callback
POST /api/v1/auth/google/exchange
```

Do not add `/api` again in API Gateway route mappings. The application already
sets the `/api` global prefix and `/v1` API version.

For browser cookies, let NestJS set CORS headers. Avoid an API Gateway CORS
configuration that returns `*` with credentials.

## 5. Configure Lambda environment variables

Do not include `.env` in the ZIP. Configure secrets through Lambda environment
variables or AWS Secrets Manager.

Required production values:

```env
NODE_ENV=production
DB_HOST=<rds-host>
DB_PORT=5432
DB_USERNAME=<database-user>
DB_PASSWORD=<database-password>
DB_DATABASE=<database-name>
DB_SYNCHRONIZE=false

REDIS_HOST=<redis-host>
REDIS_PORT=6379
REDIS_PASSWORD=<redis-password>

JWT_SECRET=<long-random-secret>
JWT_EXPIRES_IN=1d
JWT_REFRESH_SECRET=<different-long-random-secret>
JWT_REFRESH_EXPIRES_IN=7d

CLOUD_NAME=<cloudinary-cloud-name>
API_KEY=<cloudinary-api-key>
API_SECRET=<cloudinary-api-secret>

EMAIL_HOST=<smtp-host>
EMAIL_AUTH_USER=<smtp-user>
EMAIL_AUTH_PASSWORD=<smtp-password>

URL_FRONTEND=https://<frontend-domain>
CORS_ORIGINS=https://<frontend-domain>
COOKIE_SECURE=true
COOKIE_SAME_SITE=none
COOKIE_DOMAIN=

GOOGLE_CLIENT_ID=<google-client-id>
GOOGLE_CLIENT_SECRET=<google-client-secret>
GOOGLE_CALLBACK_URL=https://<api-domain>/api/v1/auth/google/callback

RUN_BACKGROUND_JOBS=false
```

For frontend and API subdomains of the same parent domain, set an appropriate
cookie policy for the browser deployment. Test refresh-token cookies in the
actual production domains before releasing authentication.

## 6. Google OAuth production setup

In Google Cloud Console, add the exact production callback URI:

```text
https://<api-domain>/api/v1/auth/google/callback
```

It must exactly match `GOOGLE_CALLBACK_URL`, including protocol, host, path,
and absence/presence of a trailing slash.

## 7. Background jobs and realtime constraints

Set `RUN_BACKGROUND_JOBS=false` for this Lambda function. Lambda is not a
reliable host for:

- Bull CV-processing workers.
- Scheduled email cron jobs.
- Persistent Socket.IO connections and in-memory user socket maps.
- Heavy Puppeteer PDF generation or AI model initialization on request paths.

Deploy a separate, long-running worker service with `RUN_BACKGROUND_JOBS=true`
for Bull processors and scheduled jobs. Use ECS/Fargate, EC2, App Runner, or a
container service for the worker. Realtime notifications need a compatible
WebSocket deployment and shared pub/sub state rather than this HTTP Lambda.

## 8. Post-deployment smoke checks

```text
GET https://<api-domain>/api/v1/health
GET https://<api-domain>/api/v1/auth/google
```

Then verify the browser flow:

1. Open the frontend login page.
2. Log in with email/password.
3. Refresh the page and confirm the session is restored.
4. Complete Google login and confirm the callback returns to the frontend.
5. Confirm `Set-Cookie` is present and the cookie has `HttpOnly`, `Secure`,
   and the expected `SameSite` policy.
