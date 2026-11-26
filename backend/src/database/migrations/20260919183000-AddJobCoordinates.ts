import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddJobCoordinates20260919183000 implements MigrationInterface {
  name = 'AddJobCoordinates20260919183000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS postgis;

      ALTER TABLE "jobs"
      ADD COLUMN IF NOT EXISTS "lat" double precision,
      ADD COLUMN IF NOT EXISTS "lon" double precision,
      ADD COLUMN IF NOT EXISTS "locationPoint" geometry(Point, 4326);

      CREATE INDEX IF NOT EXISTS "IDX_jobs_location_point" ON "jobs" USING GIST ("locationPoint");

      UPDATE "jobs" j
      SET "lat" = c."lat",
          "lon" = c."lon",
          "locationPoint" = ST_SetSRID(ST_MakePoint(c."lon", c."lat"), 4326)
      FROM "companies" c
      WHERE (j."company"->>'_id')::uuid = c."_id"
        AND c."lat" IS NOT NULL
        AND c."lon" IS NOT NULL
        AND (j."lat" IS NULL OR j."lon" IS NULL OR j."locationPoint" IS NULL);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_jobs_location_point";
      ALTER TABLE "jobs"
      DROP COLUMN IF EXISTS "locationPoint",
      DROP COLUMN IF EXISTS "lon",
      DROP COLUMN IF EXISTS "lat";
    `);
  }
}
