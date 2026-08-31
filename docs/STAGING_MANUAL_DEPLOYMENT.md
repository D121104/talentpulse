# Huong dan trien khai staging thu cong

Tai lieu nay mo ta quy trinh trien khai staging TalentPulse bang AWS CLI, Docker,
AWS SAM va ECS Fargate. Cac lenh dung Bash va chi su dung placeholder. Khong
thay gia tri that cua secret, private key, Qdrant API key hoac mat khau vao
repository, tham so CloudFormation, command line hoac shell history.

## 1. Pham vi va trang thai

Topology staging duoc trien khai boi `infra/sam/template.yaml`:

```text
React
  -> Public API Gateway
  -> NestJS Lambda
  -> AI API Gateway + service JWT RS256
  -> FastAPI Lambda
  -> Bedrock / Qdrant Cloud

PostgreSQL ai_index_outbox
  -> scheduled NestJS publisher Lambda (mac dinh tat schedule)
  -> UUID-only SQS standard queue
  -> NestJS SQS Lambda
  -> AI API Gateway
  -> FastAPI Lambda

ECS Fargate task
  -> backfill co gioi han
  -> PostgreSQL transaction outbox
```

Stack SAM chi tao infrastructure va workload resources khi
`DeployWorkloads=true`. Stack khong tao:

- VPC, private subnet, route table, NAT Gateway hoac VPC endpoint.
- PostgreSQL/RDS.
- Qdrant Cloud cluster, collection, alias hoac payload indexes.
- Secrets Manager secret values.
- ECS cluster hoac ECS service.
- VPC, private subnet, route table, NAT Gateway hoac VPC endpoint cho SQS.

Quy trinh nay chua phai la production-ready neu cac blocker sau chua duoc xu
ly:

- Publisher scheduled la rollout da du kien, chua duoc xem la da live. Truoc
  khi enable, image backend phai chua `dist/lambda-outbox-publisher.handler`,
  `npm run ai-index` phai ho tro lenh `publish`, va migration publication phai
  duoc ap dung va kiem thu tren database staging.
- Contract environment cua publisher phai duoc dong bo voi template:
  `AI_INDEX_QUEUE_URL`, `AI_INDEX_PUBLISHER_ID`, va
  `AI_INDEX_PUBLISH_LEASE_MS`. Batch cua scheduled Lambda dung default da
  gioi han trong application; manual CLI co the chon ro `--batch-size`.
- `backend/Dockerfile.backfill` phai duoc build, scan, va push thanh image ECS
  rieng pin bang digest. Khong dung truc tiep `backend/Dockerfile.lambda` cho
  Fargate.
- Database phai la database staging rieng vi `ai_index_outbox` hien chua co
  cot environment.
- Chua co live AWS deployment, Qdrant preflight, Bedrock smoke test, provider
  parity evaluation hoac alias cutover trong huong dan nay.

## 2. Dieu kien bat buoc

### 2.1 Cong cu va quyen

Can co:

- AWS CLI da dang nhap dung account va Region.
- AWS SAM CLI.
- Docker Engine hoac Docker Desktop co the build Linux `x86_64` image.
- `cfn-lint` va `yamllint` neu muon chay day du lint IaC.
- Node.js/npm cho database migration.
- OpenSSL cho viec tao cap khoa service JWT.
- Maintenance host hoac CI runner co network access toi PostgreSQL staging
  trong private subnet.

Principal thuc hien `sam deploy` can quyen tao/cap nhat CloudFormation,
Lambda, API Gateway, IAM, ECR, SQS va CloudWatch Logs. Principal deploy cung
can doc cac JSON key trong hai secret duoc tham chieu bang CloudFormation
dynamic reference. Khong cap Bedrock permission cho runtime NestJS.

Kiem tra account va Region truoc khi thao tac:

```bash
export AWS_PROFILE=<approved-aws-profile>
export AWS_REGION=<aws-region>

aws sts get-caller-identity --profile "$AWS_PROFILE"
aws configure get region --profile "$AWS_PROFILE"
```

Neu dung shell profile mac dinh, co the bo `--profile "$AWS_PROFILE"` trong
cac lenh sau. Luon xac nhan account ID va Region tu ket qua tren.

### 2.2 Gia tri staging can chuan bi

Ghi cac gia tri khong phai secret vao he thong quan ly thay doi da duoc phe
duyet:

| Gia tri                       | Vi du placeholder                     | Ghi chu                                   |
| ----------------------------- | ------------------------------------- | ----------------------------------------- |
| `StageName`                   | `staging`                             | Chi dung chu thuong, so va dau gach ngang |
| Private subnet IDs            | `subnet-...`                          | It nhat hai subnet neu co the             |
| Lambda/ECS security group IDs | `sg-...`                              | Cho phep DB va HTTPS egress can thiet     |
| PostgreSQL host               | `staging-db.example.internal`         | Database staging rieng                    |
| PostgreSQL database           | `recruitment_db`                      | Phai co baseline schema                   |
| PostgreSQL username           | `talentpulse_staging`                 | Password nam trong secret                 |
| Backend secret ARN            | `arn:aws:secretsmanager:...`          | Chi ARN, khong phai secret value          |
| AI secret ARN                 | `arn:aws:secretsmanager:...`          | Chi ARN, khong phai secret value          |
| Qdrant URL                    | `https://...`                         | Bat buoc HTTPS                            |
| Qdrant physical collection    | `jobs_cohere_multilingual_v3_1024_v1` | Phai preflight truoc deploy               |
| Qdrant alias                  | `jobs_current_staging`                | Phai khac physical collection             |
| Collection version            | `cohere-v3-1024-v1`                   | Phai trung voi marker/manifest            |
| Frontend origin               | `https://staging.example.com`         | Dung cho CORS NestJS                      |
| JWT issuer                    | `talentpulse-api`                     | Phai trung hai service                    |
| JWT audience                  | `talentpulse-ai`                      | Phai trung hai service                    |
| JWT key ID                    | `staging-key-20260831-01`             | Phai trung public key dang luu            |
| ECS cluster ARN/name          | `talentpulse-staging`                 | Cluster co san                            |

Khong dung local PostgreSQL, production PostgreSQL, local Qdrant collection
hoac production Qdrant alias cho staging.

## 3. Chuan bi network

Template khong tao network resource. Chuan bi truoc cac thanh phan sau:

1. VPC co private subnets o cac Availability Zone phu hop.
2. Lambda security group va ECS task security group co outbound TCP 443.
3. PostgreSQL security group cho phep TCP 5432 tu security group cua Lambda,
   ECS task va maintenance host neu can migration.
