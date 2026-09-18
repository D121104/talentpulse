import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPremiumPackagesAndUserColumns20260918020000
  implements MigrationInterface
{
  name = 'AddPremiumPackagesAndUserColumns20260918020000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // 1. Create Enums if not exists
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "premium_packages_plan_type_enum" AS ENUM ('FREE', 'CANDIDATE_PREMIUM', 'HR_PREMIUM');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "premium_packages_billing_cycle_enum" AS ENUM ('monthly', 'semi_annual', 'annual');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // 2. Create table premium_packages
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "premium_packages" (
        "_id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "code" character varying(100) NOT NULL,
        "plan_type" "premium_packages_plan_type_enum" NOT NULL,
        "billing_cycle" "premium_packages_billing_cycle_enum" NOT NULL,
        "name" character varying(255) NOT NULL,
        "description" text,
        "price" numeric(12, 0) NOT NULL,
        "original_price" numeric(12, 0),
        "duration_days" integer NOT NULL DEFAULT 30,
        "ai_quota" integer NOT NULL DEFAULT 50,
        "badge" character varying(100),
        "features" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "hot_job_limit" integer NOT NULL DEFAULT 0,
        "candidate_search_limit" integer NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "display_order" integer NOT NULL DEFAULT 0,
        "is_deleted" boolean NOT NULL DEFAULT false,
        "createdBy" jsonb,
        "updatedBy" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "UQ_premium_packages_code" UNIQUE ("code")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_premium_packages_plan_billing" 
      ON "premium_packages" ("plan_type", "billing_cycle");
    `);

    // 3. Add columns to users table
    await queryRunner.query(`
      ALTER TABLE "users" 
      ADD COLUMN IF NOT EXISTS "premiumPackageId" character varying;
    `);

    await queryRunner.query(`
      ALTER TABLE "users" 
      ADD COLUMN IF NOT EXISTS "aiQuotaRemaining" integer NOT NULL DEFAULT 0;
    `);

    // 4. Seed default packages if table is empty
    await queryRunner.query(`
      INSERT INTO "premium_packages" (
        "code", "plan_type", "billing_cycle", "name", "description", 
        "price", "original_price", "duration_days", "ai_quota", "badge", 
        "features", "hot_job_limit", "candidate_search_limit", "is_active", "display_order"
      )
      SELECT * FROM (VALUES
        (
          'CANDIDATE_MONTHLY',
          'CANDIDATE_PREMIUM'::"premium_packages_plan_type_enum",
          'monthly'::"premium_packages_billing_cycle_enum",
          'Candidate Premium (1 Tháng)',
          'Bứt phá sự nghiệp & tiếp cận NTD hàng đầu',
          49000::numeric,
          49000::numeric,
          30,
          50,
          NULL,
          '["Không giới hạn tạo và tải CV chất lượng cao", "Đẩy Top hồ sơ 24h mỗi ngày", "Xem danh sách NTD đã ghé thăm hồ sơ", "Huy hiệu Candidate Premium VIP nổi bật", "AI Career Assistant: 50 lượt phân tích/tháng"]'::jsonb,
          0,
          0,
          true,
          1
        ),
        (
          'CANDIDATE_SEMI_ANNUAL',
          'CANDIDATE_PREMIUM'::"premium_packages_plan_type_enum",
          'semi_annual'::"premium_packages_billing_cycle_enum",
          'Candidate Premium (6 Tháng)',
          'Tiết kiệm 15% - Lựa chọn hoàn hảo cho lộ trình đổi việc',
          249000::numeric,
          294000::numeric,
          180,
          200,
          'Tiết kiệm 15%',
          '["Toàn bộ quyền lợi gói Tháng", "Đẩy Top hồ sơ mỗi ngày", "Ưu tiên kết nối với chuyên viên tuyển dụng", "AI Career Assistant: 200 lượt phân tích"]'::jsonb,
          0,
          0,
          true,
          2
        ),
        (
          'CANDIDATE_ANNUAL',
          'CANDIDATE_PREMIUM'::"premium_packages_plan_type_enum",
          'annual'::"premium_packages_billing_cycle_enum",
          'Candidate Premium (1 Năm)',
          'Gói trọn gói 12 tháng - Tiết kiệm 32%',
          399000::numeric,
          588000::numeric,
          365,
          500,
          'Khuyên Dùng - Phổ Biến Nhất',
          '["Toàn bộ quyền lợi gói 6 Tháng", "Đẩy Top hồ sơ 365 ngày", "Tối ưu CV bởi chuyên gia AI", "AI Career Assistant: 500 lượt phân tích"]'::jsonb,
          0,
          0,
          true,
          3
        ),
        (
          'HR_MONTHLY',
          'HR_PREMIUM'::"premium_packages_plan_type_enum",
          'monthly'::"premium_packages_billing_cycle_enum",
          'HR Premium Enterprise (1 Tháng)',
          'Tuyển dụng không giới hạn & AI Sourcing',
          299000::numeric,
          299000::numeric,
          30,
          100,
          NULL,
          '["Đăng tin tuyển dụng không giới hạn", "Gắn nhãn HOT JOB cho 3 vị trí", "Mở khóa tìm kiếm hồ sơ ứng viên nâng cao (50 CV/ngày)", "Huy hiệu Nhà tuyển dụng Uy tín Premium", "AI Matching phân tích độ phù hợp ứng viên"]'::jsonb,
          3,
          50,
          true,
          4
        ),
        (
          'HR_SEMI_ANNUAL',
          'HR_PREMIUM'::"premium_packages_plan_type_enum",
          'semi_annual'::"premium_packages_billing_cycle_enum",
          'HR Premium Enterprise (6 Tháng)',
          'Tiết kiệm 17% chi phí tuyển dụng cho doanh nghiệp',
          1490000::numeric,
          1794000::numeric,
          180,
          500,
          'Tiết kiệm 17%',
          '["Đăng tin tuyển dụng không giới hạn", "Gắn nhãn HOT JOB cho 5 vị trí", "Mở khóa tìm kiếm 100 CV ứng viên/ngày", "Ưu tiên hiển thị tin tuyển dụng đầu trang tìm kiếm", "AI Matching: 500 lượt phân tích"]'::jsonb,
          5,
          100,
          true,
          5
        ),
        (
          'HR_ANNUAL',
          'HR_PREMIUM'::"premium_packages_plan_type_enum",
          'annual'::"premium_packages_billing_cycle_enum",
          'HR Premium Enterprise (1 Năm)',
          'Giải pháp tuyển dụng toàn diện 365 ngày cho doanh nghiệp bứt phá',
          2390000::numeric,
          3588000::numeric,
          365,
          1500,
          'Lựa Chọn Hàng Đầu Của HR Pro',
          '["Đăng tin tuyển dụng không giới hạn 365 ngày", "Gắn nhãn HOT JOB cho 10 vị trí", "Không giới hạn mở khóa tìm kiếm CV ứng viên", "Tài khoản chuyên biệt chăm sóc 24/7", "AI Sourcing & Matching: 1500 lượt phân tích"]'::jsonb,
          10,
          999999,
          true,
          6
        )
      ) AS v (
        code, plan_type, billing_cycle, name, description, 
        price, original_price, duration_days, ai_quota, badge, 
        features, hot_job_limit, candidate_search_limit, is_active, display_order
      )
      WHERE NOT EXISTS (
        SELECT 1 FROM "premium_packages" WHERE "premium_packages"."code" = v.code
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "aiQuotaRemaining";
      ALTER TABLE "users" DROP COLUMN IF EXISTS "premiumPackageId";
      DROP TABLE IF EXISTS "premium_packages";
      DROP TYPE IF EXISTS "premium_packages_billing_cycle_enum";
      DROP TYPE IF EXISTS "premium_packages_plan_type_enum";
    `);
  }
}
