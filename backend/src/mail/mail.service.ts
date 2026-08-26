import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscriber } from 'src/subscribers/entities/subscriber.entity';
import { Job } from 'src/jobs/entities/job.entity';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ApplicationStatus } from 'src/applications/entities/application.entity';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly BATCH_SIZE = 20;

  constructor(
    private readonly mailerService: MailerService,
    @InjectRepository(Subscriber)
    private readonly subscriberRepo: Repository<Subscriber>,
    @InjectRepository(Job)
    private readonly jobRepo: Repository<Job>,
  ) {}

  // Send OTP verification email to user
  async sendOtp(email: string, otp: string) {
    await this.mailerService.sendMail({
      to: email,
      subject: 'Xác thực OTP',
      template: 'otp',
      context: {
        otp,
      },
    });
  }

  // Send password reset email with token link
  async sendForgotPassword(email: string, token: string) {
    await this.mailerService.sendMail({
      to: email,
      subject: 'Đặt lại mật khẩu',
      template: 'forgot-password',
      context: {
        link: `${process.env.URL_FRONTEND}/reset-password?token=${token}`,
      },
    });
  }

  // Send interview invitation email with custom HTML content
  async sendInterviewInvite(email: string, subject: string, content: string) {
    await this.mailerService.sendMail({
      to: email,
      subject: subject || 'Thư mời phỏng vấn',
      html: content,
    });
  }

  // Send welcome email after registration
  async sendWelcome(email: string, name: string) {
    await this.mailerService.sendMail({
      to: email,
      subject: 'Chào mừng bạn đến với hệ thống',
      template: 'welcome',
      context: {
        name,
      },
    });
  }

  // Send account verification email for candidate
  async sendAccountVerificationEmail(email: string, name: string, token: string) {
    const frontendUrl = process.env.URL_FRONTEND || 'http://localhost:5173';
    const verifyUrl = `${frontendUrl}/verify-account?token=${token}`;

    await this.mailerService.sendMail({
      to: email,
      subject: '🛡️ [TalentPulse] Xác thực tài khoản ứng viên để mở khóa quyền lợi Đã Xác Thực',
      template: 'verify-account',
      context: {
        name: name || 'Bạn',
        verifyUrl,
        currentYear: new Date().getFullYear(),
      },
    });
  }

  // Send application status notification email (Suitable, Considering, Unsuitable)
  async sendApplicationStatusEmail(data: {
    candidateEmail: string;
    candidateName: string;
    jobTitle: string;
    companyName: string;
    status: ApplicationStatus;
    note?: string;
  }) {
    const isApproved = data.status === ApplicationStatus.APPROVED;
    const isConsidering = data.status === ApplicationStatus.CONSIDERING;
    const isRejected = data.status === ApplicationStatus.REJECTED;

    let statusText = 'Phù hợp';
    if (isConsidering) statusText = 'Cân nhắc';
    if (isRejected) statusText = 'Chưa phù hợp';

    const subject = `[TalentPulse] Thông báo kết quả tuyển dụng vị trí ${data.jobTitle} - ${data.companyName}`;

    await this.mailerService.sendMail({
      to: data.candidateEmail,
      subject,
      template: 'application-status',
      context: {
        candidateName: data.candidateName || 'Bạn',
        jobTitle: data.jobTitle,
        companyName: data.companyName,
        statusText,
        isApproved,
        isConsidering,
        isRejected,
        note: data.note,
        myCvLink: `${process.env.URL_FRONTEND || 'http://localhost:5173'}/cv`,
      },
    });
  }

  // Cron job: runs every 11 hours, sends matching job notifications to active subscribers in batches
  @Cron(CronExpression.EVERY_11_HOURS)
  async sendJobNotificationCron() {
    this.logger.log('Starting job notification cron job...');

    try {
      const totalSubscribers = await this.subscriberRepo.count({
        where: {
          isActive: true,
          isDeleted: false,
        },
      });

      if (totalSubscribers === 0) {
        this.logger.log('No active subscribers found');
        return;
      }

      const totalPages = Math.ceil(totalSubscribers / this.BATCH_SIZE);
      this.logger.log(
        `Found ${totalSubscribers} subscribers, processing in ${totalPages} batches`,
      );

      let emailsSent = 0;

      for (let page = 1; page <= totalPages; page++) {
        this.logger.log(`Processing batch ${page}/${totalPages}`);

        const subscribers = await this.subscriberRepo.find({
          where: {
            isActive: true,
            isDeleted: false,
          },
          relations: ['skills'],
          skip: (page - 1) * this.BATCH_SIZE,
          take: this.BATCH_SIZE,
        });

        for (const subscriber of subscribers) {
          try {
            await this.sendJobNotificationToSubscriber(subscriber);
            emailsSent++;

            await this.subscriberRepo.update(subscriber._id, {
              lastEmailSentAt: new Date(),
            });
          } catch (error) {
            this.logger.error(
              `Failed to send email to ${subscriber.email}: ${error.message}`,
            );
          }
        }

        if (page < totalPages) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      this.logger.log(
        `Job notification cron completed. Sent ${emailsSent} emails`,
      );
    } catch (error) {
      this.logger.error(`Job notification cron failed: ${error.message}`);
    }
  }

  // Find jobs matching subscriber's skills and send summary email via Handlebars template
  private async sendJobNotificationToSubscriber(subscriber: Subscriber) {
    const skillNames = (subscriber.skills || []).map((skill) => skill.name);

    if (skillNames.length === 0) {
      this.logger.debug(
        `Subscriber ${subscriber.email} has no skills, skipping`,
      );
      return;
    }

    this.logger.debug(
      `Finding jobs for subscriber ${
        subscriber.email
      } with skills: ${skillNames.join(', ')}`,
    );

    const now = new Date();
    const queryBuilder = this.jobRepo
      .createQueryBuilder('job')
      .where('job.isActive = :isActive', { isActive: true })
      .andWhere('job.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('job.endDate > :now', { now });

    const conditions = skillNames.map(
      (name, idx) =>
        `EXISTS (SELECT 1 FROM unnest(job.skills) s WHERE s ILIKE :skill_${idx})`,
    );
    const params: Record<string, string> = {};
    skillNames.forEach((name, idx) => {
      params[`skill_${idx}`] = `%${name}%`;
    });

    queryBuilder.andWhere(`(${conditions.join(' OR ')})`, params);
    queryBuilder.take(10);

    const jobs = await queryBuilder.getMany();

    this.logger.debug(
      `Found ${jobs.length} jobs for subscriber ${subscriber.email}`,
    );

    if (jobs.length > 0) {
      await this.mailerService.sendMail({
        to: subscriber.email,
        subject: `${jobs.length} việc làm mới phù hợp với kỹ năng của bạn`,
        template: 'job-notification',
        context: {
          jobs,
          subscriberEmail: subscriber.email,
          skillNames: skillNames.join(', '),
        },
      });
    }
  }

  // Manual trigger version of job notification (for admin use)
  async sendJobNotification() {
    const subscribers = await this.subscriberRepo.find({
      where: {
        isActive: true,
        isDeleted: false,
      },
      relations: ['skills'],
    });

    for (const subscriber of subscribers) {
      const skillNames = (subscriber.skills || []).map((skill) => skill.name);
      if (skillNames.length === 0) continue;

      const now = new Date();
      const queryBuilder = this.jobRepo
        .createQueryBuilder('job')
        .where('job.isActive = :isActive', { isActive: true })
        .andWhere('job.isDeleted = :isDeleted', { isDeleted: false })
        .andWhere('job.endDate > :now', { now });

      const conditions = skillNames.map(
        (name, idx) =>
          `EXISTS (SELECT 1 FROM unnest(job.skills) s WHERE s ILIKE :skill_${idx})`,
      );
      const params: Record<string, string> = {};
      skillNames.forEach((name, idx) => {
        params[`skill_${idx}`] = `%${name}%`;
      });

      queryBuilder.andWhere(`(${conditions.join(' OR ')})`, params);
      queryBuilder.take(10);

      const jobs = await queryBuilder.getMany();

      if (jobs.length > 0) {
        await this.mailerService.sendMail({
          to: subscriber.email,
          subject: `${jobs.length} việc làm mới phù hợp với kỹ năng của bạn`,
          template: 'job-notification',
          context: {
            jobs,
            subscriberEmail: subscriber.email,
            skillNames: skillNames.join(', '),
          },
        });
      }
    }
  }

  // Send premium subscription success confirmation email
  async sendPremiumSuccessEmail(data: {
    userEmail: string;
    userName: string;
    orderCode: number;
    planType: string;
    billingCycle: string;
    durationDays: number;
    amount: number;
    expiryDate: string;
    transactionReference?: string;
  }) {
    const isCandidate = data.planType === 'CANDIDATE_PREMIUM';
    const planName = isCandidate ? 'CANDIDATE PREMIUM' : 'HR ENTERPRISE';
    const planTitle = isCandidate
      ? 'Candidate Premium'
      : 'HR Premium Enterprise';

    const cycleTextMap: Record<string, string> = {
      monthly: '1 Tháng',
      semi_annual: '6 Tháng (Ưu đãi 15%)',
      annual: '1 Năm (Ưu đãi 33% ⭐)',
    };

    const frontendUrl = process.env.URL_FRONTEND || 'http://localhost:5173';
    const actionUrl = isCandidate
      ? `${frontendUrl}/my-cv`
      : `${frontendUrl}/dashboard?tab=jobs`;

    await this.mailerService.sendMail({
      to: data.userEmail,
      subject: `👑 [TalentPulse] Xác nhận nâng cấp ${planTitle} thành công (Đơn #${data.orderCode})`,
      template: 'premium-success',
      context: {
        userName: data.userName,
        orderCode: data.orderCode,
        planName,
        planTitle,
        isCandidate,
        cycleText: cycleTextMap[data.billingCycle] || data.billingCycle,
        durationDays: data.durationDays,
        formattedAmount: Number(data.amount).toLocaleString('vi-VN'),
        expiryDate: data.expiryDate,
        transactionReference: data.transactionReference,
        actionUrl,
      },
    });
  }
}
