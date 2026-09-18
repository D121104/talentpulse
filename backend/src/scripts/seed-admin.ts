import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
import { User, PremiumPlan } from '../users/entities/user.entity';
import { Role } from '../decorator/customize';
import { PremiumPackage } from '../payments/entities/premium-package.entity';
import { PaymentBillingCycle } from '../payments/entities/payment-order.entity';

dotenv.config();

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres123',
  database: process.env.DB_DATABASE || 'recruitment_db',
  entities: [User, PremiumPackage],
  synchronize: false,
});

async function runSeedAdmin() {
  console.log('--- Đang kết nối Cơ sở dữ liệu để seed Admin ---');
  await AppDataSource.initialize();
  console.log('✓ Kết nối DB thành công!');

  const userRepo = AppDataSource.getRepository(User);
  const packageRepo = AppDataSource.getRepository(PremiumPackage);

  const adminEmail = 'admin@talentpulse.com';
  const hashedPassword = bcrypt.hashSync('12345678', bcrypt.genSaltSync(10));

  let adminUser = await userRepo.findOne({ where: { email: adminEmail } });

  if (!adminUser) {
    adminUser = userRepo.create({
      email: adminEmail,
      password: hashedPassword,
      name: 'Quản Trị Viên Hệ Thống (TalentPulse Admin)',
      role: Role.ADMIN,
      isApproved: true,
      isVerified: true,
      isLocked: false,
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    });
    await userRepo.save(adminUser);
    console.log(`✓ Đã tạo mới tài khoản Admin: ${adminEmail} (Mật khẩu: 12345678)`);
  } else {
    adminUser.role = Role.ADMIN;
    adminUser.password = hashedPassword;
    adminUser.isApproved = true;
    adminUser.isVerified = true;
    adminUser.isLocked = false;
    await userRepo.save(adminUser);
    console.log(`✓ Đã cập nhật quyền ADMIN và mật khẩu cho tài khoản: ${adminEmail}`);
  }

  // Seed default packages if empty
  const packageCount = await packageRepo.count({ where: { isDeleted: false } });
  if (packageCount === 0) {
    console.log('Đang khởi tạo các gói Premium mặc định...');
    const defaultPackages: Partial<PremiumPackage>[] = [
      {
        code: 'CANDIDATE_MONTHLY',
        planType: PremiumPlan.CANDIDATE_PREMIUM,
        billingCycle: PaymentBillingCycle.MONTHLY,
        name: 'Candidate Premium (1 Tháng)',
        description: 'Bứt phá sự nghiệp & tiếp cận NTD hàng đầu',
        price: 49000,
        originalPrice: 49000,
        durationDays: 30,
        aiQuota: 50,
        badge: null,
        features: [
          'Không giới hạn tạo và tải CV chất lượng cao',
          'Đẩy Top hồ sơ 24h mỗi ngày',
          'Xem danh sách NTD đã ghé thăm hồ sơ',
          'Huy hiệu Candidate Premium VIP nổi bật',
          'AI Career Assistant: 50 lượt phân tích/tháng',
        ],
        hotJobLimit: 0,
        candidateSearchLimit: 0,
        isActive: true,
        displayOrder: 1,
      },
      {
        code: 'CANDIDATE_SEMI_ANNUAL',
        planType: PremiumPlan.CANDIDATE_PREMIUM,
        billingCycle: PaymentBillingCycle.SEMI_ANNUAL,
        name: 'Candidate Premium (6 Tháng)',
        description: 'Tiết kiệm 15% - Lựa chọn hoàn hảo cho lộ trình đổi việc',
        price: 249000,
        originalPrice: 294000,
        durationDays: 180,
        aiQuota: 200,
        badge: 'Tiết kiệm 15%',
        features: [
          'Toàn bộ quyền lợi gói Tháng',
          'Đẩy Top hồ sơ mỗi ngày',
          'Ưu tiên kết nối với chuyên viên tuyển dụng',
          'AI Career Assistant: 200 lượt phân tích',
        ],
        hotJobLimit: 0,
        candidateSearchLimit: 0,
        isActive: true,
        displayOrder: 2,
      },
      {
        code: 'CANDIDATE_ANNUAL',
        planType: PremiumPlan.CANDIDATE_PREMIUM,
        billingCycle: PaymentBillingCycle.ANNUAL,
        name: 'Candidate Premium (1 Năm)',
        description: 'Gói trọn gói 12 tháng - Tiết kiệm 32%',
        price: 399000,
        originalPrice: 588000,
        durationDays: 365,
        aiQuota: 500,
        badge: 'Khuyên Dùng - Phổ Biến Nhất',
        features: [
          'Toàn bộ quyền lợi gói 6 Tháng',
          'Đẩy Top hồ sơ 365 ngày',
          'Tối ưu CV bởi chuyên gia AI',
          'AI Career Assistant: 500 lượt phân tích',
        ],
        hotJobLimit: 0,
        candidateSearchLimit: 0,
        isActive: true,
        displayOrder: 3,
      },
      {
        code: 'HR_MONTHLY',
        planType: PremiumPlan.HR_PREMIUM,
        billingCycle: PaymentBillingCycle.MONTHLY,
        name: 'HR Premium Enterprise (1 Tháng)',
        description: 'Tuyển dụng không giới hạn & AI Sourcing',
        price: 299000,
        originalPrice: 299000,
        durationDays: 30,
        aiQuota: 100,
        badge: null,
        features: [
          'Đăng tin tuyển dụng không giới hạn',
          'Gắn nhãn HOT JOB cho 3 vị trí',
          'Mở khóa tìm kiếm hồ sơ ứng viên nâng cao (50 CV/ngày)',
          'Huy hiệu Nhà tuyển dụng Uy tín Premium',
          'AI Matching phân tích độ phù hợp ứng viên',
        ],
        hotJobLimit: 3,
        candidateSearchLimit: 50,
        isActive: true,
        displayOrder: 4,
      },
      {
        code: 'HR_SEMI_ANNUAL',
        planType: PremiumPlan.HR_PREMIUM,
        billingCycle: PaymentBillingCycle.SEMI_ANNUAL,
        name: 'HR Premium Enterprise (6 Tháng)',
        description: 'Tiết kiệm 17% chi phí tuyển dụng cho doanh nghiệp',
        price: 1490000,
        originalPrice: 1794000,
        durationDays: 180,
        aiQuota: 500,
        badge: 'Tiết kiệm 17%',
        features: [
          'Đăng tin tuyển dụng không giới hạn',
          'Gắn nhãn HOT JOB cho 5 vị trí',
          'Mở khóa tìm kiếm 100 CV ứng viên/ngày',
          'Ưu tiên hiển thị tin tuyển dụng đầu trang tìm kiếm',
          'AI Matching: 500 lượt phân tích',
        ],
        hotJobLimit: 5,
        candidateSearchLimit: 100,
        isActive: true,
        displayOrder: 5,
      },
      {
        code: 'HR_ANNUAL',
        planType: PremiumPlan.HR_PREMIUM,
        billingCycle: PaymentBillingCycle.ANNUAL,
        name: 'HR Premium Enterprise (1 Năm)',
        description: 'Giải pháp tuyển dụng toàn diện 365 ngày cho doanh nghiệp bứt phá',
        price: 2390000,
        originalPrice: 3588000,
        durationDays: 365,
        aiQuota: 1500,
        badge: 'Lựa Chọn Hàng Đầu Của HR Pro',
        features: [
          'Đăng tin tuyển dụng không giới hạn 365 ngày',
          'Gắn nhãn HOT JOB cho 10 vị trí',
          'Không giới hạn mở khóa tìm kiếm CV ứng viên',
          'Tài khoản chuyên biệt chăm sóc 24/7',
          'AI Sourcing & Matching: 1500 lượt phân tích',
        ],
        hotJobLimit: 10,
        candidateSearchLimit: 999999,
        isActive: true,
        displayOrder: 6,
      },
    ];

    for (const pkg of defaultPackages) {
      await packageRepo.save(packageRepo.create(pkg));
    }
    console.log(`✓ Đã tạo ${defaultPackages.length} gói Premium mặc định.`);
  } else {
    console.log(`✓ Đã có ${packageCount} gói Premium trong database.`);
  }

  await AppDataSource.destroy();
  console.log('--- Hoàn tất seed Admin và Gói Premium! ---');
}

runSeedAdmin().catch((err) => {
  console.error('Lỗi khi seed admin:', err);
  process.exit(1);
});
