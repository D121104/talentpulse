import { MigrationInterface, QueryRunner } from 'typeorm';

export class JobDatesUtc20260826160050 implements MigrationInterface {
  name = 'JobDatesUtc20260826160050';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'jobs'
            AND column_name = 'startDate'
            AND data_type = 'timestamp without time zone'
        ) THEN
          ALTER TABLE "jobs"
            ALTER COLUMN "startDate" TYPE TIMESTAMPTZ
            USING "startDate" AT TIME ZONE 'UTC';
        END IF;

        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'jobs'
            AND column_name = 'endDate'
            AND data_type = 'timestamp without time zone'
        ) THEN
          ALTER TABLE "jobs"
            ALTER COLUMN "endDate" TYPE TIMESTAMPTZ
            USING "endDate" AT TIME ZONE 'UTC';
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'jobs'
            AND column_name = 'startDate'
            AND data_type = 'timestamp with time zone'
        ) THEN
          ALTER TABLE "jobs"
            ALTER COLUMN "startDate" TYPE TIMESTAMP
            USING "startDate" AT TIME ZONE 'UTC';
        END IF;

        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'jobs'
            AND column_name = 'endDate'
            AND data_type = 'timestamp with time zone'
        ) THEN
          ALTER TABLE "jobs"
            ALTER COLUMN "endDate" TYPE TIMESTAMP
            USING "endDate" AT TIME ZONE 'UTC';
        END IF;
      END $$;
    `);
  }
}
