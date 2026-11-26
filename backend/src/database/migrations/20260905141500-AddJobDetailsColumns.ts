import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddJobDetailsColumns20260905141500 implements MigrationInterface {
  name = 'AddJobDetailsColumns20260905141500';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "jobs"
      ADD COLUMN IF NOT EXISTS "workingModel" VARCHAR(100) DEFAULT 'Làm việc tại văn phòng / Onsite',
      ADD COLUMN IF NOT EXISTS "education" VARCHAR(100) DEFAULT 'Đại học trở lên',
      ADD COLUMN IF NOT EXISTS "benefits" TEXT[] DEFAULT '{"Bảo hiểm xã hội", "Du lịch hàng năm", "Thưởng tháng 13"}',
      ADD COLUMN IF NOT EXISTS "categories" TEXT[] DEFAULT '{"Công nghệ Thông tin", "Software Engineering"}';
    `);

    // Backfill any existing records where columns are NULL
    await queryRunner.query(`
      UPDATE "jobs"
      SET
        "workingModel" = COALESCE("workingModel", 'Làm việc tại văn phòng / Onsite'),
        "education" = COALESCE("education", 'Đại học trở lên'),
        "benefits" = CASE
          WHEN "benefits" IS NULL OR "benefits" = '{}' THEN '{"Bảo hiểm xã hội", "Du lịch hàng năm", "Thưởng tháng 13"}'::text[]
          ELSE "benefits"
        END,
        "categories" = CASE
          WHEN "categories" IS NULL OR "categories" = '{}' THEN '{"Công nghệ Thông tin", "Software Engineering"}'::text[]
          ELSE "categories"
        END
      WHERE "workingModel" IS NULL
         OR "education" IS NULL
         OR "benefits" IS NULL
         OR "benefits" = '{}'
         OR "categories" IS NULL
         OR "categories" = '{}';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "jobs"
      DROP COLUMN IF EXISTS "categories",
      DROP COLUMN IF EXISTS "benefits",
      DROP COLUMN IF EXISTS "education",
      DROP COLUMN IF EXISTS "workingModel";
    `);
  }
}
