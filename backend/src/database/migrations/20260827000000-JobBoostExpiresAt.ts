import { MigrationInterface, QueryRunner } from 'typeorm';

export class JobBoostExpiresAt20260827000000 implements MigrationInterface {
  name = 'JobBoostExpiresAt20260827000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "jobs"
      ADD COLUMN IF NOT EXISTS "boostExpiresAt" TIMESTAMPTZ NULL
    `);

    // Ensure boostedAt is TIMESTAMPTZ
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'jobs'
            AND column_name = 'boostedAt'
            AND data_type = 'timestamp without time zone'
        ) THEN
          ALTER TABLE "jobs"
            ALTER COLUMN "boostedAt" TYPE TIMESTAMPTZ
            USING "boostedAt" AT TIME ZONE 'UTC';
        END IF;
      END $$;
    `);

    // Set boostExpiresAt for any existing HOT jobs to 24h from boostedAt or now + 24h
    await queryRunner.query(`
      UPDATE "jobs"
      SET "boostExpiresAt" = COALESCE("boostedAt", now()) + interval '1 day'
      WHERE "isHot" = true AND "boostExpiresAt" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "jobs"
      DROP COLUMN IF EXISTS "boostExpiresAt"
    `);
  }
}
