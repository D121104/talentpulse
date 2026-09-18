import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Company } from '../companies/entities/company.entity';
import { Job } from '../jobs/entities/job.entity';
import { Application } from '../applications/entities/application.entity';
import { Role } from '../decorator/customize';
import { PaymentsService } from '../payments/payments.service';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    @InjectRepository(Job)
    private readonly jobRepo: Repository<Job>,
    @InjectRepository(Application)
    private readonly applicationRepo: Repository<Application>,
    private readonly paymentsService: PaymentsService,
  ) {}

  /**
   * Thống kê tổng hợp cho Admin Dashboard Overview
   */
  async getDashboardStats() {
    // 1. User metrics
    const totalUsers = await this.userRepo.count({ where: { isDeleted: false } });
    const totalCandidates = await this.userRepo.count({
      where: { role: Role.USER, isDeleted: false },
    });
    const totalHrs = await this.userRepo.count({
      where: { role: Role.HR, isDeleted: false },
    });
    const pendingHrsCount = await this.userRepo.count({
      where: { role: Role.HR, isApproved: false, isDeleted: false },
    });
    const lockedUsersCount = await this.userRepo.count({
      where: { isLocked: true, isDeleted: false },
    });

    // 2. Company metrics
    const totalCompanies = await this.companyRepo.count({
      where: { isDeleted: false },
    });
    const verifiedCompanies = await this.companyRepo.count({
      where: { isActive: true, isDeleted: false },
    });

    // 3. Job metrics
    const totalJobs = await this.jobRepo.count({ where: { isDeleted: false } });
    const activeJobs = await this.jobRepo.count({
      where: { isActive: true, isDeleted: false },
    });
    const hotJobs = await this.jobRepo.count({
      where: { isHot: true, isDeleted: false },
    });

    // 4. Application metrics
    const totalApplications = await this.applicationRepo.count({
      where: { isDeleted: false },
    });

    // 5. Revenue metrics from PaymentsService
    const revenueStats = await this.paymentsService.getAdminRevenueStats();
    const activeSubscriptions = await this.userRepo.count({
      where: { isPremium: true, isDeleted: false },
    });

    // 6. Recent Pending HRs list
    const pendingHrs = await this.userRepo.find({
      where: { role: Role.HR, isApproved: false, isDeleted: false },
      order: { createdAt: 'DESC' },
      take: 5,
    });

    // 7. Recent Registrations
    const recentUsers = await this.userRepo.find({
      where: { isDeleted: false },
      order: { createdAt: 'DESC' },
      take: 6,
    });

    return {
      users: {
        total: totalUsers,
        candidates: totalCandidates,
        hrs: totalHrs,
        pendingApprovalHrs: pendingHrsCount,
        lockedUsers: lockedUsersCount,
      },
      companies: {
        total: totalCompanies,
        verified: verifiedCompanies,
      },
      jobs: {
        total: totalJobs,
        active: activeJobs,
        hot: hotJobs,
      },
      applications: {
        total: totalApplications,
      },
      revenue: {
        ...revenueStats,
        activeSubscriptions,
      },
      pendingHrApprovals: pendingHrs.map((hr) => ({
        _id: hr._id,
        name: hr.name,
        email: hr.email,
        createdAt: hr.createdAt,
        companyName: hr.company?.name || hr.registrationCompany?.name || null,
      })),
      recentUsers: recentUsers.map((u) => ({
        _id: u._id,
        name: u.name,
        email: u.email,
        role: u.role,
        createdAt: u.createdAt,
        companyName: u.company?.name || u.registrationCompany?.name || null,
      })),
    };
  }

  /**
   * Bật / Tắt trạng thái hiển thị của Job (Kiểm duyệt tin tuyển dụng)
   */
  async toggleJobActive(id: string) {
    const job = await this.jobRepo.findOne({ where: { _id: id } });
    if (!job) {
      throw new NotFoundException('Không tìm thấy tin tuyển dụng');
    }
    job.isActive = !job.isActive;
    return this.jobRepo.save(job);
  }

  /**
   * Bật / Tắt trạng thái hoạt động của Công ty (Kiểm duyệt doanh nghiệp)
   */
  async toggleCompanyActive(id: string) {
    const company = await this.companyRepo.findOne({ where: { _id: id } });
    if (!company) {
      throw new NotFoundException('Không tìm thấy doanh nghiệp');
    }
    company.isActive = !company.isActive;
    return this.companyRepo.save(company);
  }
}
