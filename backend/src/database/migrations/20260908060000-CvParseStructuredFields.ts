import { MigrationInterface, QueryRunner } from 'typeorm';

export class CvParseStructuredFields20260908060000
  implements MigrationInterface
{
  name = 'CvParseStructuredFields20260908060000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_cvs"
      ADD COLUMN IF NOT EXISTS "warnings" text[] NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS "parserVersion" varchar(80) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_cvs" DROP COLUMN IF EXISTS "parserVersion"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_cvs" DROP COLUMN IF EXISTS "warnings"`,
    );
  }
}
