import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
import { User, PremiumPlan } from '../users/entities/user.entity';
import { OnlineCV } from '../online-cvs/entities/online-cv.entity';
import { UserCV } from '../usercvs/entities/usercv.entity';
import { Role } from '../decorator/customize';

dotenv.config();

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres123',
  database: process.env.DB_DATABASE || 'recruitment_db',
  entities: [User, OnlineCV, UserCV],
  synchronize: false,
});

async function runCandidateSeed() {
  console.log('\n======================================================');
  console.log('🚀 Đang kết nối Cơ sở dữ liệu để Seed Candidate Premium...');
  console.log('======================================================');

  await AppDataSource.initialize();
  console.log('✓ Kết nối PostgreSQL thành công!');

  const userRepo = AppDataSource.getRepository(User);
  const onlineCvRepo = AppDataSource.getRepository(OnlineCV);
  const userCvRepo = AppDataSource.getRepository(UserCV);

  const hashedPassword = bcrypt.hashSync('12345678', bcrypt.genSaltSync(10));
  const oneYearLater = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  // 1. TẠO TÀI KHOẢN ỨNG VIÊN PREMIUM
  const candidateEmail = 'candidate.premium@talentpulse.com';
  let candidate = await userRepo.findOne({ where: { email: candidateEmail } });

  const candidateData = {
    email: candidateEmail,
    password: hashedPassword,
    name: 'Nguyễn Văn Talent (Candidate Premium)',
    role: Role.USER,
    gender: 'male',
    age: 24,
    address: 'Quận 1, TP. Hồ Chí Minh',
    avatar:
      'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=250&auto=format&fit=crop&q=80',
    isApproved: true,
    isVerified: true,
    isLocked: false,
    isDeleted: false,
    isPremium: true,
    premiumPlan: PremiumPlan.CANDIDATE_PREMIUM,
    premiumExpiresAt: oneYearLater,
    isJobSeeking: true,
    isJobRecommendation: true,
    allowRecruiterSearch: true,
    boostCountToday: 0,
    createdBy: { _id: 'system', email: 'system@talentpulse.com' },
  };

  if (!candidate) {
    candidate = userRepo.create(candidateData);
    candidate = await userRepo.save(candidate);
    console.log(`✓ Đã tạo mới tài khoản Ứng viên: ${candidate.email}`);
  } else {
    Object.assign(candidate, candidateData);
    candidate = await userRepo.save(candidate);
    console.log(`✓ Đã cập nhật 1 Năm Premium cho tài khoản: ${candidate.email}`);
  }

  // 2. SEED ONLINE CVS CHO ỨNG VIÊN
  // Dọn dẹp CV cũ của ứng viên để seed bộ CV mẫu chuẩn đẹp
  await onlineCvRepo.delete({ userId: candidate._id });

  // CV 1: Fullstack Developer (Classic Template 1 - CV Chính)
  const cv1 = onlineCvRepo.create({
    userId: candidate._id,
    templateType: 'template1',
    isPrimary: true,
    isSearchable: true,
    isDeleted: false,
    fullName: 'NGUYỄN VĂN TALENT',
    position: 'Senior Full-Stack Developer',
    phone: '0912 345 678',
    email: candidate.email,
    link: 'https://github.com/talentpulse',
    address: 'Quận 1, TP. Hồ Chí Minh',
    avatar:
      'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=250&auto=format&fit=crop&q=80',
    careerObjective:
      'Kỹ sư phần mềm Full-Stack với 4+ năm kinh nghiệm chuyên sâu trong việc thiết kế và phát triển các hệ thống SaaS phân tán chịu tải cao (NestJS, React, PostgreSQL, Redis, Elasticsearch). Mục tiêu đóng góp chuyên môn kỹ thuật để tối ưu hiệu năng sản phẩm và trở thành Tech Lead trong 2 năm tới.',
    education: [
      {
        schoolName: 'Đại học Bách Khoa TP.HCM',
        major: 'Khoa học Máy tính (Chương trình Tiên tiến)',
        startDate: '09/2019',
        endDate: '06/2023',
        description: 'Tốt nghiệp loại Xuất sắc (GPA: 3.8/4.0). Đạt giải Nhì Olympic Tin học Sinh viên Toàn quốc.',
      },
    ],
    workExperience: [
      {
        companyName: 'TalentPulse Global SaaS Inc.',
        position: 'Senior Full-Stack Developer',
        startDate: '07/2023',
        endDate: 'Hiện tại',
        description:
          '• Trực tiếp thiết kế kiến trúc Backend NestJS kết hợp Bull Queue và Redis giải quyết bài toán xử lý nền bất đồng bộ cho hàng triệu hồ sơ.\n• Triển khai bộ máy tìm kiếm Elasticsearch và AI Embedding matching (Transformers) giúp tăng độ chính xác gợi ý việc làm lên 42%.\n• Tối ưu hệ thống rendering PDF bằng Puppeteer Headless đạt chuẩn in ấn A4 sắc nét trong dưới 1.5 giây.',
      },
      {
        companyName: 'FPT Software',
        position: 'Software Engineer',
        startDate: '06/2022',
        endDate: '06/2023',
        description:
          '• Tham gia phát triển hệ thống Core Banking cho khách hàng Nhật Bản sử dụng TypeScript, Node.js và PostgreSQL.\n• Viết Unit Test và Integration Test với Jest đạt độ bao phủ code coverage > 85%.',
      },
    ],
    skills: [
      { name: 'Ngôn ngữ', description: 'TypeScript, JavaScript, Python, SQL, HTML5/CSS3' },
      { name: 'Frontend', description: 'React.js, Next.js, TailwindCSS, Framer Motion, Redux Toolkit' },
      { name: 'Backend & DB', description: 'NestJS, Express, PostgreSQL, TypeORM, Redis, Elasticsearch' },
      { name: 'DevOps & Tooling', description: 'Docker, Docker Compose, Git, CI/CD, Kafka, PayOS' },
    ],
    activities: [
      {
        organizationName: 'Cộng đồng Open Source Vietnam',
        position: 'Core Contributor & Speaker',
        startDate: '2023',
        endDate: '2024',
        description: 'Diễn giả chia sẻ chuyên đề "Xây dựng hệ thống SaaS chịu tải cao với NestJS và Redis" thu hút hơn 500 người tham dự.',
      },
    ],
    certificates: [
      { name: 'AWS Certified Solutions Architect – Associate (SAA-C03)', date: '10/2023' },
      { name: 'IELTS Academic 7.5 (Listening: 8.0, Reading: 8.0)', date: '04/2023' },
    ],
    awards: [
      { name: 'Giải Nhì Olympic Tin học Sinh viên Toàn quốc', date: '2022' },
      { name: 'Best Innovation Developer of the Year tại TalentPulse', date: '2024' },
    ],
    createdBy: { _id: candidate._id, email: candidate.email },
  });

  // CV 2: AI & Data Solutions (Modern Template 2)
  const cv2 = onlineCvRepo.create({
    userId: candidate._id,
    templateType: 'template2',
    isPrimary: false,
    isSearchable: true,
    isDeleted: false,
    fullName: 'NGUYỄN VĂN TALENT',
    position: 'AI & Data Solutions Engineer',
    phone: '0912 345 678',
    email: candidate.email,
    link: 'https://linkedin.com/in/talentpulse-vn',
    address: 'Quận 1, TP. Hồ Chí Minh',
    avatar:
      'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=250&auto=format&fit=crop&q=80',
    careerObjective:
      'Đam mê ứng dụng Generative AI, Transformer Embeddings và xử lý ngôn ngữ tự nhiên (NLP) vào các sản phẩm công nghệ tuyển dụng thương mại.',
    education: [
      {
        schoolName: 'Đại học Bách Khoa TP.HCM',
        major: 'Kỹ thuật Phần mềm & Trí tuệ Nhân tạo',
        startDate: '2019',
        endDate: '2023',
        description: 'GPA: 3.8/4.0',
      },
    ],
    workExperience: [
      {
        companyName: 'AI Innovation Lab',
        position: 'AI Engineer',
        startDate: '2023',
        endDate: 'Hiện tại',
        description: 'Nghiên cứu và tinh chỉnh các mô hình ONNX Transformers phục vụ bài toán so khớp văn bản thời gian thực.',
      },
    ],
    skills: [
      { name: 'AI / ML', description: 'Transformers, ONNX Runtime, HuggingFace, Vector Embeddings, Cosine Matching' },
      { name: 'Web Stack', description: 'NestJS, React, TypeScript, PostgreSQL' },
    ],
    activities: [],
    certificates: [{ name: 'DeepLearning.AI TensorFlow Developer Professional Certificate', date: '2023' }],
    awards: [],
    createdBy: { _id: candidate._id, email: candidate.email },
  });

  await onlineCvRepo.save([cv1, cv2]);
  console.log('✓ Đã tạo 2 CV Online chuẩn mẫu cho Ứng viên (CV 1 là CV Chính ⭐)');

  // 3. SEED UPLOADED CV (PDF)
  await userCvRepo.delete({ userId: candidate._id });
  const uploadedCv = userCvRepo.create({
    userId: candidate._id,
    title: 'CV-Nguyen-Van-Talent-Fullstack-2026.pdf',
    url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    fileType: 'PDF',
    isPrimary: false,
    isSearchable: true,
    isDeleted: false,
    createdBy: { _id: candidate._id, email: candidate.email },
  });
  await userCvRepo.save(uploadedCv);
  console.log('✓ Đã tạo 1 CV PDF Tải lên cho Ứng viên');

  console.log('\n======================================================');
  console.log('🎉 SEED DỮ LIỆU ỨNG VIÊN PREMIUM HOÀN TẤT THÀNH CÔNG!');
  console.log('======================================================');
  console.log('📋 THÔNG TIN ĐĂNG NHẬP TEST:');
  console.log(`• Email       : \x1b[36m${candidate.email}\x1b[0m`);
  console.log(`• Mật khẩu    : \x1b[33m12345678\x1b[0m`);
  console.log(`• Vai trò     : \x1b[32mUSER (Ứng viên)\x1b[0m`);
  console.log(`• Cấp tài khoản: \x1b[35m👑 CANDIDATE PREMIUM (Thời hạn 1 Năm đến ${oneYearLater.toLocaleDateString('vi-VN')})\x1b[0m`);
  console.log(`• Trạng thái  : \x1b[32mĐã Xác Thực (isVerified = true)\x1b[0m`);
  console.log('======================================================\n');

  await AppDataSource.destroy();
}

runCandidateSeed().catch((err) => {
  console.error('❌ Lỗi trong quá trình seed candidate:', err);
  process.exit(1);
});
