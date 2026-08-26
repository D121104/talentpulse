import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { MailController } from './mail.controller';
import { MailProcessor } from './mail.processor';
import { MailerModule } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { join } from 'path';
import { existsSync } from 'fs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { Subscriber } from 'src/subscribers/entities/subscriber.entity';
import { Job } from 'src/jobs/entities/job.entity';

@Module({
  imports: [
    MailerModule.forRootAsync({
      useFactory: async (configService: ConfigService) => ({
        transport: {
          host: configService.get<string>('EMAIL_HOST'),
          secure: false,
          auth: {
            user: configService.get<string>('EMAIL_AUTH_USER'),
            pass: configService.get<string>('EMAIL_AUTH_PASSWORD'),
          },
        },
        defaults: {
          from: `"TalentPulse" <${configService.get<string>('EMAIL_AUTH_USER') || 'no-reply@talentpulse.com'}>`,
        },
        template: (() => {
          const compiledDir = join(__dirname, 'templates');
          const srcDir = join(process.cwd(), 'src', 'mail', 'templates');
          const dir = existsSync(compiledDir) ? compiledDir : srcDir;
          return {
            dir,
            adapter: new HandlebarsAdapter(),
            options: { strict: true },
          };
        })(),
        preview: configService.get<string>('EMAIL_PREVIEW') === 'true',
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([Subscriber, Job]),
    BullModule.registerQueue({
      name: 'mail-queue',
    }),
  ],
  controllers: [MailController],
  providers: [MailService, MailProcessor],
  exports: [MailService, BullModule],
})
export class MailModule {}