4. Private subnets co DNS resolution va route toi PostgreSQL.
5. Publisher Lambda trong VPC phai co egress toi regional SQS endpoint de
   `sqs:SendMessage`: dung NAT Gateway hoac Interface VPC endpoint
   `com.amazonaws.<region>.sqs` voi Private DNS va security group cho TCP 443.
6. Private subnets co NAT Gateway hoac VPC endpoints phu hop cho:
   - Bedrock Runtime neu FastAPI Lambda dung endpoint cong cong.
   - Qdrant Cloud HTTPS.
   - API Gateway endpoint ma NestJS Lambda va Fargate task goi toi.
   - ECR, CloudWatch Logs va Secrets Manager cho Fargate execution role.
7. Network ACL va firewall khong chan cac luong HTTPS can thiet.

Lambda VPC configuration khong tu dong tao internet egress. Neu thieu NAT hoac
VPC endpoint, Lambda van co the duoc API Gateway invoke nhung khong goi duoc
PostgreSQL, Bedrock, Qdrant Cloud, SQS hoac AI API. SQS publisher phai fail
closed khi khong co egress; khong enable schedule de retry lien tuc truoc khi
duong SQS da duoc preflight.

Kiem tra tu maintenance host hoac mot task tam thoi trong cung network:

```bash
getent hosts <staging-db-host>
nc -vz <staging-db-host> 5432
curl --fail --silent --show-error https://<staging-qdrant-host>/collections
```

Lenh Qdrant tren chi kiem tra network. Khong them API key vao command line neu
endpoint yeu cau authentication.

## 4. Tao cap khoa service JWT

NestJS ky short-lived asymmetric service JWT; FastAPI chi can public key. Public
user JWT khong duoc chuyen tiep sang FastAPI.

Template mac dinh dung `RS256`. Tao RSA key pair tren may duoc kiem soat, ngoai
repository:

```bash
umask 077
mkdir -p /secure/talentpulse/staging

openssl genpkey \
  -algorithm RSA \
  -pkeyopt rsa_keygen_bits:3072 \
  -out /secure/talentpulse/staging/ai-service-jwt-private.pem

openssl pkey \
  -in /secure/talentpulse/staging/ai-service-jwt-private.pem \
  -pubout \
  -out /secure/talentpulse/staging/ai-service-jwt-public.pem

openssl pkey -in /secure/talentpulse/staging/ai-service-jwt-private.pem -check
openssl pkey -pubin -in /secure/talentpulse/staging/ai-service-jwt-public.pem -pubcheck
```

Kiem tra hai file la PEM hop le va khong ghi key ra terminal. Luu:

- private key trong backend secret voi key `aiServiceJwtPrivateKey`;
- public key trong AI secret voi key `serviceJwtPublicKey`;
- cung mot `AiServiceJwtKeyId`, vi du `staging-key-20260831-01`.

Issuer/audience phai giong nhau:

```text
AI_SERVICE_ISSUER=talentpulse-api
AI_SERVICE_AUDIENCE=talentpulse-ai
AI_SERVICE_JWT_ALGORITHM=RS256
AI_SERVICE_JWT_TTL_SECONDS=60
```

Service JWT scopes duoc ho tro:

```text
rag:retrieve
rag:generate
jobs:index
```

Khong dung public user JWT, HS256, key ID khong khop hoac token co TTL qua 300
giay.

## 5. Tao Secrets Manager secrets

Tao hai secret staging rieng bang Console, CI secret store hoac quy trinh
Secrets Manager da duoc phe duyet. Secret value phai la JSON object. Khong
commit cac file JSON nay va khong dat gia tri that vao `--secret-string`.

### 5.1 Backend secret

Backend secret phai co cac key sau:

```json
{
  "dbPassword": "<postgres-password>",
  "jwtSecret": "<random-secret>",
  "jwtRefreshSecret": "<different-random-secret>",
  "jwtAccessTokenSecret": "<different-random-secret>",
  "cloudName": "<cloudinary-cloud-name>",
  "cloudinaryApiKey": "<cloudinary-api-key>",
  "cloudinaryApiSecret": "<cloudinary-api-secret>",
  "emailHost": "<smtp-host>",
  "emailAuthUser": "<smtp-user>",
  "emailAuthPassword": "<smtp-password>",
  "googleClientId": "<google-client-id>",
  "googleClientSecret": "<google-client-secret>",
  "googleCallbackUrl": "https://<staging-api-host>/api/v1/auth/google/callback",
  "payosClientId": "<payos-client-id>",
  "payosApiKey": "<payos-api-key>",
  "payosChecksumKey": "<payos-checksum-key>",
  "aiServiceJwtPrivateKey": "-----BEGIN PRIVATE KEY-----\n<private-key-lines>\n-----END PRIVATE KEY-----"
}
```

### 5.2 AI secret

AI secret phai co:

```json
{
  "qdrantApiKey": "<staging-qdrant-api-key>",
  "serviceJwtPublicKey": "-----BEGIN PUBLIC KEY-----\n<public-key-lines>\n-----END PUBLIC KEY-----"
}
```

Luu full PEM key. Ung dung ho tro PEM multiline hoac chuoi co literal `\\n`.
Khong luu key duoi dang plaintext trong template, parameter file, log hoac
shell history.

Sau khi tao secret, chi lay ARN:

```bash
aws secretsmanager describe-secret \
  --secret-id <backend-secret-name-or-arn> \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE" \
  --query ARN \
  --output text

aws secretsmanager describe-secret \
  --secret-id <ai-secret-name-or-arn> \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE" \
  --query ARN \
  --output text
```

Neu secret dung customer-managed KMS key, cap them `kms:Decrypt` cho
`BackfillTaskExecutionRole` truoc khi chay Fargate task. Lambda execution roles
khong doc secret luc runtime; CloudFormation dynamic reference nap gia tri vao
Lambda environment configuration trong qua trinh deploy.

Sau khi rotate secret:

- redeploy stack de Lambda nhan environment configuration moi;
- start task Fargate moi;
- khong cho rang rotation tu dong cap nhat Lambda environment hien tai.

## 6. Chuan bi PostgreSQL staging

PostgreSQL la canonical source of truth. `ai_index_outbox` hien chua co cot
environment, do do database staging phai duoc tach khoi production va local.

Kiem tra schema nen tang truoc migration:

