import { MigrationInterface, QueryRunner } from 'typeorm';

export class CandidateCvExpectedSalary20261102100000
  implements MigrationInterface
{
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "online_cvs"
      ADD COLUMN "expectedSalaryVndMonthly" integer NULL,
      ADD COLUMN "shareExpectedSalary" boolean NOT NULL DEFAULT false,
      ADD CONSTRAINT "CHK_online_cv_expected_salary" CHECK ("expectedSalaryVndMonthly" >= 0)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "online_cvs"
      DROP CONSTRAINT "CHK_online_cv_expected_salary",
      DROP COLUMN "shareExpectedSalary",
      DROP COLUMN "expectedSalaryVndMonthly"`);
  }
}
