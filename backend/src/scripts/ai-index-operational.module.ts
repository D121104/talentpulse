import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiIndexingModule } from '../ai-indexing/ai-indexing.module';
import { validateEnvironment } from '../config/environment.validation';

/** Minimal production-equivalent composition for explicit indexing operations. */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnvironment,
      load: [() => ({ AI_INDEX_OPERATIONAL_MODE: true })],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get<string>('DB_USERNAME', 'postgres'),
        password: config.get<string>('DB_PASSWORD', 'postgres123'),
        database: config.get<string>('DB_DATABASE', 'recruitment_db'),
        autoLoadEntities: true,
        synchronize: false,
        extra: { options: '-c timezone=UTC' },
        ssl: config.get<string>('NODE_ENV', 'development') !== 'development',
      }),
    }),
    AiIndexingModule,
  ],
})
export class AiIndexOperationalModule {}