```sql
SELECT
  to_regclass('public.users') AS users,
  to_regclass('public.jobs') AS jobs,
  to_regclass('public.companies') AS companies,
  to_regclass('public.user_cvs') AS user_cvs;
```

Neu database moi hoan toan va chua co initial schema/baseline migration, dung
lai. Khong bat `DB_SYNCHRONIZE=true` de sua loi schema trong staging/production.
Xem them `docs/MIGRATION_DATABASE.md`.

Chay migration tu maintenance host hoac CI runner co DB access. Cac bien moi
truong duoi day chi la vi du; nap `DB_PASSWORD` tu secret store cua runner,
khong ghi password vao file trong repository:

```bash
cd backend
npm ci --include=dev

export NODE_ENV=staging
export DB_HOST=<staging-db-host>
export DB_PORT=5432
export DB_USERNAME=<staging-db-user>
export DB_PASSWORD=<injected-at-runtime>
export DB_DATABASE=<staging-db-name>
export DB_SYNCHRONIZE=false
export AI_INDEX_ENVIRONMENT=staging
export AI_INDEX_OUTBOX_ENVIRONMENT=staging

npm run migration:show
npm run migration:run
npm run migration:show
```

Kiem tra migration bang query chi doc neu can:

```sql
SELECT *
FROM typeorm_migrations
ORDER BY id;
```

Khong chay `npm ci --omit=dev` truoc migration vi TypeORM CLI can cac dev
dependencies.

## 7. Bat quyen truy cap Bedrock

AI Lambda duoc phep goi duy nhat hai model sau:

```text
cohere.embed-multilingual-v3
amazon.nova-lite-v1:0
```

Bat/quyet dinh model access trong dung account va Region truoc deploy. Kiem tra
model hien dien:

```bash
aws bedrock get-foundation-model \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE" \
  --model-identifier cohere.embed-multilingual-v3 \
  --query 'modelDetails.{modelId:modelId,provider:providerName,input:inputModalities,output:outputModalities}'

aws bedrock get-foundation-model \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE" \
  --model-identifier amazon.nova-lite-v1:0 \
  --query 'modelDetails.{modelId:modelId,provider:providerName,input:inputModalities,output:outputModalities}'
```

Neu account/Region khong ho tro direct on-demand invocation, khong tu y doi
sang inference profile hoac model ARN khac. Can review lai least-privilege IAM
truoc khi thay doi template.

Thuc hien mot provider smoke test co gioi han bang du lieu khong nhay cam. Vi
du voi Cohere:

```bash
# Request file phai nam ngoai repository va chi gom mot cau test.
aws bedrock-runtime invoke-model \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE" \
  --model-id cohere.embed-multilingual-v3 \
  --body fileb:///secure/talentpulse/staging/cohere-smoke-request.json \
  --content-type application/json \
  --accept application/json \
  /secure/talentpulse/staging/cohere-smoke-response.json
```

Neu can xac minh Nova Lite cho Phase 4, chay mot request ngan voi output token
thap. Khong dung readiness probe de goi model vi readiness khong duoc phep tao
paid provider call moi lan probe.

## 8. Preflight Qdrant Cloud

Tao hoac chuan bi collection staging bang Qdrant Cloud Console hoac mot
operator operation duoc access-control. Ung dung dat:

```text
VECTOR_STORE_PROVIDER=qdrant
EMBEDDING_PROVIDER=bedrock_cohere
BEDROCK_EMBEDDING_MODEL=cohere.embed-multilingual-v3
BEDROCK_EMBEDDING_DIMENSIONS=1024
QDRANT_AUTO_INITIALIZE=false
QDRANT_URL=https://<staging-qdrant-host>
QDRANT_COLLECTION=<staging-physical-collection>
QDRANT_ALIAS=<staging-alias>
QDRANT_COLLECTION_VERSION=<staging-collection-version>
```

### 8.1 Collection representation

Physical collection phai thoa man:

- vector size `1024`;
- distance `Cosine`;
- physical collection name la duy nhat;
- alias khac physical collection;
- collection version dung voi manifest staging;
- khong chua vector copy tu local hoac production.

Representation marker phai la reserved point co ID:

```text
f1b2c3d4-e5f6-4789-a012-3456789abcde
```

Payload marker phai khop chinh xac manifest staging:

```json
{
  "_talentpulse_reserved": "collection_representation_metadata_v1",
  "_talentpulse_metadata_schema_version": 1,
  "foundation_version": "phase1",
  "embedding_model": "cohere.embed-multilingual-v3",
  "embedding_model_version": "cohere.embed-multilingual-v3",
  "embedding_dimensions": 1024,
  "normalization_version": "nfkc-html-whitespace-v1",
  "chunking_version": "section-greedy-v1",
  "index_schema_version": "job-index-v1",
  "embedding_provider": "bedrock_cohere",
  "collection_version": "<staging-collection-version>"
}
```

Marker khong duoc chua searchable text, CV, job description hoac PII. Neu
collection da ton tai voi marker legacy, marker thieu field hoac field sai gia
tri, dung lai va tao collection moi thay vi sua im lang.

### 8.2 Payload indexes

Tao va xac minh cac payload index tren physical collection. Field type phai
trung bang sau:

| Field                | Qdrant type |
| -------------------- | ----------- |
| `job_id`             | `uuid`      |
| `company_id`         | `uuid`      |
| `is_active`          | `bool`      |
| `is_deleted`         | `bool`      |
| `company_is_active`  | `bool`      |
| `company_is_deleted` | `bool`      |
| `is_chunked`         | `bool`      |
| `start_date`         | `datetime`  |
| `end_date`           | `datetime`  |
| `updated_at`         | `datetime`  |
| `deleted_at`         | `datetime`  |
| `company_deleted_at` | `datetime`  |
| `location`           | `keyword`   |
| `level`              | `keyword`   |
| `work_mode`          | `keyword`   |
| `employment_type`    | `keyword`   |
| `skills`             | `keyword`   |
| `salary`             | `float`     |

`QDRANT_AUTO_INITIALIZE=false` co nghia la FastAPI se fail closed neu
collection, marker hoac payload indexes chua san sang. Khong bat thanh `true`
de bo qua preflight tren staging/production.

Thuc hien alias switch/rollback theo dung `docs/QDRANT_ALIAS_CUTOVER.md`:

- thao tac operator-only;
- ghi lai mapping hien tai truoc thao tac;
- validate vector config, marker, manifest va payload indexes;
- chi gui mot atomic alias update;
- chi coi la thanh cong sau exact readback;
- neu readback khong ro, khong retry bang cach doan mapping hien tai.

