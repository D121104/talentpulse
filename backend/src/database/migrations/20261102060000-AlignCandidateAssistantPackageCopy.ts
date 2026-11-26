import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlignCandidateAssistantPackageCopy20261102060000
  implements MigrationInterface
{
  name = 'AlignCandidateAssistantPackageCopy20261102060000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "premium_packages" AS package
       SET "features" = (
         SELECT jsonb_agg(
           CASE WHEN feature.value = to_jsonb(legacy.feature)
             THEN to_jsonb($1::text) ELSE feature.value END
           ORDER BY feature.position
         )
         FROM jsonb_array_elements(package."features")
           WITH ORDINALITY AS feature(value, position)
       )
       FROM (VALUES
         ('CANDIDATE_MONTHLY', 'AI Career Assistant: 50 lượt phân tích/tháng'),
         ('CANDIDATE_SEMI_ANNUAL', 'AI Career Assistant: 200 lượt phân tích'),
         ('CANDIDATE_ANNUAL', 'AI Career Assistant: 500 lượt phân tích')
       ) AS legacy(code, feature)
       WHERE package."code" = legacy.code
         AND package."plan_type" = 'CANDIDATE_PREMIUM'
         AND package."is_deleted" = false
         AND package."features" @> jsonb_build_array(legacy.feature)`,
      ['AI Career Assistant: chat không giới hạn trong thời hạn Premium'],
    );
  }

  public async down(): Promise<void> {
    // Preserve corrected or customized copy; its origin cannot be recovered safely.
  }
}
