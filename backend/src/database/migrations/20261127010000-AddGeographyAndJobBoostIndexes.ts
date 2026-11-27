import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGeographyAndJobBoostIndexes20261127010000
  implements MigrationInterface
{
  name = 'AddGeographyAndJobBoostIndexes20261127010000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_jobs_location_point_geog"
        ON "jobs" USING GIST (("locationPoint"::geography));

      CREATE INDEX IF NOT EXISTS "IDX_companies_location_geog"
        ON "companies" USING GIST (("location"::geography));

      CREATE INDEX IF NOT EXISTS "IDX_jobs_hot_boost_expires"
        ON "jobs" ("boostExpiresAt")
        WHERE "isHot" = true AND "isDeleted" = false;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_jobs_hot_boost_expires";
      DROP INDEX IF EXISTS "IDX_companies_location_geog";
      DROP INDEX IF EXISTS "IDX_jobs_location_point_geog";
    `);
  }
}