## 9. Validate SAM template

Tu repository root:

```bash
sam validate --lint --template-file infra/sam/template.yaml
cfn-lint infra/sam/template.yaml
sam build --template-file infra/sam/template.yaml
```

`sam build` can Docker trong mot so moi truong. Khong tiep tuc deploy neu
validate/lint fail.

## 10. Bootstrap infrastructure

Lan deploy dau tien dung `DeployWorkloads=false`. Lan nay tao ECR repositories,
SQS/DLQ, hai HTTP API, log groups va cac resource shared ma khong tao Lambda
hoac Fargate workload tham chieu image chua push.

Khai bao cac bien khong phai secret trong shell. Cac ARN duoi day chi la
placeholder:

```bash
export STACK_NAME=talentpulse-staging-serverless
export STAGE_NAME=staging
export VPC_SUBNET_IDS=<subnet-id-1>,<subnet-id-2>
export VPC_SECURITY_GROUP_IDS=<security-group-id>
export DATABASE_HOST=<staging-db-host>
export DATABASE_PORT=5432
export DATABASE_NAME=<staging-db-name>
export DATABASE_USERNAME=<staging-db-user>
export BACKEND_SECRET_ARN=<backend-secret-arn>
export AI_SECRET_ARN=<ai-secret-arn>
export QDRANT_URL=https://<staging-qdrant-host>
export QDRANT_COLLECTION=<staging-physical-collection>
export QDRANT_ALIAS=<staging-alias>
export QDRANT_COLLECTION_VERSION=<staging-collection-version>
export FRONTEND_URL=https://<staging-frontend-origin>
export AI_SERVICE_ISSUER=talentpulse-api
export AI_SERVICE_AUDIENCE=talentpulse-ai
export AI_SERVICE_KEY_ID=<staging-jwt-key-id>
export BACKFILL_MAX_OPERATIONS=1000
# Giu publisher schedule tat cho bootstrap, rollout, va smoke test co kiem soat.
export INDEXING_PUBLISHER_SCHEDULE_ENABLED=false

COMMON_PARAMETERS=(
  StageName="$STAGE_NAME"
  VpcSubnetIds="$VPC_SUBNET_IDS"
  VpcSecurityGroupIds="$VPC_SECURITY_GROUP_IDS"
  DatabaseHost="$DATABASE_HOST"
  DatabasePort="$DATABASE_PORT"
  DatabaseName="$DATABASE_NAME"
  DatabaseUsername="$DATABASE_USERNAME"
  BackendRuntimeSecretArn="$BACKEND_SECRET_ARN"
  AiRuntimeSecretArn="$AI_SECRET_ARN"
  QdrantUrl="$QDRANT_URL"
  QdrantCollection="$QDRANT_COLLECTION"
  QdrantAlias="$QDRANT_ALIAS"
  QdrantCollectionVersion="$QDRANT_COLLECTION_VERSION"
  AiServiceIssuer="$AI_SERVICE_ISSUER"
  AiServiceAudience="$AI_SERVICE_AUDIENCE"
  AiServiceJwtKeyId="$AI_SERVICE_KEY_ID"
  FrontendUrl="$FRONTEND_URL"
  BackfillMaxOperations="$BACKFILL_MAX_OPERATIONS"
  LogRetentionInDays=30
)
```

Bootstrap va review change set:

```bash
sam deploy \
  --template-file infra/sam/template.yaml \
  --stack-name "$STACK_NAME" \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE" \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    DeployWorkloads=false \
    IndexingPublisherScheduleEnabled=false \
    "${COMMON_PARAMETERS[@]}"
```

Khong dung `--no-confirm-changeset` cho lan deploy dau tien. Kiem tra
CloudFormation change set, VPC references, secret ARNs, Qdrant parameters va
IAM resources truoc khi approve.

Lay outputs ma khong in environment secrets:

```bash
aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE" \
  --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' \
  --output table
```

Luu lai cac output sau trong he thong quan ly thay doi:

- `BackendLambdaRepositoryUri`;
- `AiLambdaRepositoryUri`;
- `BackfillRepositoryUri`;
- `IndexingQueueUrl` va `IndexingQueueArn`;
- `IndexingDeadLetterQueueUrl`.

`IndexingPublisherScheduleEnabled` la parameter SAM da co san va mac dinh
`false`. Cac bien `AI_INDEX_QUEUE_URL`, `AI_INDEX_PUBLISHER_ID`, va
`AI_INDEX_PUBLISH_LEASE_MS` la environment variables cua publisher do template
cap; operator khong dat secret hoac queue URL thu cong vao Lambda configuration.
Scheduled Lambda dung batch default da gioi han trong application; dung CLI
`--batch-size` cho manual publish. Truoc khi rollout, xac nhan template va image
cung dung cac ten nay; khong dung parameter nay de bo qua blocker implementation.

## 11. Build va push image immutable

### 11.1 Kiem tra blocker backend

Truoc khi build backend, mo `backend/Dockerfile.lambda` va xac nhan base image
la Node.js runtime duoc AWS ho tro. Tai thoi diem tai lieu nay, file dung
`public.ecr.aws/lambda/nodejs:22` cho ca build va runtime stage.

Sau khi da review Dockerfile va build dependency, build Lambda images tu
repository root. Tren Linux dung Docker truc tiep thay vi PowerShell script:

```bash
export IMAGE_TAG=<git-sha-or-utc-build-id>

export BACKEND_REPOSITORY_NAME="talentpulse/${STAGE_NAME}/backend-lambda"
export AI_REPOSITORY_NAME="talentpulse/${STAGE_NAME}/ai-lambda"
export BACKFILL_REPOSITORY_NAME="talentpulse/${STAGE_NAME}/backfill"

export BACKEND_REPOSITORY_URI=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE" \
  --query "Stacks[0].Outputs[?OutputKey=='BackendLambdaRepositoryUri'].OutputValue" \
  --output text)

export AI_REPOSITORY_URI=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE" \
  --query "Stacks[0].Outputs[?OutputKey=='AiLambdaRepositoryUri'].OutputValue" \
  --output text)

export BACKFILL_REPOSITORY_URI=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE" \
  --query "Stacks[0].Outputs[?OutputKey=='BackfillRepositoryUri'].OutputValue" \
  --output text)

export ECR_REGISTRY="${BACKEND_REPOSITORY_URI%%/*}"

aws ecr get-login-password \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE" \
  | docker login --username AWS --password-stdin "$ECR_REGISTRY"

docker build \
  --platform linux/amd64 \
  -f backend/Dockerfile.lambda \
  -t "$BACKEND_REPOSITORY_URI:$IMAGE_TAG" \
  backend

docker build \
  --platform linux/amd64 \
  -f ai-service/Dockerfile.lambda \
  -t "$AI_REPOSITORY_URI:$IMAGE_TAG" \
  ai-service

docker push "$BACKEND_REPOSITORY_URI:$IMAGE_TAG"
docker push "$AI_REPOSITORY_URI:$IMAGE_TAG"
```

