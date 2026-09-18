import { MigrationInterface, QueryRunner } from 'typeorm';

export class AiServiceMatchMetadata20260826160400
  implements MigrationInterface
{
  name = 'AiServiceMatchMetadata20260826160400';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "cv_match_results"
        ADD COLUMN IF NOT EXISTS "contentHash" varchar(64) NULL,
        ADD COLUMN IF NOT EXISTS "jobSourceVersion" varchar(64) NULL,
        ADD COLUMN IF NOT EXISTS "scoringVersion" varchar(120) NULL,
        ADD COLUMN IF NOT EXISTS "modelVersion" varchar(120) NULL,
        ADD COLUMN IF NOT EXISTS "normalizationVersion" varchar(120) NULL,
        ADD COLUMN IF NOT EXISTS "components" jsonb NULL,
        ADD COLUMN IF NOT EXISTS "compatibility" jsonb NULL,
        ADD COLUMN IF NOT EXISTS "degraded" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE "cv_match_results" DROP COLUMN IF EXISTS "cvEmbedding"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "cv_match_results" DROP COLUMN IF EXISTS "degraded"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cv_match_results" DROP COLUMN IF EXISTS "compatibility"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cv_match_results" DROP COLUMN IF EXISTS "components"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cv_match_results" DROP COLUMN IF EXISTS "normalizationVersion"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cv_match_results" DROP COLUMN IF EXISTS "modelVersion"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cv_match_results" DROP COLUMN IF EXISTS "scoringVersion"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cv_match_results" DROP COLUMN IF EXISTS "jobSourceVersion"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cv_match_results" DROP COLUMN IF EXISTS "contentHash"`,
    );
  }
}
