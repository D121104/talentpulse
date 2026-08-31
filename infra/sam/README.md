# TalentPulse staging SAM stack

`template.yaml` is a deliberately small SAM/CloudFormation stack for the existing
serverless topology. It creates infrastructure only; it does not create a VPC,
PostgreSQL/RDS, Qdrant, Secrets Manager values, an ECS cluster, or an ECS
service. It grants the FastAPI Lambda only the two Bedrock model invocations
used by the configured staging application; it does not grant Bedrock access to
either NestJS role.

## Topology

- **PublicApi** is an HTTP API with only `/` and `/{proxy+}` routes to the NestJS
  Lambda image (`backend/src/lambda.ts`, image default command
  `dist/lambda.handler`). Its conditional HTTP API Lambda-proxy integrations,
  routes, and invoke permissions are raw CloudFormation resources rather than
  nested SAM `HttpApi` events. This keeps bootstrap resources unconditional and
  avoids SAM-transform unreachable-condition lint warnings; every integration
  uses payload format `2.0`, and each permission is constrained to its API,
  `$default` stage, method, and route pattern.
- **AiApi** is a separate HTTP API with only the five implemented FastAPI
  `/internal/v1/...` POST routes. Its conditional raw Lambda-proxy resources use
  payload format `2.0` and per-route invoke permissions. It intentionally does
  **not** expose `/health/live` or `/health/ready`. FastAPI's existing
  service-JWT dependencies
  remain the authorization boundary for every exposed AI route.
- **IndexingQueue** is an SQS *standard* queue with a DLQ. The NestJS worker
  uses `dist/lambda-sqs.handler`, a maximum batch size of 10, and
  `ReportBatchItemFailures`, matching `backend/src/lambda-sqs.ts`.
- **BackfillTaskDefinition** is a single Fargate task definition with no ECS
  service. Its command calls `dist/tasks/ai-index-backfill.task.js` with the
  required `--environment` and bounded `--max-operations` arguments.

The stack also creates separate immutable/scanned ECR repositories, CloudWatch
log groups with configurable retention, and narrowly scoped execution roles.

## Required external resources

Supply existing staging-only resources when deploying:

1. **Private subnets and security groups** that can reach the dedicated staging
   PostgreSQL database and make required HTTPS egress calls. No VPC resources
   are created here.
2. A dedicated staging PostgreSQL database. The application's unscoped index
   outbox requires `AI_INDEX_ENVIRONMENT` and `AI_INDEX_OUTBOX_ENVIRONMENT` to
   both be `staging` (or the chosen `StageName`); do not point this stack at a
   local or production database.
3. A preflighted staging Qdrant Cloud collection/alias. The stack fixes
   `QDRANT_AUTO_INITIALIZE=false`, uses HTTPS, and expects the existing
   Cohere multilingual v3 / 1024-dimension staging representation.
4. An existing Secrets Manager secret for the backend and one for the AI
   service. The template references JSON keys dynamically and contains neither
   secret values nor defaults. The backend secret must provide these keys:

   ```text
   dbPassword, jwtSecret, jwtRefreshSecret, jwtAccessTokenSecret,
   cloudName, cloudinaryApiKey, cloudinaryApiSecret,
   emailHost, emailAuthUser, emailAuthPassword,
   googleClientId, googleClientSecret, googleCallbackUrl,
   payosClientId, payosApiKey, payosChecksumKey,
   aiServiceJwtPrivateKey
   ```

   The AI secret must provide `qdrantApiKey` and `serviceJwtPublicKey`. Do not
   put secret values in parameter files, the template, shell history, or source
   control.
5. An existing ECS cluster and a launch-time `awsvpc` network configuration for
   any explicit backfill run. The template intentionally does not own either.
6. Bedrock model access must already be enabled in the deployment Region for
   `cohere.embed-multilingual-v3` and `amazon.nova-lite-v1:0`. The stack's AI
   Lambda role permits only `bedrock:InvokeModel` against those two regional
   foundation-model ARNs. It deliberately grants no Bedrock permission to the
   public NestJS Lambda, indexing-worker Lambda, or Fargate task roles; Qdrant
   remains an HTTPS service authenticated with the AI runtime secret rather
   than AWS IAM.

If either model is not available for direct on-demand invocation in the target
Region/account, do not substitute an inference-profile or different model ARN
in this template without a separate least-privilege review. That choice needs
the account's approved provider configuration and is intentionally external to
this stack.

## Images

Every image parameter requires an OCI digest URI, for example
`repository-uri@sha256:<64-hex-digest>`; tags are rejected. The first deployment
uses the safe default `DeployWorkloads=false`, which creates the ECR repositories
and shared infrastructure without creating any Lambda or ECS workload that would
reference a not-yet-pushed image. Push immutable images to the output ECR
repositories, then update the stack with `DeployWorkloads=true` and matching
digest URIs. CloudFormation parameters without defaults, including the external
VPC, database, secret-ARN, and Qdrant parameters, still must be supplied for
the bootstrap deployment even though no workload consumes them until
`DeployWorkloads=true`; this avoids fabricated placeholder resource IDs or
secret values.

