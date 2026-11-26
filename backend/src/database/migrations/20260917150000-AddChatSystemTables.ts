import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddChatSystemTables20260917150000 implements MigrationInterface {
  name = 'AddChatSystemTables20260917150000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create chat_conversations table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chat_conversations" (
        "_id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "candidateId" uuid NOT NULL,
        "companyId" uuid NOT NULL,
        "lastMessageText" text,
        "lastMessageAt" TIMESTAMP WITH TIME ZONE,
        "lastSenderId" uuid,
        "candidateUnreadCount" integer NOT NULL DEFAULT 0,
        "companyUnreadCount" integer NOT NULL DEFAULT 0,
        "isDeleted" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "FK_chat_conversations_candidate" FOREIGN KEY ("candidateId") REFERENCES "users"("_id") ON DELETE CASCADE,
        CONSTRAINT "FK_chat_conversations_company" FOREIGN KEY ("companyId") REFERENCES "companies"("_id") ON DELETE CASCADE,
        CONSTRAINT "UQ_chat_conversations_candidate_company" UNIQUE ("candidateId", "companyId")
      );

      CREATE INDEX IF NOT EXISTS "IDX_chat_conversations_candidateId" ON "chat_conversations" ("candidateId");
      CREATE INDEX IF NOT EXISTS "IDX_chat_conversations_companyId" ON "chat_conversations" ("companyId");
      CREATE INDEX IF NOT EXISTS "IDX_chat_conversations_lastMessageAt" ON "chat_conversations" ("lastMessageAt" DESC NULLS LAST);
    `);

    // 2. Create chat_messages table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chat_messages" (
        "_id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "conversationId" uuid NOT NULL,
        "senderId" uuid NOT NULL,
        "senderRole" character varying(20) NOT NULL,
        "messageType" character varying(20) NOT NULL DEFAULT 'TEXT',
        "content" text NOT NULL,
        "fileName" character varying(255),
        "fileSize" integer,
        "isRead" boolean NOT NULL DEFAULT false,
        "readAt" TIMESTAMP WITH TIME ZONE,
        "reactions" jsonb NOT NULL DEFAULT '[]',
        "isDeleted" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "FK_chat_messages_conversation" FOREIGN KEY ("conversationId") REFERENCES "chat_conversations"("_id") ON DELETE CASCADE,
        CONSTRAINT "FK_chat_messages_sender" FOREIGN KEY ("senderId") REFERENCES "users"("_id") ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS "IDX_chat_messages_conversationId" ON "chat_messages" ("conversationId", "createdAt" ASC);
      CREATE INDEX IF NOT EXISTS "IDX_chat_messages_senderId" ON "chat_messages" ("senderId");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "chat_messages";
      DROP TABLE IF EXISTS "chat_conversations";
    `);
  }
}
