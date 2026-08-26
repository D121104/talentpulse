import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { MailService } from './mail.service';
import { ApplicationStatus } from 'src/applications/entities/application.entity';

export interface ApplicationStatusEmailJobData {
  candidateEmail: string;
  candidateName: string;
  jobTitle: string;
  companyName: string;
  status: ApplicationStatus;
  note?: string;
}

export interface PremiumSuccessEmailJobData {
  userEmail: string;
  userName: string;
  orderCode: number;
  planType: string;
  billingCycle: string;
  durationDays: number;
  amount: number;
  expiryDate: string;
  transactionReference?: string;
}

// Bull Queue Worker: processes email delivery asynchronously in background
@Processor('mail-queue')
export class MailProcessor {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(private readonly mailService: MailService) {}

  @Process('send-application-status-email')
  async handleSendApplicationStatusEmail(
    job: Job<ApplicationStatusEmailJobData>,
  ) {
    this.logger.log(
      `Processing email job for candidate: ${job.data.candidateEmail}, status: ${job.data.status}`,
    );

    try {
      await this.mailService.sendApplicationStatusEmail(job.data);
      this.logger.log(
        `Successfully sent application status email to ${job.data.candidateEmail}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send application status email to ${job.data.candidateEmail}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  @Process('send-premium-success-email')
  async handleSendPremiumSuccessEmail(
    job: Job<PremiumSuccessEmailJobData>,
  ) {
    this.logger.log(
      `Processing premium success email for user: ${job.data.userEmail}, orderCode: ${job.data.orderCode}`,
    );

    try {
      await this.mailService.sendPremiumSuccessEmail(job.data);
      this.logger.log(
        `Successfully sent premium success email to ${job.data.userEmail}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send premium success email to ${job.data.userEmail}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
