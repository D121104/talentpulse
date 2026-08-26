import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
import { User, PremiumPlan } from '../users/entities/user.entity';
import { Company } from '../companies/entities/company.entity';
import { Job } from '../jobs/entities/job.entity';
import { Application, ApplicationStatus } from '../applications/entities/application.entity';
import { UserCV } from '../usercvs/entities/usercv.entity';
import { Skill } from '../skills/entities/skill.entity';
import { Role } from '../decorator/customize';

dotenv.config();

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres123',
  database: process.env.DB_DATABASE || 'recruitment_db',
  entities: [User, Company, Job, Application, UserCV, Skill],
  synchronize: false,
});

async function runSeed() {
  console.log('--- Đang kết nối Cơ sở dữ liệu PostgreSQL ---');
  await AppDataSource.initialize();
  console.log('✓ Kết nối DB thành công!');

  const userRepo = AppDataSource.getRepository(User);
  const companyRepo = AppDataSource.getRepository(Company);
  const jobRepo = AppDataSource.getRepository(Job);
  const cvRepo = AppDataSource.getRepository(UserCV);
  const appRepo = AppDataSource.getRepository(Application);
  const skillRepo = AppDataSource.getRepository(Skill);

  const hashedPassword = bcrypt.hashSync('12345678', bcrypt.genSaltSync(10));

  // 1. Tạo hoặc lấy HR Trưởng (Lead HR - Gói HR_PREMIUM)
  const hrEmail = 'hr@talentpulse.com';
  let hrUser = await userRepo.findOne({ where: { email: hrEmail } });

  const oneYearLater = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  if (!hrUser) {
    hrUser = userRepo.create({
      email: hrEmail,
      password: hashedPassword,
      name: 'Trần Quốc An (HR Trưởng - Premium)',
      role: Role.HR,
      gender: 'male',
      age: 28,
      address: 'Cầu Giấy, Hà Nội',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
      isApproved: true,
      isLocked: false,
      isDeleted: false,
      isPremium: true,
      premiumPlan: PremiumPlan.HR_PREMIUM,
      premiumExpiresAt: oneYearLater,
      createdBy: { _id: 'system', email: 'system@talentpulse.com' },
    });
    hrUser = await userRepo.save(hrUser);
  } else {
    hrUser.name = 'Trần Quốc An (HR Trưởng - Premium)';
    hrUser.password = hashedPassword;
    hrUser.role = Role.HR;
    hrUser.isApproved = true;
    hrUser.isLocked = false;
    hrUser.isDeleted = false;
    hrUser.isPremium = true;
    hrUser.premiumPlan = PremiumPlan.HR_PREMIUM;
    hrUser.premiumExpiresAt = oneYearLater;
    hrUser.avatar = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80';
    hrUser = await userRepo.save(hrUser);
  }

  // 2. Seed Master Skills Dictionary vào bảng `skills`
  const initialSkills = [
    // Frontend
    'REACT',
    'TYPESCRIPT',
    'JAVASCRIPT',
    'NEXTJS',
    'VUEJS',
    'ANGULAR',
    'TAILWINDCSS',
    'HTML5/CSS3',
    'REDUX',
    'FIGMA',
    'UI/UX',
    
    // Backend & Frameworks
    'NODEJS',
    'NESTJS',
    'EXPRESSJS',
    'PYTHON',
    'FASTAPI',
    'DJANGO',
    'JAVA',
    'SPRING BOOT',
    'GOLANG',
    'C#',
    '.NET CORE',
    'PHP',
    'LARAVEL',
    
    // Database & Caching
    'POSTGRESQL',
    'MYSQL',
    'MONGODB',
    'REDIS',
    'ELASTICSEARCH',
    
    // Cloud, DevOps & Tools
    'DOCKER',
    'KUBERNETES',
    'AWS',
    'GCP',
    'AZURE',
    'CI/CD',
    'GIT',
    'LINUX',
    'KAFKA',
    'RABBITMQ',
    'MICROSERVICES',
    'RESTFUL API',
    'GRAPHQL',
    
    // AI / Data / Mobile
    'PYTORCH',
    'TENSORFLOW',
    'TRANSFORMERS',
    'NLP',
    'MACHINE LEARNING',
    'DEEP LEARNING',
    'FLUTTER',
    'REACT NATIVE',
    'SWIFT',
    'KOTLIN',
  ];

  let addedSkillCount = 0;
  for (const skillName of initialSkills) {
    const normalized = skillName.trim().toUpperCase();
    const existing = await skillRepo.findOne({ where: { name: normalized } });
    if (!existing) {
      const newSkill = skillRepo.create({
        name: normalized,
        isDeleted: false,
        createdBy: { _id: hrUser._id, email: hrUser.email },
      });
      await skillRepo.save(newSkill);
      addedSkillCount++;
    }
  }
  console.log(`✓ Đã đồng bộ Master Skills Catalog (${initialSkills.length} kỹ năng trong CSDL, thêm mới: ${addedSkillCount})`);

  // 3. Tạo hoặc Cập nhật Công ty Demo (do hrUser làm creator)
  let company = await companyRepo.findOne({
    where: { name: 'TalentPulse Technology Group' },
  });

  if (!company) {
    company = companyRepo.create({
      name: 'TalentPulse Technology Group',
      taxCode: '0109988776',
      scale: '100-500 nhân sự',
      address: 'Keangnam Landmark 72, Phạm Hùng, Cầu Giấy, Hà Nội',
      description:
        'Tập đoàn công nghệ và giải pháp tuyển dụng nhân sự ứng dụng trí tuệ nhân tạo hàng đầu Việt Nam.',
      logo: 'https://images.unsplash.com/photo-1549923746-c502d488b3ea?w=200&auto=format&fit=crop&q=60',
      usersFollow: [],
      isActive: true,
      isDeleted: false,
      createdBy: { _id: hrUser._id, email: hrUser.email },
      pendingHrs: [],
    });
    company = await companyRepo.save(company);
    console.log('✓ Đã tạo công ty demo:', company.name);
  } else {
    company.taxCode = '0109988776';
    company.scale = '100-500 nhân sự';
    company.address = 'Keangnam Landmark 72, Phạm Hùng, Cầu Giấy, Hà Nội';
    company.description =
      'Tập đoàn công nghệ và giải pháp tuyển dụng nhân sự ứng dụng trí tuệ nhân tạo hàng đầu Việt Nam.';
    company.logo = 'https://images.unsplash.com/photo-1549923746-c502d488b3ea?w=200&auto=format&fit=crop&q=60';
    company.isActive = true;
    company.isDeleted = false;
    company.createdBy = { _id: hrUser._id, email: hrUser.email };
    company = await companyRepo.save(company);
    console.log('✓ Đã cập nhật công ty demo:', company.name);
  }

  // Cập nhật company cho HR Trưởng
  hrUser.company = {
    _id: company._id,
    name: company.name,
    isActive: true,
  };
  await userRepo.save(hrUser);
  console.log('✓ Đã cấu hình HR Trưởng:', hrUser.email);

  // 4. Tạo HR Thành viên (HR Member - có thể rời công ty)
  const hrMemberEmail = 'hr.member@talentpulse.com';
  let hrMember = await userRepo.findOne({ where: { email: hrMemberEmail } });
  if (!hrMember) {
    hrMember = userRepo.create({
      email: hrMemberEmail,
      password: hashedPassword,
      name: 'Nguyễn Văn Nam (HR Thành viên)',
      role: Role.HR,
      gender: 'male',
      age: 26,
      address: 'Đống Đa, Hà Nội',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
      isApproved: true,
      isLocked: false,
      isDeleted: false,
      company: {
        _id: company._id,
        name: company.name,
        isActive: true,
      },
      createdBy: { _id: hrUser._id, email: hrUser.email },
    });
    hrMember = await userRepo.save(hrMember);
  } else {
    hrMember.company = {
      _id: company._id,
      name: company.name,
      isActive: true,
    };
    hrMember.isApproved = true;
    hrMember.isLocked = false;
    hrMember.isDeleted = false;
    hrMember = await userRepo.save(hrMember);
  }
  console.log('✓ Đã cấu hình HR Thành viên:', hrMember.email);

  // 5. Tạo HR Ứng tuyển đang chờ duyệt (Pending HR)
  const hrApplicantEmail = 'hr.applicant@talentpulse.com';
  let hrApplicant = await userRepo.findOne({ where: { email: hrApplicantEmail } });
  if (!hrApplicant) {
    hrApplicant = userRepo.create({
      email: hrApplicantEmail,
      password: hashedPassword,
      name: 'Lê Thị Thu Thảo (HR Đang chờ duyệt)',
      role: Role.HR,
      gender: 'female',
      age: 24,
      address: 'Thanh Xuân, Hà Nội',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&auto=format&fit=crop&q=80',
      isApproved: true,
      isLocked: false,
      isDeleted: false,
      createdBy: { _id: 'system', email: 'system@talentpulse.com' },
    });
    hrApplicant = await userRepo.save(hrApplicant);
  }

  // Thêm hrApplicant vào danh sách pendingHrs của công ty nếu chưa có
  const isAlreadyPending = (company.pendingHrs || []).some(
    (h: any) => h.userId === hrApplicant?._id || h.email === hrApplicantEmail,
  );
  if (!isAlreadyPending) {
    company.pendingHrs = [
      ...(company.pendingHrs || []),
      {
        userId: hrApplicant._id,
        name: hrApplicant.name,
        email: hrApplicant.email,
        avatar: hrApplicant.avatar,
        requestedAt: new Date(),
      },
    ];
    await companyRepo.save(company);
    console.log('✓ Đã thêm HR vào danh sách chờ duyệt công ty:', hrApplicant.email);
  }

  // 6. Tạo HR Tự do mới đăng ký (Chưa có công ty)
  const hrNewEmail = 'hr.new@talentpulse.com';
  let hrNew = await userRepo.findOne({ where: { email: hrNewEmail } });
  if (!hrNew) {
    hrNew = userRepo.create({
      email: hrNewEmail,
      password: hashedPassword,
      name: 'Hoàng Minh Đức (HR Chưa có Cty)',
      role: Role.HR,
      gender: 'male',
      age: 25,
      address: 'Hà Đông, Hà Nội',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&auto=format&fit=crop&q=80',
      isApproved: true,
      isLocked: false,
      isDeleted: false,
      createdBy: { _id: 'system', email: 'system@talentpulse.com' },
    });
    hrNew = await userRepo.save(hrNew);
    console.log('✓ Đã tạo HR Tự do chưa có cty:', hrNew.email);
  }

  // 7. Tạo các Tin tuyển dụng Demo
  let job1 = await jobRepo.findOne({
    where: { name: 'Senior Fullstack Developer (NodeJS / React)' },
  });
  if (!job1) {
    job1 = jobRepo.create({
      name: 'Senior Fullstack Developer (NodeJS / React)',
      skills: ['React', 'TypeScript', 'Node.js', 'NestJS', 'PostgreSQL', 'TailwindCSS', 'Redux', 'RESTful API'],
      company: {
        _id: company._id,
        name: company.name,
        logo: company.logo,
        isActive: true,
      },
      salary: 35000000,
      quantity: 3,
      level: 'SENIOR',
      description: `<h3>Mô tả công việc</h3>
<p>Chúng tôi đang tìm kiếm <strong>Senior Fullstack Developer</strong> dẫn dắt phát triển các tính năng lõi trên hệ thống TalentPulse.</p>
<ul>
  <li>Thiết kế và phát triển RESTful APIs & WebSocket services bằng NestJS/PostgreSQL.</li>
  <li>Xây dựng giao diện web mượt mà, tối ưu SEO bằng React, Vite, TailwindCSS.</li>
  <li>Tích hợp mô hình AI Matching xếp hạng ứng viên thời gian thực.</li>
</ul>
<h3>Yêu cầu ứng viên</h3>
<ul>
  <li>Tối thiểu 3+ năm kinh nghiệm Fullstack (Node.js & React).</li>
  <li>Thành thạo TypeScript, TypeORM/Prisma, PostgreSQL, Redis caching.</li>
  <li>Có tư duy Clean Architecture, SOLID và kỹ năng tối ưu hiệu năng web.</li>
</ul>`,
      location: 'Cầu Giấy, Hà Nội',
      startDate: new Date(),
      endDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
      isActive: true,
      isHot: true,
      boostedAt: new Date(),
      isDeleted: false,
      createdBy: { _id: hrUser._id, email: hrUser.email },
    });
    job1 = await jobRepo.save(job1);
  } else {
    job1.isHot = true;
    job1.boostedAt = new Date();
    job1 = await jobRepo.save(job1);
  }

  let job2 = await jobRepo.findOne({
    where: { name: 'AI / Machine Learning Engineer (Python & PyTorch)' },
  });
  if (!job2) {
    job2 = jobRepo.create({
      name: 'AI / Machine Learning Engineer (Python & PyTorch)',
      skills: ['Python', 'PyTorch', 'TensorFlow', 'FastAPI', 'Docker', 'NLP', 'Machine Learning', 'Transformers'],
      company: {
        _id: company._id,
        name: company.name,
        logo: company.logo,
        isActive: true,
      },
      salary: 42000000,
      quantity: 2,
      level: 'MIDDLE',
      description: `<h3>Mô tả công việc</h3>
<p>Tham gia phát triển hệ thống <strong>AI Recruitment Recommendation Engine</strong> phân tích CV và Job description.</p>
<ul>
  <li>Fine-tune các mô hình BERT/Transformers cho bài toán trích xuất thực thể (NER) và phân loại CV.</li>
  <li>Triển khai inference microservice với FastAPI và Docker.</li>
</ul>`,
      location: 'Cầu Giấy, Hà Nội',
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      isActive: true,
      isDeleted: false,
      createdBy: { _id: hrUser._id, email: hrUser.email },
    });
    job2 = await jobRepo.save(job2);
  }
  console.log('✓ Đã tạo các tin tuyển dụng demo');

  // 8. Tạo các Ứng viên và Hồ sơ ứng tuyển Demo
  const candidatesData = [
    {
      name: 'Nguyễn Văn Tuấn',
      email: 'tuan.nguyen.dev@gmail.com',
      skills: ['React', 'TypeScript', 'NodeJS'],
      status: ApplicationStatus.PENDING,
      job: job1,
      coverLetter:
        'Em có 4 năm kinh nghiệm làm việc với React và NestJS, rất mong muốn được thử sức tại TalentPulse.',
    },
    {
      name: 'Trần Thị Mai',
      email: 'mai.tran.ai@gmail.com',
      skills: ['Python', 'PyTorch', 'Transformers', 'FastAPI'],
      status: ApplicationStatus.REVIEWING,
      job: job2,
      coverLetter:
        'Tôi từng tham gia phát triển các mô hình NLP phân loại văn bản và xử lý ngôn ngữ tiếng Việt.',
    },
    {
      name: 'Phạm Hoàng Long',
      email: 'long.pham.fullstack@gmail.com',
      skills: ['React', 'NodeJS', 'PostgreSQL', 'Docker'],
      status: ApplicationStatus.CONSIDERING,
      job: job1,
      coverLetter:
        'Chào anh/chị HR, em có kinh nghiệm thiết kế kiến trúc microservices và triển khai hệ thống chịu tải cao.',
    },
    {
      name: 'Đặng Ngọc Ánh',
      email: 'anh.dang.nlp@gmail.com',
      skills: ['Python', 'NLP', 'TensorFlow', 'Machine Learning'],
      status: ApplicationStatus.APPROVED,
      job: job2,
      coverLetter:
        'Kính gửi TalentPulse, tôi có 3 năm nghiên cứu xử lý ngôn ngữ tự nhiên và sẵn sàng onboard ngay.',
    },
    {
      name: 'Vũ Quốc Huy',
      email: 'huy.vu.backend@gmail.com',
      skills: ['Java', 'Spring Boot', 'MySQL'],
      status: ApplicationStatus.REJECTED,
      job: job1,
      coverLetter:
        'Em có kinh nghiệm backend với Java/Spring Boot muốn chuyển dịch sang fullstack JS.',
    },
  ];

  for (const cand of candidatesData) {
    const isCandPremium = cand.email === 'tuan.nguyen.dev@gmail.com';
    let candidateUser = await userRepo.findOne({ where: { email: cand.email } });
    if (!candidateUser) {
      candidateUser = userRepo.create({
        email: cand.email,
        password: hashedPassword,
        name: cand.name,
        role: Role.USER,
        gender: 'male',
        age: 25,
        address: 'Hà Nội',
        isApproved: true,
        isLocked: false,
        isDeleted: false,
        isPremium: isCandPremium,
        premiumPlan: isCandPremium ? PremiumPlan.CANDIDATE_PREMIUM : PremiumPlan.FREE,
        premiumExpiresAt: isCandPremium ? oneYearLater : (null as any),
        createdBy: { _id: 'system', email: 'system@talentpulse.com' },
      });
      candidateUser = await userRepo.save(candidateUser);
    } else {
      candidateUser.isPremium = isCandPremium;
      candidateUser.premiumPlan = isCandPremium ? PremiumPlan.CANDIDATE_PREMIUM : PremiumPlan.FREE;
      candidateUser.premiumExpiresAt = isCandPremium ? oneYearLater : (null as any);
      candidateUser = await userRepo.save(candidateUser);
    }

    let cv = await cvRepo.findOne({ where: { userId: candidateUser._id } });
    if (!cv) {
      cv = cvRepo.create({
        userId: candidateUser._id,
        user: candidateUser,
        url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        title: `CV - ${cand.name}`,
        description: `Hồ sơ năng lực chuyên môn của ${cand.name}`,
        fileType: 'pdf',
        parsedText: `Ứng viên ${cand.name}, chuyên môn: ${cand.skills.join(', ')}. Kinh nghiệm làm việc 3 năm trong ngành phần mềm.`,
        skills: cand.skills,
        education: ['Đại học Bách Khoa Hà Nội (CNTT)'],
        experience: ['3 năm Software Engineer tại Top Fintech'],
        certificates: ['AWS Certified Solutions Architect', 'IELTS 7.0'],
        isPrimary: true,
        isDeleted: false,
        createdBy: { _id: candidateUser._id, email: candidateUser.email },
      });
      cv = await cvRepo.save(cv);
    }

    const existingApp = await appRepo.findOne({
      where: { userId: candidateUser._id, jobId: cand.job._id },
    });

    if (!existingApp) {
      const newApp = appRepo.create({
        userId: candidateUser._id,
        user: candidateUser,
        jobId: cand.job._id,
        job: cand.job,
        companyId: company._id,
        company: company,
        cvId: cv._id,
        cv: cv,
        coverLetter: cand.coverLetter,
        status: cand.status,
        history: [
          {
            status: cand.status,
            updatedAt: new Date(),
            updatedBy: { _id: hrUser._id, email: hrUser.email },
          },
        ],
        isDeleted: false,
      });
      await appRepo.save(newApp);
    }
  }

  console.log('✓ Đã tạo các hồ sơ ứng tuyển và ứng viên demo!');
  console.log('\n========================================');
  console.log('🎉 KHỞI TẠO SEED HR & COMPANY THÀNH CÔNG!');
  console.log('========================================');
  console.log('👑 HR Trưởng (Lead HR)     : hr@talentpulse.com        | Pass: 12345678 (Duyệt/Xóa HR, ko rời cty)');
  console.log('👤 HR Thành viên (Member)  : hr.member@talentpulse.com | Pass: 12345678 (Có nút Rời công ty)');
  console.log('⏳ HR Đang chờ duyệt (Join): hr.applicant@talentpulse.com| Pass: 12345678 (Nằm trong danh sách duyệt)');
  console.log('🆕 HR Mới tự do (No Comp)  : hr.new@talentpulse.com    | Pass: 12345678 (Tìm kiếm debounce hoặc Tạo cty)');
  console.log('🏢 Doanh nghiệp            : TalentPulse Technology Group (isActive: true)');
  console.log(`📦 Skills Catalog          : Đã nạp đầy đủ ${initialSkills.length} kỹ năng chuẩn vào bảng skills`);
  console.log('========================================\n');

  await AppDataSource.destroy();
}

runSeed().catch((err) => {
  console.error('Lỗi khi chạy seed:', err);
  process.exit(1);
});
