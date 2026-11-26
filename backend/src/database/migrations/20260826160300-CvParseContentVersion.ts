import { MigrationInterface, QueryRunner } from 'typeorm';

export class CvParseContentVersion20260826160300 implements MigrationInterface {
  name = 'CvParseContentVersion20260826160300';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'user_cvs'
            AND column_name = 'parsedAt'
            AND data_type = 'timestamp without time zone'
        ) THEN
          ALTER TABLE "user_cvs"
            ALTER COLUMN "parsedAt" TYPE TIMESTAMPTZ
            USING "parsedAt" AT TIME ZONE 'UTC';
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      ALTER TABLE "user_cvs"
      ADD COLUMN IF NOT EXISTS "contentVersion" varchar(64) NULL
    `);
    await queryRunner.query(`
      UPDATE "user_cvs"
      SET "contentVersion" = uuid_generate_v4()::text
      WHERE "contentVersion" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "user_cvs"
      ALTER COLUMN "contentVersion" SET DEFAULT uuid_generate_v4()::text
    `);
    await queryRunner.query(`
      ALTER TABLE "user_cvs"
      ALTER COLUMN "contentVersion" SET NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_cvs" DROP COLUMN IF EXISTS "contentVersion"`,
    );
  }
}
