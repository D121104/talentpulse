import { MigrationInterface, QueryRunner } from 'typeorm';

export class AssistantGenerationMetadata20261103110000
  implements MigrationInterface
{
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "ai_chat_messages" ADD COLUMN "generationMetadata" jsonb NULL`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "ai_chat_messages" DROP COLUMN "generationMetadata"`,
    );
  }
}