ECR repositories trong stack la immutable va scan-on-push. Khong push tag
`latest` va khong dung tag trong `sam deploy`; CloudFormation phai nhan URI co
digest.

### 11.2 Backfill image

`BackfillImageUri` phai la image ECS-compatible rieng. Repository hien co
`backend/Dockerfile.backfill`; image nay can:

- chay Linux `x86_64` voi Fargate;
- co Node runtime va production dependencies cua backend;
- co `dist/tasks/ai-index-backfill.task.js`;
- dung normal Node entrypoint;
- khong dung Lambda Runtime Interface Client/entrypoint.

Build va push `backend/Dockerfile.backfill` thanh image rieng. Khong chuyen
`backend/Dockerfile.lambda` sang Fargate bang cach override command. Chi build
va push sau khi co Dockerfile ECS da review:

```bash
docker build \
  --platform linux/amd64 \
  -f backend/Dockerfile.backfill \
  -t "$BACKFILL_REPOSITORY_URI:$IMAGE_TAG" \
  backend

docker push "$BACKFILL_REPOSITORY_URI:$IMAGE_TAG"
```

Neu image nay chua build, scan, va push thanh cong, dung o buoc nay va giu
`DeployWorkloads=false`; khong deploy task definition tham chieu image khong ton tai.

### 11.3 Lay digest va kiem tra scan

Lay digest tu ECR sau khi push:

```bash
export BACKEND_DIGEST=$(aws ecr describe-images \
  --repository-name "$BACKEND_REPOSITORY_NAME" \
  --image-ids imageTag="$IMAGE_TAG" \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE" \
  --query 'imageDetails[0].imageDigest' \
  --output text)

export AI_DIGEST=$(aws ecr describe-images \
  --repository-name "$AI_REPOSITORY_NAME" \
  --image-ids imageTag="$IMAGE_TAG" \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE" \
  --query 'imageDetails[0].imageDigest' \
  --output text)

export BACKFILL_DIGEST=$(aws ecr describe-images \
  --repository-name "$BACKFILL_REPOSITORY_NAME" \
  --image-ids imageTag="$IMAGE_TAG" \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE" \
  --query 'imageDetails[0].imageDigest' \
  --output text)

export BACKEND_IMAGE_URI="${BACKEND_REPOSITORY_URI}@${BACKEND_DIGEST}"
export AI_IMAGE_URI="${AI_REPOSITORY_URI}@${AI_DIGEST}"
export BACKFILL_IMAGE_URI="${BACKFILL_REPOSITORY_URI}@${BACKFILL_DIGEST}"

printf '%s\n' "$BACKEND_IMAGE_URI" "$AI_IMAGE_URI" "$BACKFILL_IMAGE_URI"
```

Chi in image URI va digest, khong in secret. Xac nhan moi digest co dang
`sha256:<64-hex-character>` va review ECR scan findings truoc deploy:

```bash
aws ecr describe-image-scan-findings \
  --repository-name "$BACKEND_REPOSITORY_NAME" \
  --image-id imageTag="$IMAGE_TAG" \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE" \
  --query 'imageScanFindings.findingSeverityCounts'
```

Lap lai cho AI va backfill image. Khong deploy neu co vulnerability High/Critical
chua duoc phe duyet.

## 12. Deploy workloads

Chi chay buoc nay sau khi:

- database migration staging da thanh cong;
- Qdrant collection, marker, payload indexes va alias da preflight;
- Bedrock access da duoc cap va smoke test;
- ba image da duoc push va pin bang digest;
- backend image co Lambda publisher handler va CLI `publish` da duoc kiem thu;
- SQS VPC egress cua publisher da duoc preflight;
- `IndexingPublisherScheduleEnabled=false` cho rollout va smoke test;
- change set da duoc review.

Cap nhat stack voi cung bo external parameters va digest URI:

```bash
sam deploy \
  --template-file infra/sam/template.yaml \
  --stack-name "$STACK_NAME" \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE" \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    DeployWorkloads=true \
    IndexingPublisherScheduleEnabled="$INDEXING_PUBLISHER_SCHEDULE_ENABLED" \
    BackendLambdaImageUri="$BACKEND_IMAGE_URI" \
    AiLambdaImageUri="$AI_IMAGE_URI" \
    BackfillImageUri="$BACKFILL_IMAGE_URI" \
    "${COMMON_PARAMETERS[@]}"
```

Review change set truoc approve. Sau deploy, kiem tra outputs va workload
configuration ma khong dump secrets:

```bash
aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE" \
  --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' \
  --output table

aws lambda get-function-configuration \
  --function-name "${STACK_NAME}-public-api" \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE" \
  --query '{state:State,lastUpdate:LastUpdateStatus,packageType:PackageType,timeout:Timeout,memory:MemorySize}'

aws lambda get-function-configuration \
  --function-name "${STACK_NAME}-ai-api" \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE" \
  --query '{state:State,lastUpdate:LastUpdateStatus,packageType:PackageType,timeout:Timeout,memory:MemorySize}'

aws lambda get-function-configuration \
  --function-name "${STACK_NAME}-indexing-publisher" \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE" \
  --query "{state:State,lastUpdate:LastUpdateStatus,packageType:PackageType,timeout:Timeout,memory:MemorySize}"

aws lambda list-event-source-mappings \
  --function-name "${STACK_NAME}-indexing-worker" \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE" \
  --query 'EventSourceMappings[*].{state:State,uuid:UUID,batch:BatchSize,maxConcurrency:ScalingConfig.MaximumConcurrency}'
```

Kiem tra IAM boundary:

- chi `AiApiFunctionRole` co `bedrock:InvokeModel`;
- resource Bedrock chi gom Cohere multilingual v3 va Nova Lite;
- public NestJS Lambda, indexing worker va backfill task khong co Bedrock
  permission;
- publisher chi co `sqs:SendMessage` toi IndexingQueue va worker chi poll source queue;
- khong co public alias-switch endpoint.

