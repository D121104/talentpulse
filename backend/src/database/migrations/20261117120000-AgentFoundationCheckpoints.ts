import { MigrationInterface, QueryRunner } from 'typeorm';

export class AgentFoundationCheckpoints20261117120000 implements MigrationInterface {
  name = 'AgentFoundationCheckpoints20261117120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const runtimeRole = await queryRunner.query(
      `SELECT 1 FROM pg_roles WHERE rolname = 'agent_checkpoint_runtime'`,
    );
    if (runtimeRole.length === 0) {
      throw new Error('Provision the agent_checkpoint_runtime role before this migration.');
    }

    await queryRunner.query(`CREATE SCHEMA agent_checkpoint AUTHORIZATION CURRENT_USER`);
    await queryRunner.query(`REVOKE ALL ON SCHEMA agent_checkpoint FROM PUBLIC`);
    await queryRunner.query(`
      CREATE TABLE agent_checkpoint.checkpoint_migrations (
        v INTEGER PRIMARY KEY
      )
    `);
    await queryRunner.query(`
      CREATE TABLE agent_checkpoint.checkpoints (
        thread_id TEXT NOT NULL,
        checkpoint_ns TEXT NOT NULL DEFAULT '',
        checkpoint_id TEXT NOT NULL,
        parent_checkpoint_id TEXT,
        type TEXT,
        checkpoint JSONB NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}',
        PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE agent_checkpoint.checkpoint_blobs (
        thread_id TEXT NOT NULL,
        checkpoint_ns TEXT NOT NULL DEFAULT '',
        channel TEXT NOT NULL,
        version TEXT NOT NULL,
        type TEXT NOT NULL,
        blob BYTEA,
        PRIMARY KEY (thread_id, checkpoint_ns, channel, version)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE agent_checkpoint.checkpoint_writes (
        thread_id TEXT NOT NULL,
        checkpoint_ns TEXT NOT NULL DEFAULT '',
        checkpoint_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        idx INTEGER NOT NULL,
        channel TEXT NOT NULL,
        type TEXT,
        blob BYTEA NOT NULL,
        task_path TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX checkpoints_thread_id_idx
      ON agent_checkpoint.checkpoints(thread_id)
    `);
    await queryRunner.query(`
      CREATE INDEX checkpoint_blobs_thread_id_idx
      ON agent_checkpoint.checkpoint_blobs(thread_id)
    `);
    await queryRunner.query(`
      CREATE INDEX checkpoint_writes_thread_id_idx
      ON agent_checkpoint.checkpoint_writes(thread_id)
    `);
    await queryRunner.query(`
      CREATE INDEX agent_approval_expiry_idx
      ON agent_checkpoint.checkpoints ((metadata->>'agent_approval_expires_at'))
      WHERE metadata ? 'agent_approval_expires_at'
    `);
    await queryRunner.query(
      `INSERT INTO agent_checkpoint.checkpoint_migrations(v)
       SELECT generate_series(0, 9)`,
    );
    await queryRunner.query(
      `GRANT USAGE ON SCHEMA agent_checkpoint TO agent_checkpoint_runtime`,
    );
    await queryRunner.query(`
      GRANT SELECT, INSERT, UPDATE, DELETE
      ON agent_checkpoint.checkpoints,
         agent_checkpoint.checkpoint_blobs,
         agent_checkpoint.checkpoint_writes
      TO agent_checkpoint_runtime
    `);
    await queryRunner.query(`
      GRANT SELECT ON agent_checkpoint.checkpoint_migrations TO agent_checkpoint_runtime
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query(`
      SELECT EXISTS (SELECT 1 FROM agent_checkpoint.checkpoints)
          OR EXISTS (SELECT 1 FROM agent_checkpoint.checkpoint_blobs)
          OR EXISTS (SELECT 1 FROM agent_checkpoint.checkpoint_writes) AS has_pending_data
    `);
    if (rows[0]?.has_pending_data) {
      throw new Error('Resolve or expire approval checkpoints before rolling back this migration.');
    }
    await queryRunner.query(`DROP SCHEMA agent_checkpoint CASCADE`);
  }
}
