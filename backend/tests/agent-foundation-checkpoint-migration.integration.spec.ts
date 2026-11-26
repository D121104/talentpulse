import { DataSource } from 'typeorm';
import { AgentFoundationCheckpoints20261117120000 } from '../src/database/migrations/20261117120000-AgentFoundationCheckpoints';

const databaseUrl = process.env.AGENT_CHECKPOINT_MIGRATION_TEST_URL;
const databaseSuite = databaseUrl ? describe : describe.skip;

databaseSuite('Agent Foundation checkpoint migration', () => {
  let dataSource: DataSource;
  let migration: AgentFoundationCheckpoints20261117120000;

  beforeAll(async () => {
    const url = process.env.AGENT_CHECKPOINT_MIGRATION_TEST_URL;
    if (!url) throw new Error('Dedicated test database URL is required.');
    dataSource = new DataSource({ type: 'postgres', url, synchronize: false });
    await dataSource.initialize();
    migration = new AgentFoundationCheckpoints20261117120000();
    await dataSource.query(`DROP SCHEMA IF EXISTS agent_checkpoint CASCADE`);
    await dataSource.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agent_checkpoint_runtime') THEN
          CREATE ROLE agent_checkpoint_runtime NOLOGIN;
        END IF;
      END $$
    `);
    await dataSource.query(
      `CREATE TABLE IF NOT EXISTS public.agent_checkpoint_business_sentinel (id INTEGER PRIMARY KEY)`,
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('creates only checkpoint tables and grants no business-table access', async () => {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    try {
      await migration.up(runner);
      const checkpointTables = await runner.query(`
        SELECT count(*)::integer AS count
        FROM information_schema.tables
        WHERE table_schema = 'agent_checkpoint'
          AND table_name IN (
            'checkpoint_migrations', 'checkpoints', 'checkpoint_blobs', 'checkpoint_writes'
          )
      `);
      const businessAccess = await runner.query(`
        SELECT has_table_privilege(
          'agent_checkpoint_runtime',
          'public.agent_checkpoint_business_sentinel',
          'SELECT'
        ) AS can_read_business
      `);
      expect(checkpointTables[0].count).toBe(4);
      expect(businessAccess[0].can_read_business).toBe(false);

      await runner.query(`
        INSERT INTO agent_checkpoint.checkpoints
          (thread_id, checkpoint_id, checkpoint, metadata)
        VALUES ('pending-test', 'checkpoint-test', '{}', '{}')
      `);
      await expect(migration.down(runner)).rejects.toThrow(
        'Resolve or expire approval checkpoints',
      );
      await runner.query(
        `DELETE FROM agent_checkpoint.checkpoints WHERE thread_id = 'pending-test'`,
      );
      await migration.down(runner);
      const sentinel = await runner.query(`
        SELECT to_regclass('public.agent_checkpoint_business_sentinel') AS table_name
      `);
      expect(sentinel[0].table_name).toBe('agent_checkpoint_business_sentinel');
      await migration.up(runner);
    } finally {
      await runner.release();
    }
  });
});