## 13. Smoke test sau deploy

### 13.1 Public API

Lay `PublicApiUrl` tu stack outputs va kiem tra health cua NestJS:

```bash
export PUBLIC_API_URL=<public-api-url>

curl --fail-with-body \
  --silent \
  --show-error \
  "$PUBLIC_API_URL/api/v1/health"
```

Kiem tra them auth flow tren domain staging:

- `GET /api/v1/auth/google` redirect dung callback;
- login email/password thanh cong;
- refresh page van khoi phuc session;
- cookie co `HttpOnly`, `Secure` va `SameSite` dung chinh sach;
- callback URL trung chinh xac voi Google Cloud Console.

### 13.2 AI API authentication boundary

AI Gateway chi expose nam POST route noi bo. Khong ky vong
`/health/live` hoac `/health/ready` co the truy cap qua API Gateway.

Kiem tra request khong co service JWT bi tu choi:

```bash
export AI_API_URL=<ai-api-url>

curl --include \
  --request POST \
  --header 'content-type: application/json' \
  --data '{}' \
  "$AI_API_URL/internal/v1/index/points/scan"
```

Ket qua mong doi la `401` hoac `403`, khong phai `2xx`. Khong expose AI API
truc tiep cho frontend va khong chuyen public user JWT vao request nay.

Phase 3 retrieval van la synchronous va chi dung
`/internal/v1/rag/retrieve`; `/rag/generate` danh cho Phase 4 va khong duoc
dung de bypass retrieval-only scope.

### 13.3 Scheduled outbox publisher va UUID-only worker

Publisher la NestJS Lambda theo Schedule `rate(1 minute)` va chi publish payload
`{"outboxId":"<uuid>"}` tu PostgreSQL `ai_index_outbox` sang SQS standard
queue. Schedule mac dinh tat (`IndexingPublisherScheduleEnabled=false`) de rollout
va smoke test co kiem soat. Publisher khong hydrate job, goi FastAPI/Qdrant, hay
thay doi business status; SQS consumer hien co van hydrate canonical data va chi
acknowledge sau khi outbox durable `SUCCEEDED` hoac `DEAD_LETTER`.

Khong gui job content, CV, prompt, provider response hoac aggregate snapshot vao
SQS. Database staging rieng la bat buoc do outbox chua co cot environment.

#### 13.3.1 Preflight va manual publisher smoke test

Chi chay sau khi migration co `published_at` da ap dung, publisher implementation
da duoc review, va VPC egress toi SQS da duoc xac nhan. Trong maintenance host/CI
runner co DB access va credentials SQS da duoc cap qua co che duoc phe duyet, dat
cac environment variables bang placeholder/secret injection ngoai repository, roi
chay dung mot batch 10 record:

```bash
cd backend

export AI_INDEX_ENVIRONMENT=staging
export AI_INDEX_OUTBOX_ENVIRONMENT=staging
export AI_INDEX_QUEUE_URL=<indexing-queue-url>
export AI_INDEX_PUBLISHER_ID=<approved-staging-publisher-id>
export AI_INDEX_PUBLISH_LEASE_MS=120000

npm run ai-index -- publish --environment staging --batch-size 10
```

`publish` va Lambda handler `dist/lambda-outbox-publisher.handler` la template-
dependent cho den khi implementation image da duoc merge/build; neu image/CLI
chua co, dung tai day, giu schedule tat, va khong thay bang AWS CLI nhu mot
rollout publisher. Ten lease tren implementation va template phai la
`AI_INDEX_PUBLISH_LEASE_MS` truoc khi enable schedule.

Kiem tra chi doc record da duoc publisher claim va publish; `published_at` khong
dong nghia indexing da thanh cong:

```sql
SELECT
  _id,
  status,
  published_at,
  publish_attempts,
  publish_next_retry_at,
  last_publish_error_code,
  processed_at
FROM ai_index_outbox
WHERE _id = <outbox-id>;
```

Khong dump `last_publish_error_message` neu co the chua du lieu nhay cam. Ky vong
`published_at` duoc set sau SQS send thanh cong, sau do consumer tien toi
`SUCCEEDED` hoac `DEAD_LETTER`. Theo doi publisher log, worker log, queue depth
va DLQ; duplicate notification sau ket qua transport mo ho phai duoc consumer xu
ly idempotent.

#### 13.3.2 Enable schedule sau smoke test

Sau khi manual publish, `published_at`, consumer processing, va SQS VPC egress deu
pass, enable Schedule bang CloudFormation change set (khong sua trigger thu cong):

```bash
export INDEXING_PUBLISHER_SCHEDULE_ENABLED=true

sam deploy \
  --template-file infra/sam/template.yaml \
  --stack-name "$STACK_NAME" \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE" \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    DeployWorkloads=true \
    IndexingPublisherScheduleEnabled="$INDEXING_PUBLISHER_SCHEDULE_ENABLED" \
    BackendLambdaImageUri="$BACKEND_IMAGE_URI" \
    AiLambdaImageUri="$AI_IMAGE_URI" \
    BackfillImageUri="$BACKFILL_IMAGE_URI" \
    "${COMMON_PARAMETERS[@]}"
```

Xac nhan Schedule da enabled va theo doi it nhat mot lan chay khong loi. Khong
enable neu migration, handler, CLI, IAM `sqs:SendMessage`, hoac SQS egress chua
pass.

### 13.4 CloudWatch logs va queue metrics

Theo doi cac log group do stack tao:

```bash
aws logs tail "/aws/lambda/${STACK_NAME}-public-api" \
  --since 15m \
  --follow \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE"

aws logs tail "/aws/lambda/${STACK_NAME}-ai-api" \
  --since 15m \
  --follow \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE"

aws logs tail "/aws/lambda/${STACK_NAME}-indexing-worker" \
  --since 15m \
  --follow \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE"

aws logs tail "/aws/lambda/${STACK_NAME}-indexing-publisher" \
  --since 15m \
  --follow \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE"
```

Publisher log group la `/aws/lambda/${STACK_NAME}-indexing-publisher`. Kiem tra
log nay khi manual smoke test, sau lan schedule dau tien, va khi co retry/publish
failure; khong log queue URL, raw CV, token, private key, prompt day du hoac
provider response day du.

Kiem tra queue va DLQ:

```bash
aws sqs get-queue-attributes \
  --queue-url "$INDEXING_QUEUE_URL" \
  --attribute-names ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE"
```

Log khong duoc chua raw CV, token, private key, prompt day du hoac provider
response day du.

