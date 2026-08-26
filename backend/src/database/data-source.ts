import 'dotenv/config';
import { DataSource, DataSourceOptions } from 'typeorm';
import { join } from 'path';
import { validateEnvironment } from '../config/environment.validation';

export function createDataSourceOptions(
  config: Record<string, unknown> = process.env as Record<string, unknown>,
): DataSourceOptions {
  const env = validateEnvironment(config);
  const nodeEnv = String(env.NODE_ENV ?? 'development').trim().toLowerCase();

  return {
    type: 'postgres',
    host: String(env.DB_HOST ?? 'localhost'),
    port: Number(env.DB_PORT ?? 5432),
    username: String(env.DB_USERNAME ?? 'postgres'),
    password: String(env.DB_PASSWORD ?? 'postgres123'),
    database: String(env.DB_DATABASE ?? 'recruitment_db'),
    entities: [join(__dirname, '../**/*.entity{.ts,.js}')],
    migrations: [join(__dirname, './migrations/*{.ts,.js}')],
    migrationsTableName: 'typeorm_migrations',
    // The CLI DataSource is migration-only; schema changes must be reviewed.
    synchronize: false,
    extra: { options: '-c timezone=UTC' },
    ssl: nodeEnv === 'production' ? { rejectUnauthorized: false } : false,
  };
}

export default new DataSource(createDataSourceOptions());
