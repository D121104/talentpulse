import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveCvMatchSensitiveFields20260907170000
  implements MigrationInterface
{
  name = 'RemoveCvMatchSensitiveFields20260907170000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "cv_match_results" DROP COLUMN IF EXISTS "cvText"',
    );
    await queryRunner.query(
      'ALTER TABLE "cv_match_results" DROP COLUMN IF EXISTS "cvUrl"',
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Do not recreate historical CV content or URLs during rollback.
  }
}
