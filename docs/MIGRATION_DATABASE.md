# Huong dan migration database

Tai lieu nay huong dan chay TypeORM migration cho backend TalentPulse.

## 1. Nguyen tac an toan

- PostgreSQL la database canonical cua ung dung.
- Production khong duoc dung `DB_SYNCHRONIZE=true`.
- Moi thay doi schema phai duoc tao thanh migration, review va chay bang TypeORM CLI.
- Khong sua truc tiep database production bang SQL thu cong tru khi co runbook va backup da duoc review.
- Khong commit `backend/.env`, password, API key hoac secret vao repository.
- Migration chi duoc chay sau khi da backup database trong moi truong staging/production.

## 2. Yeu cau

Can co:

- Node.js phu hop voi backend.
- npm.
- Docker Desktop neu chay PostgreSQL local bang Compose.
- Ket noi toi PostgreSQL can migrate.

Kiem tra thu muc backend:

```powershell
cd E:\Projects\talentpulse\backend
```

## 3. Khoi dong PostgreSQL local

Tu thu muc goc repository:

```powershell
docker compose -f backend/environment/docker-compose.yml up -d postgres
```

Kiem tra container:

```powershell
docker compose -f backend/environment/docker-compose.yml ps postgres
```

Thong tin PostgreSQL local theo Compose hien tai:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres123
DB_DATABASE=recruitment_db
```

Neu container chua san sang, xem log:

```powershell
docker compose -f backend/environment/docker-compose.yml logs postgres
```

## 4. Cau hinh backend/.env

Neu chua co file local:

```powershell
Copy-Item backend/.env.example backend/.env
```

Khi chay migration local, dam bao co cac bien sau:

```env
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres123
DB_DATABASE=recruitment_db
DB_SYNCHRONIZE=false
```

`DB_SYNCHRONIZE=false` duoc khuyen nghi khi test migration. Backend local van co the dung gia tri mac dinh `true` de tuong thich, nhung khong dung cach nay de thay the migration trong production.

## 5. Cai dependency

Migration CLI can `ts-node`, `tsconfig-paths`, TypeScript va cac dev dependency khac. Cai day du dependency:

```powershell
cd backend
npm ci --include=dev
```

Khong chay lenh sau truoc migration:

```powershell
npm ci --omit=dev
```

Lenh nay loai cac package can cho TypeORM CLI va TypeScript.

## 6. Kiem tra migration

Chay:

```powershell
npm run migration:show
```

Ket qua co dang:

```text
[ ] Phase0Prerequisites20260826160000
[ ] JobDatesUtc20260826160050
[ ] ActiveJobLegacyReport20260826160100
[ ] AiConsentScopeConstraints20260826160200
[ ] CvParseContentVersion20260826160300
```

Y nghia:

- `[ ]`: migration chua duoc ap dung.
- `[X]`: migration da duoc ap dung.

Migration CLI dung DataSource tai:

```text
backend/src/database/data-source.ts
```

DataSource nay:

- Tu dong load entity va migration.
- Ep session PostgreSQL dung timezone UTC.
- Luon dat `synchronize=false` cho migration CLI.

## 7. Chay migration

Sau khi da kiem tra danh sach migration:

```powershell
npm run migration:run
```

Sau khi chay xong, kiem tra lai:

```powershell
npm run migration:show
```

Kiem tra lich su migration bang PostgreSQL neu can:

```sql
SELECT *
FROM typeorm_migrations
ORDER BY id;
```

## 8. Cac migration Phase 0 hien tai

Thu tu migration hien tai la:

1. `Phase0Prerequisites20260826160000`
   - Them cac cot soft-delete/date can thiet.
   - Them parse status, content hash, parsed time va parse error cho `user_cvs`.
   - Tao bang `ai_cv_consents` va `ai_cv_consent_events`.
2. `JobDatesUtc20260826160050`
   - Chuyen `jobs.startDate` va `jobs.endDate` sang `TIMESTAMPTZ` theo UTC.
3. `ActiveJobLegacyReport20260826160100`
   - Tao bao cao/quarantine cho job legacy khong du dieu kien active.
4. `AiConsentScopeConstraints20260826160200`
   - Bo sung constraint/index cho consent scope va policy.
5. `CvParseContentVersion20260826160300`
   - Them `user_cvs.contentVersion` de ngan parse job cu ghi de noi dung moi.

Khong tu y doi ten hoac doi thu tu migration da duoc chay tren moi truong chia se.

## 9. Database moi hoan toan

Migration Phase 0 la migration bo sung, khong phai initial schema migration. Cac bang nen tang sau day phai ton tai truoc:

```text
users
jobs
companies
user_cvs
```

Neu database moi hoan toan va chua co schema ban dau, `migration:run` co the loi voi thong bao nhu:

```text
relation "users" does not exist
relation "jobs" does not exist
relation "companies" does not exist
relation "user_cvs" does not exist
```

Khong sua loi bang cach bat `DB_SYNCHRONIZE=true` tren production.

Voi local development, co the khoi tao schema theo workflow hien tai:

1. Dat `DB_SYNCHRONIZE=true` trong local `.env`.
2. Khoi dong backend mot lan de TypeORM tao schema co ban.
3. Dung backend.
4. Dat lai `DB_SYNCHRONIZE=false`.
5. Chay `npm run migration:run`.

Voi production, can co initial schema/baseline migration duoc review truoc khi chay migration Phase 0.

## 10. Tao migration moi

Sau khi sua entity, khong tao migration bang cach sua tay cac migration cu da chay. Chay:

```powershell
npm run migration:generate -- src/database/migrations/DescriptiveName
```

Vi du:

```powershell
npm run migration:generate -- src/database/migrations/AddJobWorkMode
```

Quy trinh bat buoc:

1. Sua entity/DTO/service.
2. Chay migration generate trong moi truong co schema dung.
3. Doc file migration duoc tao.
4. Kiem tra cac lenh `up()` va `down()`.
5. Kiem tra migration khong drop column/table ngoai y muon.
6. Chay tren database disposable hoac staging.
7. Chay test/build.
8. Commit entity va migration cung mot thay doi logic.

Migration khong duoc chua:

- Password hoac secret.
- Du lieu CV raw.
- Du lieu seed production khong duoc phe duyet.
- SQL duoc noi chuoi tu input user/model.

## 11. Revert migration

Chi revert migration gan nhat va chi sau khi rollback da duoc review:

```powershell
npm run migration:revert
```

Truoc khi revert production:

1. Tao backup database.
2. Xac nhan migration gan nhat bang `migration:show`.
3. Doc ky method `down()`.
4. Kiem tra co nguy co mat data hay khong.
5. Chay thu tren staging.
6. Thong bao maintenance window neu can.

Khong dung `migration:revert` de sua migration da chay roi viet lai migration cu. Neu can sua schema moi, tao migration moi.

## 12. Production workflow

Trong production, dat:

```env
NODE_ENV=production
DB_HOST=<production-db-host>
DB_PORT=5432
DB_USERNAME=<production-db-user>
DB_PASSWORD=<production-db-password>
DB_DATABASE=<production-db-name>
DB_SYNCHRONIZE=false
```

Quy trinh de xuat:

```powershell
cd backend
npm ci --include=dev
npm run migration:show
npm run migration:run
npm run migration:show
npm run build
```

Neu database nam trong private subnet, lenh migration phai chay tu:

- Bastion/maintenance host co network access.
- CI runner nam trong VPC.
- ECS task/one-off migration task.

Khong dua password production vao command line neu khong can. Uu tien:

- AWS Secrets Manager.
- GitHub Actions Secrets.
- CI/CD secret store.
- Environment injection cua deployment platform.

## 13. Kiem tra sau migration

Kiem tra bang:

```sql
\dt
\d user_cvs
\d ai_cv_consents
\d ai_cv_consent_events
```

Kiem tra cac cot quan trong:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'user_cvs'
  AND column_name IN (
    'parseStatus',
    'contentHash',
    'parsedAt',
    'parseErrorCode',
    'contentVersion'
  )
ORDER BY column_name;
```

