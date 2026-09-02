import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Canonical empty-database baseline. Historical migrations remain in place for
 * deployed databases; this migration lets a new database begin from the final
 * schema those migrations expect and evolve.
 */
export class InitialSchema20260825000000 implements MigrationInterface {
  name = 'InitialSchema20260825000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(
      `CREATE TYPE "users_role_enum" AS ENUM ('ADMIN', 'HR', 'USER')`,
    );
    await queryRunner.query(
      `CREATE TYPE "users_premiumplan_enum" AS ENUM ('FREE', 'CANDIDATE_PREMIUM', 'HR_PREMIUM')`,
    );
    await queryRunner.query(
      `CREATE TYPE "applications_status_enum" AS ENUM ('PENDING', 'REVIEWING', 'CONSIDERING', 'APPROVED', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "candidate_accesses_accesstype_enum" AS ENUM ('ONLINE_CV', 'UPLOADED_CV')`,
    );
    await queryRunner.query(
      `CREATE TYPE "cv_match_results_status_enum" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "notifications_type_enum" AS ENUM ('JOB', 'RESUME', 'COMPANY', 'SYSTEM', 'APPLICATION')`,
    );
    await queryRunner.query(
      `CREATE TYPE "notifications_targettype_enum" AS ENUM ('job', 'company', 'application', 'user', 'none')`,
    );
    await queryRunner.query(
      `CREATE TYPE "online_cvs_templatetype_enum" AS ENUM ('template1', 'template2')`,
    );
    await queryRunner.query(
      `CREATE TYPE "payment_orders_plantype_enum" AS ENUM ('FREE', 'CANDIDATE_PREMIUM', 'HR_PREMIUM')`,
    );
    await queryRunner.query(
      `CREATE TYPE "payment_orders_billing_cycle_enum" AS ENUM ('monthly', 'semi_annual', 'annual')`,
    );
    await queryRunner.query(
      `CREATE TYPE "payment_orders_status_enum" AS ENUM ('PENDING', 'PAID', 'CANCELLED', 'EXPIRED', 'FAILED')`,
    );

    await queryRunner.query(`
      CREATE TABLE "users" (
        "_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "email" varchar NOT NULL,
        "password" varchar NOT NULL,
        "name" varchar,
        "gender" varchar,
        "age" integer,
        "address" varchar,
        "avatar" varchar,
        "role" "users_role_enum" NOT NULL DEFAULT 'USER',
        "isPremium" boolean NOT NULL DEFAULT false,
        "premiumPlan" "users_premiumplan_enum" NOT NULL DEFAULT 'FREE',
        "premiumExpiresAt" TIMESTAMP,
        "isVerified" boolean NOT NULL DEFAULT false,
        "verifiedAt" TIMESTAMP,
        "verificationToken" varchar,
        "lastBoostedAt" TIMESTAMP,
        "boostExpiresAt" TIMESTAMP,
        "isJobSeeking" boolean NOT NULL DEFAULT true,
        "isJobRecommendation" boolean NOT NULL DEFAULT true,
        "allowRecruiterSearch" boolean NOT NULL DEFAULT true,
        "refreshToken" varchar,
        "company" jsonb,
        "isDeleted" boolean NOT NULL DEFAULT false,
        "isLocked" boolean NOT NULL DEFAULT false,
        "lockedAt" TIMESTAMP,
        "lockedReason" varchar,
        "isApproved" boolean NOT NULL DEFAULT true,
        "registrationCompany" jsonb,
        "createdBy" jsonb,
        "updatedBy" jsonb,
        "deletedBy" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        CONSTRAINT "PK_users" PRIMARY KEY ("_id"),
        CONSTRAINT "UQ_users_email" UNIQUE ("email")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "companies" (
        "_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar NOT NULL,
        "description" text,
        "address" varchar,
        "logo" varchar,
        "usersFollow" text[] NOT NULL DEFAULT '{}',
        "taxCode" varchar,
        "scale" varchar,
        "pendingHrs" jsonb NOT NULL DEFAULT '[]',
        "isActive" boolean NOT NULL DEFAULT true,
        "isPremium" boolean NOT NULL DEFAULT false,
        "premiumExpiresAt" TIMESTAMP,
        "isDeleted" boolean NOT NULL DEFAULT false,
        "createdBy" jsonb,
        "updatedBy" jsonb,
        "deletedBy" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        CONSTRAINT "PK_companies" PRIMARY KEY ("_id"),
        CONSTRAINT "UQ_companies_name" UNIQUE ("name")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "jobs" (
        "_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar NOT NULL,
        "description" text,
        "skills" text[] NOT NULL DEFAULT '{}',
        "company" jsonb NOT NULL,
        "salary" numeric,
        "level" varchar,
        "startDate" TIMESTAMPTZ,
        "quantity" integer,
        "location" varchar,
        "endDate" TIMESTAMPTZ,
        "isActive" boolean NOT NULL DEFAULT true,
        "isHot" boolean NOT NULL DEFAULT false,
        "boostedAt" TIMESTAMP,
        "isFeatured" boolean NOT NULL DEFAULT false,
        "isUrgent" boolean NOT NULL DEFAULT false,
        "isDeleted" boolean NOT NULL DEFAULT false,
        "createdBy" jsonb,
        "updatedBy" jsonb,
        "deletedBy" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        CONSTRAINT "PK_jobs" PRIMARY KEY ("_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "skills" (
        "_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar NOT NULL,
        "isDeleted" boolean NOT NULL DEFAULT false,
        "createdBy" jsonb,
        "updatedBy" jsonb,
        "deletedBy" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        CONSTRAINT "PK_skills" PRIMARY KEY ("_id"),
        CONSTRAINT "UQ_skills_name" UNIQUE ("name")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "user_cvs" (
        "_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "url" varchar NOT NULL,
        "title" varchar,
        "description" text,
        "onlineCvId" uuid,
        "fileType" varchar NOT NULL DEFAULT 'pdf',
        "parsedText" text,
        "parseStatus" varchar(20) NOT NULL DEFAULT 'PENDING',
        "contentHash" varchar(64),
        "contentVersion" varchar(64) NOT NULL DEFAULT uuid_generate_v4()::text,
        "parsedAt" TIMESTAMPTZ,
        "parseErrorCode" varchar(80),
        "skills" text[] NOT NULL DEFAULT '{}',
        "education" text[] NOT NULL DEFAULT '{}',
        "experience" text[] NOT NULL DEFAULT '{}',
        "certificates" text[] NOT NULL DEFAULT '{}',
        "isPrimary" boolean NOT NULL DEFAULT false,
        "isSearchable" boolean NOT NULL DEFAULT true,
        "userId" uuid NOT NULL,
        "isDeleted" boolean NOT NULL DEFAULT false,
        "createdBy" jsonb,
        "updatedBy" jsonb,
        "deletedBy" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        CONSTRAINT "PK_user_cvs" PRIMARY KEY ("_id"),
        CONSTRAINT "FK_user_cvs_user" FOREIGN KEY ("userId") REFERENCES "users" ("_id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_user_cvs_parse_status" ON "user_cvs" ("parseStatus") WHERE "isDeleted" = false`,
    );

    await queryRunner.query(`
      CREATE TABLE "online_cvs" (
        "_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "templateType" "online_cvs_templatetype_enum" NOT NULL,
        "title" varchar,
        "fullName" varchar NOT NULL,
        "position" varchar,
        "phone" varchar,
        "email" varchar,
        "link" varchar,
        "address" varchar,
        "avatar" varchar,
        "careerObjective" text,
        "education" jsonb NOT NULL DEFAULT '[]',
        "workExperience" jsonb NOT NULL DEFAULT '[]',
        "skills" jsonb NOT NULL DEFAULT '[]',
        "activities" jsonb NOT NULL DEFAULT '[]',
        "certificates" jsonb NOT NULL DEFAULT '[]',
        "awards" jsonb NOT NULL DEFAULT '[]',
        "sectionOrder" jsonb NOT NULL DEFAULT '["objective", "education", "experience", "skills", "activities", "certificates", "awards"]',
        "fontFamily" varchar,
        "themeColor" varchar,
        "fontSize" varchar,
        "customFormatting" jsonb,
        "htmlContent" text,
        "pdfUrl" varchar,
        "userId" uuid NOT NULL,
        "isSearchable" boolean NOT NULL DEFAULT true,
        "isPrimary" boolean NOT NULL DEFAULT false,
        "isDeleted" boolean NOT NULL DEFAULT false,
        "createdBy" jsonb,
        "updatedBy" jsonb,
        "deletedBy" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        CONSTRAINT "PK_online_cvs" PRIMARY KEY ("_id"),
        CONSTRAINT "FK_online_cvs_user" FOREIGN KEY ("userId") REFERENCES "users" ("_id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "applications" (
        "_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "cvId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "companyId" uuid NOT NULL,
        "jobId" uuid NOT NULL,
        "coverLetter" text,
        "status" "applications_status_enum" NOT NULL DEFAULT 'PENDING',
        "history" jsonb NOT NULL DEFAULT '[]',
        "isDeleted" boolean NOT NULL DEFAULT false,
        "createdBy" jsonb,
        "updatedBy" jsonb,
        "deletedBy" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        CONSTRAINT "PK_applications" PRIMARY KEY ("_id"),
        CONSTRAINT "FK_applications_cv" FOREIGN KEY ("cvId") REFERENCES "user_cvs" ("_id") ON DELETE SET NULL,
        CONSTRAINT "FK_applications_user" FOREIGN KEY ("userId") REFERENCES "users" ("_id") ON DELETE CASCADE,
        CONSTRAINT "FK_applications_company" FOREIGN KEY ("companyId") REFERENCES "companies" ("_id") ON DELETE CASCADE,
        CONSTRAINT "FK_applications_job" FOREIGN KEY ("jobId") REFERENCES "jobs" ("_id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "cv_match_results" (
        "_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "cvId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "jobId" uuid NOT NULL,
        "applicationId" uuid,
        "cvUrl" varchar,
        "cvText" text,
        "cvEmbedding" double precision[] NOT NULL DEFAULT '{}',
        "matchScore" double precision NOT NULL DEFAULT 0,
        "matchedSkills" text[] NOT NULL DEFAULT '{}',
        "missingSkills" text[] NOT NULL DEFAULT '{}',
        "explanation" text,
        "status" "cv_match_results_status_enum" NOT NULL DEFAULT 'PENDING',
        "errorMessage" text,
        "processedAt" TIMESTAMP,
        "isDeleted" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        CONSTRAINT "PK_cv_match_results" PRIMARY KEY ("_id"),
        CONSTRAINT "UQ_cv_match_results_cv_job" UNIQUE ("cvId", "jobId"),
        CONSTRAINT "FK_cv_match_results_cv" FOREIGN KEY ("cvId") REFERENCES "user_cvs" ("_id") ON DELETE CASCADE,
        CONSTRAINT "FK_cv_match_results_user" FOREIGN KEY ("userId") REFERENCES "users" ("_id") ON DELETE CASCADE,
        CONSTRAINT "FK_cv_match_results_job" FOREIGN KEY ("jobId") REFERENCES "jobs" ("_id") ON DELETE CASCADE,
        CONSTRAINT "FK_cv_match_results_application" FOREIGN KEY ("applicationId") REFERENCES "applications" ("_id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_cv_match_results_job_match_score" ON "cv_match_results" ("jobId", "matchScore")`,
    );

    await queryRunner.query(`
      CREATE TABLE "candidate_accesses" (
        "_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "hrUserId" uuid NOT NULL,
        "candidateUserId" uuid NOT NULL,
        "onlineCvId" uuid,
        "userCvId" uuid,
        "accessType" "candidate_accesses_accesstype_enum" NOT NULL DEFAULT 'ONLINE_CV',
        "accessedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_candidate_accesses" PRIMARY KEY ("_id"),
        CONSTRAINT "FK_candidate_accesses_hr_user" FOREIGN KEY ("hrUserId") REFERENCES "users" ("_id") ON DELETE CASCADE,
        CONSTRAINT "FK_candidate_accesses_candidate_user" FOREIGN KEY ("candidateUserId") REFERENCES "users" ("_id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_candidate_accesses_hr_user" ON "candidate_accesses" ("hrUserId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_candidate_accesses_candidate_user" ON "candidate_accesses" ("candidateUserId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_candidate_accesses_accessed_at" ON "candidate_accesses" ("accessedAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_candidate_accesses_hr_candidate_online_cv" ON "candidate_accesses" ("hrUserId", "candidateUserId", "onlineCvId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_candidate_accesses_hr_candidate_user_cv" ON "candidate_accesses" ("hrUserId", "candidateUserId", "userCvId")`,
    );

    await queryRunner.query(`
      CREATE TABLE "comments" (
        "_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "companyId" uuid NOT NULL,
        "content" text NOT NULL,
        "left" integer NOT NULL DEFAULT 0,
        "right" integer NOT NULL DEFAULT 0,
        "parentId" uuid,
        "isDeleted" boolean NOT NULL DEFAULT false,
        "createdBy" jsonb,
        "updatedBy" jsonb,
        "deletedBy" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        CONSTRAINT "PK_comments" PRIMARY KEY ("_id"),
        CONSTRAINT "FK_comments_user" FOREIGN KEY ("userId") REFERENCES "users" ("_id") ON DELETE CASCADE,
        CONSTRAINT "FK_comments_company" FOREIGN KEY ("companyId") REFERENCES "companies" ("_id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "title" varchar NOT NULL,
        "content" text,
        "type" "notifications_type_enum" NOT NULL DEFAULT 'SYSTEM',
        "targetType" "notifications_targettype_enum" NOT NULL DEFAULT 'none',
        "targetId" varchar,
        "data" jsonb,
        "isRead" boolean NOT NULL DEFAULT false,
        "readAt" TIMESTAMP,
        "isDeleted" boolean NOT NULL DEFAULT false,
        "createdBy" jsonb,
        "updatedBy" jsonb,
        "deletedBy" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        CONSTRAINT "PK_notifications" PRIMARY KEY ("_id"),
        CONSTRAINT "FK_notifications_user" FOREIGN KEY ("userId") REFERENCES "users" ("_id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_user_read_created" ON "notifications" ("userId", "isRead", "createdAt")`,
    );

    await queryRunner.query(`
      CREATE TABLE "otps" (
        "_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "email" varchar NOT NULL,
        "token" varchar NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "expiredAt" TIMESTAMP,
        "isDeleted" boolean NOT NULL DEFAULT false,
        "createdBy" jsonb,
        "updatedBy" jsonb,
        "deletedBy" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        CONSTRAINT "PK_otps" PRIMARY KEY ("_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "payment_orders" (
        "_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "order_code" bigint NOT NULL,
        "plan_type" "payment_orders_plantype_enum" NOT NULL,
        "billing_cycle" "payment_orders_billing_cycle_enum" NOT NULL DEFAULT 'annual',
        "duration_days" integer NOT NULL DEFAULT 30,
        "amount" numeric(12, 0) NOT NULL,
        "status" "payment_orders_status_enum" NOT NULL DEFAULT 'PENDING',
        "checkout_url" varchar(500),
        "payment_link_id" varchar(255),
        "description" varchar(255),
        "transaction_reference" varchar(255),
        "counter_account_bank_name" varchar(255),
        "counter_account_name" varchar(255),
        "counter_account_number" varchar(255),
        "paid_at" TIMESTAMP,
        "expires_at" TIMESTAMP NOT NULL,
        "vat_invoice_requested" boolean NOT NULL DEFAULT false,
        "vat_company_name" varchar(255),
        "vat_tax_code" varchar(50),
        "vat_address" varchar(255),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payment_orders" PRIMARY KEY ("_id"),
        CONSTRAINT "UQ_payment_orders_order_code" UNIQUE ("order_code"),
        CONSTRAINT "FK_payment_orders_user" FOREIGN KEY ("user_id") REFERENCES "users" ("_id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_orders_user_id" ON "payment_orders" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_orders_status" ON "payment_orders" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_orders_expires_at" ON "payment_orders" ("expires_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE "subscribers" (
        "_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid,
        "email" varchar NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "lastEmailSentAt" TIMESTAMP,
        "isDeleted" boolean NOT NULL DEFAULT false,
        "createdBy" jsonb,
        "updatedBy" jsonb,
        "deletedBy" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        CONSTRAINT "PK_subscribers" PRIMARY KEY ("_id"),
        CONSTRAINT "UQ_subscribers_email" UNIQUE ("email"),
        CONSTRAINT "FK_subscribers_user" FOREIGN KEY ("userId") REFERENCES "users" ("_id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "subscriber_skills" (
        "subscriber_id" uuid NOT NULL,
        "skill_id" uuid NOT NULL,
        CONSTRAINT "PK_subscriber_skills" PRIMARY KEY ("subscriber_id", "skill_id"),
        CONSTRAINT "FK_subscriber_skills_subscriber" FOREIGN KEY ("subscriber_id") REFERENCES "subscribers" ("_id") ON DELETE CASCADE,
        CONSTRAINT "FK_subscriber_skills_skill" FOREIGN KEY ("skill_id") REFERENCES "skills" ("_id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_subscriber_skills_subscriber" ON "subscriber_skills" ("subscriber_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_subscriber_skills_skill" ON "subscriber_skills" ("skill_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "ai_cv_consents" (
        "_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "scope" varchar(80) NOT NULL,
        "consentVersion" varchar(80) NOT NULL,
        "policyHash" varchar(128) NOT NULL,
        "status" varchar(16) NOT NULL,
        "grantedAt" TIMESTAMP,
        "revokedAt" TIMESTAMP,
        "source" varchar(80) NOT NULL,
        "sourceMetadata" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ai_cv_consents" PRIMARY KEY ("_id"),
        CONSTRAINT "FK_ai_cv_consents_user" FOREIGN KEY ("userId") REFERENCES "users" ("_id") ON DELETE CASCADE,
        CONSTRAINT "CHK_ai_cv_consents_scope" CHECK ("scope" = 'cv_matching')
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_ai_cv_consents_active_scope" ON "ai_cv_consents" ("userId", "scope") WHERE "status" = 'GRANTED'`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_cv_consents_user_scope" ON "ai_cv_consents" ("userId", "scope")`,
    );

    await queryRunner.query(`
      CREATE TABLE "ai_cv_consent_events" (
        "_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "consentId" uuid,
        "scope" varchar(80) NOT NULL,
        "consentVersion" varchar(80) NOT NULL,
        "policyHash" varchar(128) NOT NULL,
        "eventType" varchar(16) NOT NULL,
        "occurredAt" TIMESTAMP NOT NULL DEFAULT now(),
        "source" varchar(80) NOT NULL,
        "sourceMetadata" jsonb,
        CONSTRAINT "PK_ai_cv_consent_events" PRIMARY KEY ("_id"),
        CONSTRAINT "FK_ai_cv_consent_events_user" FOREIGN KEY ("userId") REFERENCES "users" ("_id") ON DELETE CASCADE,
        CONSTRAINT "FK_ai_cv_consent_events_consent" FOREIGN KEY ("consentId") REFERENCES "ai_cv_consents" ("_id") ON DELETE SET NULL,
        CONSTRAINT "CHK_ai_cv_consent_events_scope" CHECK ("scope" = 'cv_matching')
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_cv_consent_events_user_scope" ON "ai_cv_consent_events" ("userId", "scope", "occurredAt")`,
    );

    await queryRunner.query(`
      CREATE TABLE "active_job_legacy_reports" (
        "_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "jobId" uuid NOT NULL,
        "reasonCode" varchar(80) NOT NULL,
        "reportedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_active_job_legacy_reports" PRIMARY KEY ("_id"),
        CONSTRAINT "UQ_active_job_legacy_report" UNIQUE ("jobId", "reasonCode"),
        CONSTRAINT "FK_active_job_legacy_report_job" FOREIGN KEY ("jobId") REFERENCES "jobs" ("_id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE SEQUENCE "ai_index_source_version_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 NO MAXVALUE CACHE 1`,
    );
    await queryRunner.query(`
      CREATE TABLE "ai_index_outbox" (
        "_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "aggregate_type" varchar(24) NOT NULL,
        "aggregate_id" uuid NOT NULL,
        "source_version" bigint NOT NULL DEFAULT nextval('ai_index_source_version_seq'::regclass),
        "operation" varchar(32) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "attempts" integer NOT NULL DEFAULT 0,
        "max_attempts" integer NOT NULL DEFAULT 10,
        "next_retry_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "last_attempt_at" TIMESTAMPTZ,
        "leased_at" TIMESTAMPTZ,
        "lease_expires_at" TIMESTAMPTZ,
        "lease_owner" varchar(128),
        "last_error_code" varchar(80),
        "last_error_message" varchar(1000),
        "last_error_at" TIMESTAMPTZ,
        "processed_at" TIMESTAMPTZ,
        "published_at" TIMESTAMPTZ,
        "publish_attempts" integer NOT NULL DEFAULT 0,
        "publish_next_retry_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "publish_leased_at" TIMESTAMPTZ,
        "publish_lease_expires_at" TIMESTAMPTZ,
        "publish_lease_owner" varchar(128),
        "last_publish_error_code" varchar(80),
        "last_publish_error_message" varchar(1000),
        "last_publish_error_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ai_index_outbox" PRIMARY KEY ("_id"),
        CONSTRAINT "UQ_ai_index_outbox_aggregate_version" UNIQUE ("aggregate_type", "aggregate_id", "source_version"),
        CONSTRAINT "CHK_ai_index_outbox_aggregate_type" CHECK ("aggregate_type" IN ('JOB', 'COMPANY')),
        CONSTRAINT "CHK_ai_index_outbox_source_version" CHECK ("source_version" > 0),
        CONSTRAINT "CHK_ai_index_outbox_operation" CHECK ("operation" IN ('UPSERT', 'DELETE', 'REINDEX_COMPANY')),
        CONSTRAINT "CHK_ai_index_outbox_operation_aggregate" CHECK (("aggregate_type" = 'JOB' AND "operation" IN ('UPSERT', 'DELETE')) OR ("aggregate_type" = 'COMPANY' AND "operation" = 'REINDEX_COMPANY')),
        CONSTRAINT "CHK_ai_index_outbox_status" CHECK ("status" IN ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'DEAD_LETTER', 'CANCELLED')),
        CONSTRAINT "CHK_ai_index_outbox_attempts" CHECK ("attempts" >= 0 AND "max_attempts" BETWEEN 1 AND 100 AND "attempts" <= "max_attempts")
      )
    `);
    await queryRunner.query(
      `ALTER SEQUENCE "ai_index_source_version_seq" OWNED BY "ai_index_outbox"."source_version"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_index_outbox_dispatch" ON "ai_index_outbox" ("status", "next_retry_at", "created_at") WHERE "status" IN ('PENDING', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_index_outbox_lease" ON "ai_index_outbox" ("lease_expires_at") WHERE "status" = 'PROCESSING'`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_index_outbox_aggregate" ON "ai_index_outbox" ("aggregate_type", "aggregate_id", "source_version" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_index_outbox_publish" ON "ai_index_outbox" ("status", "next_retry_at", "publish_next_retry_at", "created_at") WHERE "status" = 'PENDING' AND "published_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_index_outbox_publish_lease" ON "ai_index_outbox" ("publish_lease_expires_at") WHERE "status" = 'PENDING' AND "published_at" IS NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE "ai_job_index_state" (
        "_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "job_id" uuid NOT NULL,
        "environment" varchar(32) NOT NULL,
        "source_version" bigint NOT NULL DEFAULT 0,
        "status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "content_hash" varchar(64),
        "metadata_hash" varchar(64),
        "embedding_provider" varchar(80),
        "embedding_model_version" varchar(256),
        "embedding_dimensions" integer,
        "collection_name" varchar(255),
        "collection_version" varchar(128),
        "index_schema_version" varchar(64),
        "chunking_version" varchar(64),
        "normalization_version" varchar(64),
        "indexed_point_ids" uuid[] NOT NULL DEFAULT '{}'::uuid[],
        "attempts" integer NOT NULL DEFAULT 0,
        "next_retry_at" TIMESTAMPTZ,
        "last_attempt_at" TIMESTAMPTZ,
        "leased_at" TIMESTAMPTZ,
        "lease_expires_at" TIMESTAMPTZ,
        "lease_owner" varchar(128),
        "last_error_code" varchar(80),
        "last_error_message" varchar(1000),
        "last_error_at" TIMESTAMPTZ,
        "indexed_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ai_job_index_state" PRIMARY KEY ("_id"),
        CONSTRAINT "UQ_ai_job_index_state_job_environment" UNIQUE ("job_id", "environment"),
        CONSTRAINT "FK_ai_job_index_state_job" FOREIGN KEY ("job_id") REFERENCES "jobs" ("_id") ON DELETE CASCADE,
        CONSTRAINT "CHK_ai_job_index_state_environment" CHECK (length(btrim("environment")) > 0),
        CONSTRAINT "CHK_ai_job_index_state_source_version" CHECK ("source_version" >= 0),
        CONSTRAINT "CHK_ai_job_index_state_status" CHECK ("status" IN ('PENDING', 'PROCESSING', 'INDEXED', 'DELETED', 'FAILED', 'STALE')),
        CONSTRAINT "CHK_ai_job_index_state_indexed_point_ids" CHECK ("indexed_point_ids" IS NOT NULL),
        CONSTRAINT "CHK_ai_job_index_state_attempts" CHECK ("attempts" >= 0),
        CONSTRAINT "CHK_ai_job_index_state_embedding_dimensions" CHECK ("embedding_dimensions" IS NULL OR "embedding_dimensions" BETWEEN 1 AND 4096)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_job_index_state_environment_status_retry" ON "ai_job_index_state" ("environment", "status", "next_retry_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_job_index_state_lease" ON "ai_job_index_state" ("lease_expires_at") WHERE "status" = 'PROCESSING'`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_job_index_state_environment_collection_model" ON "ai_job_index_state" ("environment", "collection_name", "embedding_model_version")`,
    );

    await queryRunner.query(`
      CREATE TABLE "ai_provider_attempts" (
        "provider_attempt_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "request_id" uuid NOT NULL,
        "trace_id" uuid NOT NULL,
        "operation_attempt_id" uuid,
        "outbox_id" uuid,
        "job_id" uuid,
        "attempt_number" integer NOT NULL DEFAULT 1,
        "provider" varchar(80) NOT NULL,
        "model" varchar(256) NOT NULL,
        "request_sent" boolean NOT NULL DEFAULT false,
        "status" varchar(16) NOT NULL DEFAULT 'STARTED',
        "input_tokens" integer,
        "output_tokens" integer,
        "total_tokens" integer,
        "estimated_cost" numeric(18, 8),
        "error_code" varchar(80),
        "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "completed_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ai_provider_attempts" PRIMARY KEY ("provider_attempt_id"),
        CONSTRAINT "FK_ai_provider_attempts_outbox" FOREIGN KEY ("outbox_id") REFERENCES "ai_index_outbox" ("_id") ON DELETE SET NULL,
        CONSTRAINT "FK_ai_provider_attempts_job" FOREIGN KEY ("job_id") REFERENCES "jobs" ("_id") ON DELETE SET NULL,
        CONSTRAINT "CHK_ai_provider_attempts_number" CHECK ("attempt_number" > 0),
        CONSTRAINT "CHK_ai_provider_attempts_status" CHECK ("status" IN ('STARTED', 'SUCCEEDED', 'FAILED', 'UNKNOWN')),
        CONSTRAINT "CHK_ai_provider_attempts_token_counts" CHECK (("input_tokens" IS NULL OR "input_tokens" >= 0) AND ("output_tokens" IS NULL OR "output_tokens" >= 0) AND ("total_tokens" IS NULL OR "total_tokens" >= 0)),
        CONSTRAINT "CHK_ai_provider_attempts_cost" CHECK ("estimated_cost" IS NULL OR "estimated_cost" >= 0),
        CONSTRAINT "CHK_ai_provider_attempts_completed_at" CHECK ("completed_at" IS NULL OR "completed_at" >= "started_at"),
        CONSTRAINT "CHK_ai_provider_attempts_unknown_request_sent" CHECK ("status" <> 'UNKNOWN' OR "request_sent" = true)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_provider_attempts_request" ON "ai_provider_attempts" ("request_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_provider_attempts_trace" ON "ai_provider_attempts" ("trace_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_provider_attempts_status_created" ON "ai_provider_attempts" ("status", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_provider_attempts_outbox" ON "ai_provider_attempts" ("outbox_id", "created_at") WHERE "outbox_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_provider_attempts_job" ON "ai_provider_attempts" ("job_id", "created_at") WHERE "job_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "ai_provider_attempts"`);
    await queryRunner.query(`DROP TABLE "ai_job_index_state"`);
    await queryRunner.query(`DROP TABLE "ai_index_outbox"`);
    await queryRunner.query(`DROP SEQUENCE "ai_index_source_version_seq"`);
    await queryRunner.query(`DROP TABLE "active_job_legacy_reports"`);
    await queryRunner.query(`DROP TABLE "ai_cv_consent_events"`);
    await queryRunner.query(`DROP TABLE "ai_cv_consents"`);
    await queryRunner.query(`DROP TABLE "subscriber_skills"`);
    await queryRunner.query(`DROP TABLE "subscribers"`);
    await queryRunner.query(`DROP TABLE "payment_orders"`);
    await queryRunner.query(`DROP TABLE "otps"`);
    await queryRunner.query(`DROP TABLE "notifications"`);
    await queryRunner.query(`DROP TABLE "comments"`);
    await queryRunner.query(`DROP TABLE "candidate_accesses"`);
    await queryRunner.query(`DROP TABLE "cv_match_results"`);
    await queryRunner.query(`DROP TABLE "applications"`);
    await queryRunner.query(`DROP TABLE "online_cvs"`);
    await queryRunner.query(`DROP TABLE "user_cvs"`);
    await queryRunner.query(`DROP TABLE "skills"`);
    await queryRunner.query(`DROP TABLE "jobs"`);
    await queryRunner.query(`DROP TABLE "companies"`);
    await queryRunner.query(`DROP TABLE "users"`);

    await queryRunner.query(`DROP TYPE "payment_orders_status_enum"`);
    await queryRunner.query(`DROP TYPE "payment_orders_billing_cycle_enum"`);
    await queryRunner.query(`DROP TYPE "payment_orders_plantype_enum"`);
    await queryRunner.query(`DROP TYPE "online_cvs_templatetype_enum"`);
    await queryRunner.query(`DROP TYPE "notifications_targettype_enum"`);
    await queryRunner.query(`DROP TYPE "notifications_type_enum"`);
    await queryRunner.query(`DROP TYPE "cv_match_results_status_enum"`);
    await queryRunner.query(`DROP TYPE "candidate_accesses_accesstype_enum"`);
    await queryRunner.query(`DROP TYPE "applications_status_enum"`);
    await queryRunner.query(`DROP TYPE "users_premiumplan_enum"`);
    await queryRunner.query(`DROP TYPE "users_role_enum"`);
  }
}