- `BackendLambdaImageUri` must use `backend/Dockerfile.lambda` and has the
  NestJS HTTP handler as its default Lambda command.
- `AiLambdaImageUri` must use `ai-service/Dockerfile.lambda` and has
  `app.lambda_handler.handler` as its default Lambda command.
- `BackfillImageUri` must be an **ECS-compatible** backend image in the
  created backfill repository. It must run a normal Node entrypoint, not the
  Lambda runtime entrypoint, so the task command can execute
  `node dist/tasks/ai-index-backfill.task.js ...`. The repository currently
  provides a Lambda Dockerfile only; building this distinct Fargate-compatible
  image is an external image-build concern and is intentionally not solved by
  this IaC-only change.

## Deploy

Validate before deploying, then pass non-secret values through your approved CI
parameter mechanism. The following uses placeholders only:

```bash
sam validate --template-file infra/sam/template.yaml
# Bootstrap repositories, queues, APIs, and logs first. Supply the same non-secret
# external-resource parameters shown below, but leave DeployWorkloads unset (false).
sam deploy \
  --template-file infra/sam/template.yaml \
  --stack-name talentpulse-staging-serverless \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides DeployWorkloads=false '<external-resource-parameters>'

# After pushing the three digest-pinned images, deploy the application workloads.
sam deploy \
  --template-file infra/sam/template.yaml \
  --stack-name talentpulse-staging-serverless \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    DeployWorkloads=true \
    StageName=staging \
    BackendLambdaImageUri='<backend-repository>@sha256:<digest>' \
    AiLambdaImageUri='<ai-repository>@sha256:<digest>' \
    BackfillImageUri='<backfill-repository>@sha256:<digest>' \
    VpcSubnetIds='<subnet-id-1>,<subnet-id-2>' \
    VpcSecurityGroupIds='<security-group-id>' \
    DatabaseHost='<staging-db-host>' \
    DatabaseName='<staging-db-name>' \
    DatabaseUsername='<staging-db-user>' \
    BackendRuntimeSecretArn='<backend-secret-arn>' \
    AiRuntimeSecretArn='<ai-secret-arn>' \
    QdrantUrl='https://<staging-qdrant-host>' \
    QdrantCollection='<physical-staging-collection>' \
    QdrantAlias='<staging-alias>' \
    QdrantCollectionVersion='<collection-version>' \
    FrontendUrl='https://<staging-frontend-origin>'
```

Use the output `BackfillTaskDefinitionArn` with an approved, explicitly invoked
ECS `run-task` workflow. Keep `--max-operations` bounded; the stack default is
1,000 and the application rejects values greater than 100,000. This task only
enqueues transactional outbox work. A separate, authorized producer must send
UUID-only `{"outboxId":"..."}` notifications to `IndexingQueue`; this template
does not invent a producer because the current application contains the
consumer only.

## Operational notes

- API Gateway endpoints are public network endpoints. The public API continues
  to use NestJS authorization. The AI API has no API Gateway authorizer by
  design because the existing FastAPI service-JWT verification remains in the
  request path; do not bypass it.
- The AI HTTP endpoint is needed for the NestJS worker and backfill task. It is
  not a health endpoint and does not add an alias-switch route.
- Lambda secrets use CloudFormation Secrets Manager dynamic references. The
  deployment principal resolves each JSON key during a stack operation, and the
  resulting value becomes Lambda environment configuration (encrypted at rest
  by Lambda). Consequently, the three Lambda execution roles intentionally do
  **not** have `secretsmanager:GetSecretValue`; restrict both the deployment
  principal and access to Lambda configuration. Secret rotation does not update
  Lambda environment configuration by itself, so redeploy after rotation.
- Fargate secrets use ECS `ContainerDefinition.Secrets`: its **execution role**
  reads the referenced JSON keys when a task starts, while the task role has no
  Secrets Manager permission. Start a new task after rotation. If the backend
  secret uses a customer-managed KMS key, grant the execution role `kms:Decrypt`
  on that externally managed key before running a task; no key ARN is added here.
- The AI Lambda explicitly sets the same `BEDROCK_CHAT_MODEL` Nova Lite model
  used by the application defaults. Its execution role is limited to
  `bedrock:InvokeModel` for that model and the configured Cohere embedding
  model; no streaming or wildcard Bedrock action is granted. The CloudWatch log
  permissions target the pre-created log-group ARNs directly, so they also do
  not permit creating arbitrary log groups.
- Both Lambda APIs and the worker receive VPC configuration because they require
  external staging services. Ensure the supplied subnet routing/DNS and security
  groups provide only the needed database and HTTPS egress paths.
- The worker source does not produce SQS messages. Its IAM role can only poll
  the stack's source queue; the public Lambda and backfill task have no SQS send
  permission.

## References

- SAM HTTP APIs: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-resource-httpapi.html
- SAM SQS partial-batch failures: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-property-function-sqs.html
- ECS Fargate task definitions: https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-ecs-taskdefinition.html
- CloudFormation Secrets Manager dynamic references: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/dynamic-references-secretsmanager.html