Kiem tra migration khong con pending:

```powershell
npm run migration:show
```

Kiem tra ung dung:

```powershell
npm run build
npm test -- --runInBand
```

## 14. Troubleshooting

### Khong ket noi duoc PostgreSQL

Kiem tra:

- PostgreSQL container co dang chay khong.
- `DB_HOST`, `DB_PORT`, user, password va database co dung khong.
- Port `5432` co bi process khac chiem khong.
- Security group/network route neu la production.

Xem log local:

```powershell
docker compose -f backend/environment/docker-compose.yml logs postgres
```

### `Cannot find module 'ts-node'` hoac `typeorm/cli.js`

Cai lai day du dependency:

```powershell
npm ci --include=dev
```

### `Cannot find module 'src/...'`

Su dung npm scripts da co san, vi cac script nay da preload:

```text
ts-node/register
tsconfig-paths/register
```

Khong goi TypeORM CLI truc tiep neu khong preload cac module tren.

### `relation does not exist`

Database chua co initial schema. Kiem tra muc Database moi hoan toan va tao baseline schema truoc khi chay Phase 0 migrations.

### Migration da chay mot phan

TypeORM migration duoc chay trong transaction neu migration/database driver ho tro. Khong tu y xoa dong trong `typeorm_migrations`. Kiem tra:

```powershell
npm run migration:show
```

Sau do xem log database va migration `up()` de xac dinh buoc that bai. Chi retry sau khi da xac nhan migration idempotent/an toan.

### `DB_SYNCHRONIZE` tu dong thay doi schema

Kiem tra:

```env
DB_SYNCHRONIZE=false
```

Va dam bao production khong chay process voi `.env` local.

## 15. Checklist truoc production

- [ ] Da backup database.
- [ ] Da chay migration tren staging.
- [ ] `DB_SYNCHRONIZE=false`.
- [ ] `npm run migration:show` da duoc review.
- [ ] Khong con migration pending ngoai nhung migration da duoc phe duyet.
- [ ] Build backend pass.
- [ ] Test backend pass.
- [ ] Migration `down()` da duoc review.
- [ ] Database connection/SSL/network da duoc kiem tra.
- [ ] Khong co `.env` hoac secret trong commit/deployment artifact.
- [ ] Co runbook rollback va nguoi phu trach migration.
