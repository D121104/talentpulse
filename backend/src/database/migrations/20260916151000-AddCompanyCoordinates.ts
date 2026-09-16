import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCompanyCoordinates20260916151000
  implements MigrationInterface
{
  name = 'AddCompanyCoordinates20260916151000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS postgis;

      ALTER TABLE "companies"
      ADD COLUMN IF NOT EXISTS "lat" double precision,
      ADD COLUMN IF NOT EXISTS "lon" double precision,
      ADD COLUMN IF NOT EXISTS "website" character varying,
      ADD COLUMN IF NOT EXISTS "location" geometry(Point, 4326);

      CREATE INDEX IF NOT EXISTS "IDX_companies_location" ON "companies" USING GIST ("location");

      UPDATE "companies"
      SET "location" = ST_SetSRID(ST_MakePoint("lon", "lat"), 4326)
      WHERE "lat" IS NOT NULL AND "lon" IS NOT NULL AND "location" IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_companies_location";
      ALTER TABLE "companies"
      DROP COLUMN IF EXISTS "location",
      DROP COLUMN IF EXISTS "website",
      DROP COLUMN IF EXISTS "lon",
      DROP COLUMN IF EXISTS "lat";
    `);
  }
}