## 14. Kiem tra retry va DLQ

Source queue co:

- batch size toi da 10;
- partial batch response `ReportBatchItemFailures`;
- maximum concurrency 5;
- visibility timeout 1800 giay;
- `maxReceiveCount=5` truoc khi chuyen sang DLQ.

Vi visibility timeout dang dai, malformed-message test co the mat nhieu thoi
gian truoc khi vao DLQ. Chi chay tren disposable staging queue hoac lap ke
hoach maintenance window; khong purge queue production de rut ngan test.

Gui mot message malformed co kiem soat neu can kiem tra partial failure:

```bash
aws sqs send-message \
  --queue-url "$INDEXING_QUEUE_URL" \
  --message-body '{"unexpected":"field"}' \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE"
```

Expected behavior:

- worker khong goi dispatcher voi payload invalid;
- Lambda tra `batchItemFailures` cho message do;
- message duoc retry;
- sau lan nhan toi da, message vao `IndexingDeadLetterQueue`.

Kiem tra DLQ bang output `IndexingDeadLetterQueueUrl`:

```bash
export INDEXING_DLQ_URL=<indexing-dlq-url>

aws sqs get-queue-attributes \
  --queue-url "$INDEXING_DLQ_URL" \
  --attribute-names ApproximateNumberOfMessages \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE"
```

Khong coi malformed message la thanh cong cua indexing. DLQ can duoc triage,
ghi ly do va replay co kiem soat sau khi sua nguyen nhan.

## 15. Chay bounded Fargate backfill

Stack chi tao task definition; operator phai chay one-off task trong ECS cluster
co san. Lay task definition ARN tu output `BackfillTaskDefinitionArn`.

Fargate task dung `awsvpc`, private subnet va security group da preflight.
Task execution role can ECR, CloudWatch Logs va Secrets Manager; task role
khong co Bedrock/Qdrant permission.

### 15.1 Dry run

Dry run can duoc chay truoc real run de kiem tra network, secret injection va
quyen truy cap database. Khong dung `--dry-run` cho cac command khac.

```bash
export ECS_CLUSTER=<existing-ecs-cluster>
export BACKFILL_TASK_DEFINITION_ARN=<backfill-task-definition-arn>
export ECS_SUBNETS=<subnet-id-1>,<subnet-id-2>
export ECS_SECURITY_GROUP=<security-group-id>

export DRY_RUN_TASK_ARN=$(aws ecs run-task \
  --cluster "$ECS_CLUSTER" \
  --task-definition "$BACKFILL_TASK_DEFINITION_ARN" \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$ECS_SUBNETS],securityGroups=[$ECS_SECURITY_GROUP],assignPublicIp=DISABLED}" \
  --overrides '{"containerOverrides":[{"name":"index-backfill","command":["node","dist/tasks/ai-index-backfill.task.js","--environment","staging","--max-operations","1000","--dry-run"]}]}' \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE" \
  --query 'tasks[0].taskArn' \
  --output text)

aws ecs wait tasks-stopped \
  --cluster "$ECS_CLUSTER" \
  --tasks "$DRY_RUN_TASK_ARN" \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE"

aws ecs describe-tasks \
  --cluster "$ECS_CLUSTER" \
  --tasks "$DRY_RUN_TASK_ARN" \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE" \
  --query 'tasks[0].{lastStatus:lastStatus,stopCode:stopCode,stoppedReason:stoppedReason,containers:containers[*].{exitCode:exitCode,reason:reason}}'

aws logs tail "/ecs/${STACK_NAME}-index-backfill" \
  --since 30m \
  --follow \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE"
```

Dry run khong tao outbox. Ket qua JSON duoc sanitize va chi gom counters, cursor,
`nextCursor`, `hasMore` va budget status.

### 15.2 Backfill co ghi outbox

Chi chay sau khi dry run da duoc review. Luon giu `--max-operations` bounded;
ung dung tu choi gia tri lon hon 100,000. Bat dau bang 1,000 hoac muc duoc
phe duyet:

```bash
export BACKFILL_TASK_ARN=$(aws ecs run-task \
  --cluster "$ECS_CLUSTER" \
  --task-definition "$BACKFILL_TASK_DEFINITION_ARN" \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$ECS_SUBNETS],securityGroups=[$ECS_SECURITY_GROUP],assignPublicIp=DISABLED}" \
  --overrides '{"containerOverrides":[{"name":"index-backfill","command":["node","dist/tasks/ai-index-backfill.task.js","--environment","staging","--max-operations","1000"]}]}' \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE" \
  --query 'tasks[0].taskArn' \
  --output text)

aws ecs wait tasks-stopped \
  --cluster "$ECS_CLUSTER" \
  --tasks "$BACKFILL_TASK_ARN" \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE"

aws ecs describe-tasks \
  --cluster "$ECS_CLUSTER" \
  --tasks "$BACKFILL_TASK_ARN" \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE" \
  --query 'tasks[0].{lastStatus:lastStatus,stopCode:stopCode,stoppedReason:stoppedReason,containers:containers[*].{exitCode:exitCode,reason:reason}}'
```

Task nay chi ghi transactional outbox. No khong goi truc tiep FastAPI/Qdrant va
khong tu dong gui SQS. Sau task:

1. Luu `nextCursor` va `hasMore` tu log ket qua.
2. Neu `hasMore=true`, chay page tiep theo voi `--cursor <nextCursor>` trong
   mot task bounded moi.
3. Dung publisher da duoc review de gui tung `{"outboxId":"<uuid>"}` vao SQS.
4. Theo doi outbox `SUCCEEDED`, `FAILED`, `DEAD_LETTER` va queue depth.

Khong tu dong lap lai task neu khong biet task truoc da commit transaction hay
chua. Backfill co idempotency/coalescing, nhung cursor can duoc operator ghi lai
chinh xac.

## 16. Reconciliation va provider evaluation

Chay reconciliation tren PostgreSQL va Qdrant staging tu maintenance host hoac
one-off ECS task co cung configuration:

```bash
cd backend

npm run ai-index -- reconcile \
  --environment staging \
  --limit 100

npm run ai-index -- reconcile-qdrant \
  --environment staging \
  --limit 100
```

Neu ket qua co cursor, tiep tuc voi `--cursor` va `--scan-run-id` theo output cua
lan truoc. Khong dung local vectors de lam evidence cho staging provider parity.

Provider-parity evaluation phai:

- index lai gold/synthetic corpus bang Bedrock Cohere staging;
- ghi vao physical Qdrant staging collection da preflight;
- kiem tra manifest va collection version;
- co query count khong rong;
- recall nam trong `[0,1]` va dat nguong toi thieu `0.85`;
- pass filter, lifecycle, duplicate, payload, injection, no-result va
  consistency gates.

Phase 3 retrieval van la synchronous va chi dung
`/internal/v1/rag/retrieve`. Generation qua `/rag/generate` chi duoc bat sau
khi contract va groundedness gate cua Phase 4 da duoc review.

## 17. Qdrant alias cutover

Chi cutover sau khi:

- backfill da hoan tat;
- outbox da drain/reconcile thanh cong;
- physical collection co day du vector va payload index;
- vector size `1024`, distance `Cosine` dung;
- marker payload khop `RepresentationManifest`;
- collection version va index schema da ghi evidence;
- current alias mapping da duoc ghi lai;
- provider evaluation dat tat ca release gates.

Thuc hien switch theo `docs/QDRANT_ALIAS_CUTOVER.md`. Khong tao public endpoint,
khong goi alias manager tu startup/readiness/indexing path va khong retry readback
bang mapping doan.

Neu can rollback, day la mot operator decision rieng:

- xac nhan mapping hien tai tu Qdrant;
- validate previous physical collection va marker;
- cung cap `expected_current_collection` moi nhat;
- chay rollback atomic;
- ghi lai manifest digest va readback.

## 18. Rollback ung dung va incident handling

### 18.1 Rollback Lambda image

Luong rollback su dung image digest truoc do, khong dung mutable tag:

```bash
sam deploy \
  --template-file infra/sam/template.yaml \
  --stack-name "$STACK_NAME" \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE" \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    DeployWorkloads=true \
    IndexingPublisherScheduleEnabled=false \
    BackendLambdaImageUri=<previous-backend-repository>@sha256:<previous-digest> \
    AiLambdaImageUri=<previous-ai-repository>@sha256:<previous-digest> \
    BackfillImageUri=<previous-backfill-repository>@sha256:<previous-digest> \
    "${COMMON_PARAMETERS[@]}"
```

Giu publisher schedule tat trong rollback de ngan publish moi bang image dang
rollback; chi enable lai bang CloudFormation change set sau khi image, manual
publisher smoke test, publisher log group va SQS egress da duoc xac minh. Giu
nguyen PostgreSQL va outbox trong khi rollback image. Khong dung
`DB_SYNCHRONIZE=true` de rollback schema. Database schema rollback phai theo
runbook migration da review.

### 18.2 Dung indexing tam thoi

1. Disable publisher schedule bang CloudFormation change set voi
   `IndexingPublisherScheduleEnabled=false`; khong sua trigger thu cong.
2. Dung producer gui message moi.
3. Lay event source mapping UUID va disable mapping.
4. Khong purge source queue hoac DLQ.
5. Giu outbox state va error codes de triage.
6. Sua nguyen nhan, test mot record staging, review publisher log group va enable
   lai schedule/mapping bang CloudFormation sau khi du dieu kien.

Lay mapping UUID:

```bash
aws lambda list-event-source-mappings \
  --function-name "${STACK_NAME}-indexing-worker" \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE" \
  --query 'EventSourceMappings[*].[UUID,State,EventSourceArn]' \
  --output table
```

Disable/re-enable mapping bang UUID da xac nhan:

```bash
export EVENT_SOURCE_MAPPING_UUID=<event-source-mapping-uuid>

aws lambda update-event-source-mapping \
  --uuid "$EVENT_SOURCE_MAPPING_UUID" \
  --no-enabled \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE"

aws lambda update-event-source-mapping \
  --uuid "$EVENT_SOURCE_MAPPING_UUID" \
  --enabled \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE"
```

Khong danh dau outbox `SUCCEEDED` thu cong khi provider write chua duoc
acknowledge. Khong xoa Qdrant physical collection dang duoc alias neu chua co
quyet dinh operator.

## 19. Checklist hoan tat

- [ ] AWS account/Region dung va duoc phe duyet.
- [ ] Private subnets, security groups, DNS, DB route va HTTPS egress da test.
- [ ] PostgreSQL staging rieng, baseline schema va backup da san sang.
- [ ] Migration chay voi `DB_SYNCHRONIZE=false` va ket qua da review.
- [ ] Backend secret va AI secret co du key, khong lo gia tri.
- [ ] RSA public/private key, issuer, audience va key ID khop nhau.
- [ ] Bedrock Cohere/Nova Lite access da cap va smoke test.
- [ ] Qdrant staging collection da preflight voi 1024/Cosine.
- [ ] Marker, payload indexes, alias va collection version da xac minh.
- [ ] SAM validate/lint/build pass.
- [ ] Backend Lambda image dung `public.ecr.aws/lambda/nodejs:22` cho build va runtime.
- [ ] AI Lambda image da push bang digest.
- [ ] ECS-compatible backfill image da ton tai va da push bang digest.
- [ ] Bootstrap `DeployWorkloads=false` da review.
- [ ] Workload deploy `DeployWorkloads=true` da review.
- [ ] Public API health/auth smoke test pass.
- [ ] AI API khong co token bi tu choi.
- [ ] Mot indexing record duoc durable finalize.
- [ ] Queue, worker logs, publisher log group va DLQ metrics da duoc quan sat.
- [ ] Publisher manual smoke test dung `AI_INDEX_PUBLISH_LEASE_MS`; schedule chi
      enable sau smoke test va co change set rollback ve `false`.
- [ ] Backfill dry run da review truoc real run.
- [ ] Outbox publisher ID-only da duoc implement truoc production.
- [ ] Reconciliation va provider-parity release gates pass.
- [ ] Alias cutover/rollback evidence da duoc operator ghi lai.
- [ ] Previous image digests, stack outputs va incident rollback steps da duoc
      luu trong he thong quan ly thay doi.

## 20. Tai lieu lien quan

- `infra/sam/template.yaml`: SAM/CloudFormation resources va parameters.
- `infra/sam/README.md`: topology, image digest rule va gioi han stack.
- `backend/DEPLOYMENT.md`: NestJS Lambda deployment notes.
- `docs/MIGRATION_DATABASE.md`: TypeORM migration safety/runbook.
- `docs/QDRANT_ALIAS_CUTOVER.md`: operator-only alias switch/rollback.
- `backend/src/lambda-sqs.ts`: SQS payload, retry va partial batch behavior.
- `backend/src/tasks/ai-index-backfill.task.ts`: bounded backfill command.
