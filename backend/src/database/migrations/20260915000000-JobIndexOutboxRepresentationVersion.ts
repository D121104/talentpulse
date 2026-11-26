import { MigrationInterface, QueryRunner } from 'typeorm';

export class JobIndexOutboxRepresentationVersion20260915000000
  implements MigrationInterface
{
  name = 'JobIndexOutboxRepresentationVersion20260915000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "job_index_outbox"
      ADD COLUMN IF NOT EXISTS "representationVersion" varchar(128)
    `);
    await queryRunner.query(`
      UPDATE "job_index_outbox"
      SET "representationVersion" = 'demo-v1'
      WHERE "representationVersion" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "job_index_outbox"
      ALTER COLUMN "representationVersion" SET DEFAULT 'demo-v1',
      ALTER COLUMN "representationVersion" SET NOT NULL
    `);

    await queryRunner.query(
      `ALTER TABLE "job_index_outbox" DROP CONSTRAINT IF EXISTS "UQ_job_index_outbox_event"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_job_index_outbox_event"`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_job_index_outbox_event"
      ON "job_index_outbox"
        ("aggregateId", "sourceVersion", "eventType", "representationVersion")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const duplicates = await queryRunner.query(`
      SELECT "aggregateId", "sourceVersion", "eventType"
      FROM "job_index_outbox"
      GROUP BY "aggregateId", "sourceVersion", "eventType"
      HAVING COUNT(*) > 1
      LIMIT 1
    `);
    if (duplicates.length > 0) {
      throw new Error(
        'Cannot safely restore job_index_outbox uniqueness: representations would collapse',
      );
    }

    await queryRunner.query(
      `ALTER TABLE "job_index_outbox" DROP CONSTRAINT IF EXISTS "UQ_job_index_outbox_event"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_job_index_outbox_event"`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_job_index_outbox_event"
      ON "job_index_outbox" ("aggregateId", "sourceVersion", "eventType")
    `);
    await queryRunner.query(`
      ALTER TABLE "job_index_outbox"
      DROP COLUMN IF EXISTS "representationVersion"
    `);
  }
}
