import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConfigureChatbotPackageLimits20261102070000
  implements MigrationInterface
{
  name = 'ConfigureChatbotPackageLimits20261102070000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "premium_packages" ADD COLUMN "chatbot_daily_limit" integer;
      ALTER TABLE "premium_packages" ADD CONSTRAINT "CHK_package_chatbot_daily_limit" CHECK ("chatbot_daily_limit" IS NULL OR "chatbot_daily_limit" >= 0);
      UPDATE "premium_packages" SET "chatbot_daily_limit" = 0 WHERE "plan_type" = 'HR_PREMIUM';
      INSERT INTO "premium_packages" ("code", "plan_type", "billing_cycle", "name", "price", "duration_days", "chatbot_daily_limit")
      VALUES ('FREE_DEFAULT', 'FREE', 'monthly', 'Free', 0, 30, 10)
      ON CONFLICT ("code") DO NOTHING;
      ALTER TABLE "payment_orders" ADD COLUMN "package_id" uuid REFERENCES "premium_packages"("_id");
      ALTER TABLE "premium_packages" DROP COLUMN "ai_quota";
      ALTER TABLE "users" DROP COLUMN "aiQuotaRemaining";`);
    // Only exact shipped feature strings are changed; custom package copy is preserved.
    await queryRunner.query(`UPDATE "premium_packages" p SET "features" = (
      SELECT jsonb_agg(CASE
        WHEN f.value #>> '{}' IN ('AI Career Assistant: 50 lượt phân tích/tháng', 'AI Career Assistant: 200 lượt phân tích', 'AI Career Assistant: 500 lượt phân tích', 'AI Career Assistant: chat không giới hạn trong thời hạn Premium')
          AND p."code" IN ('CANDIDATE_MONTHLY', 'CANDIDATE_SEMI_ANNUAL', 'CANDIDATE_ANNUAL')
          THEN to_jsonb('AI Career Assistant theo hạn mức của gói'::text)
        WHEN f.value #>> '{}' = 'AI Matching: 500 lượt phân tích' AND p."code" = 'HR_SEMI_ANNUAL'
          THEN to_jsonb('AI Matching phân tích độ phù hợp ứng viên'::text)
        WHEN f.value #>> '{}' = 'AI Sourcing & Matching: 1500 lượt phân tích' AND p."code" = 'HR_ANNUAL'
          THEN to_jsonb('AI Sourcing & Matching hỗ trợ tuyển dụng'::text)
        ELSE f.value END ORDER BY f.position)
      FROM jsonb_array_elements(p."features") WITH ORDINALITY AS f(value, position)
    ) WHERE jsonb_array_length(p."features") > 0;`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Removed credit balances cannot be reconstructed.
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "aiQuotaRemaining" integer NOT NULL DEFAULT 0;
      ALTER TABLE "premium_packages" ADD COLUMN "ai_quota" integer NOT NULL DEFAULT 0;
      ALTER TABLE "payment_orders" DROP COLUMN "package_id";
      ALTER TABLE "premium_packages" DROP COLUMN "chatbot_daily_limit";`);
  }
}
