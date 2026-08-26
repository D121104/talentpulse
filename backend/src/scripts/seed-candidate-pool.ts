import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
import { User, PremiumPlan } from '../users/entities/user.entity';
import { Company } from '../companies/entities/company.entity';
import { Job } from '../jobs/entities/job.entity';
import { OnlineCV } from '../online-cvs/entities/online-cv.entity';
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
  entities: [User, Company, Job, OnlineCV, UserCV, Skill],
  synchronize: false,
});

const CANDIDATES_DATA = [
  // --- 1. IT & SOFTWARE (6 Ứng viên) ---
  {
    email: 'long.le.frontend@talentpulse.com',
    name: 'Lê Hoàng Long',
    gender: 'male',
    age: 26,
    address: 'Quận Cầu Giấy, Hà Nội',
    avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=200&auto=format&fit=crop&q=80',
    title: 'Senior Frontend Architect (React/Next.js)',
    isBoosted: true,
    isPremium: true,
    skills: ['React', 'Next.js', 'TypeScript', 'TailwindCSS', 'Redux Toolkit', 'GraphQL', 'Vite'],
    careerObjective: 'Kỹ sư Frontend với 4 năm kinh nghiệm chuyên sâu về React/Next.js và tối ưu hóa trải nghiệm người dùng trên các hệ thống SaaS quy mô lớn.',
    education: [{ schoolName: 'Đại học Bách Khoa Hà Nội', major: 'Công nghệ Thông tin', startDate: '09/2018', endDate: '06/2022' }],
    workExperience: [
      { companyName: 'VNG Corporation', position: 'Senior Frontend Developer', startDate: '07/2022', endDate: 'Hiện tại', description: 'Chịu trách nhiệm kiến trúc Frontend cổng thanh toán ZaloPay, tối ưu FCP < 0.8s.' },
      { companyName: 'Sapo Technology', position: 'Frontend Developer', startDate: '06/2020', endDate: '06/2022', description: 'Phát triển giao diện quản lý bán hàng đa kênh POS bằng React và TypeScript.' }
    ]
  },
  {
    email: 'minhanh.tran.backend@talentpulse.com',
    name: 'Trần Thị Minh Anh',
    gender: 'female',
    age: 25,
    address: 'Quận 1, TP. Hồ Chí Minh',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
    title: 'Backend Engineer (NestJS / Golang)',
    isBoosted: false,
    isPremium: true,
    skills: ['NestJS', 'Golang', 'Node.js', 'PostgreSQL', 'Redis', 'Docker', 'Microservices', 'Kafka'],
    careerObjective: 'Lập trình viên Backend định hướng phát triển kiến trúc Microservices phân tán chịu tải cao và hệ thống Event-driven với Kafka.',
    education: [{ schoolName: 'Đại học Khoa học Tự nhiên TP.HCM', major: 'Khoa học Máy tính', startDate: '09/2019', endDate: '06/2023' }],
    workExperience: [
      { companyName: 'Tiki Corporation', position: 'Backend Software Engineer', startDate: '07/2023', endDate: 'Hiện tại', description: 'Thiết kế API thanh toán và xử lý đơn hàng chịu tải 50,000 req/s dịp Mega Sale.' },
      { companyName: 'KMS Technology', position: 'Junior Backend Developer', startDate: '06/2022', endDate: '06/2023', description: 'Xây dựng RESTful API và tối ưu câu truy vấn TypeORM PostgreSQL.' }
    ]
  },
  {
    email: 'quangduc.pham.devops@talentpulse.com',
    name: 'Phạm Quang Đức',
    gender: 'male',
    age: 28,
    address: 'Quận Thanh Xuân, Hà Nội',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
    title: 'Senior DevOps & Cloud Architect (AWS/K8s)',
    isBoosted: false,
    isPremium: false,
    skills: ['AWS', 'Kubernetes', 'Docker', 'Terraform', 'CI/CD', 'Linux', 'Prometheus', 'Grafana'],
    careerObjective: 'Chuyên gia DevOps 5+ năm kinh nghiệm quản trị hạ tầng Cloud AWS và triển khai tự động hóa CI/CD cho các doanh nghiệp Fintech.',
    education: [{ schoolName: 'Học viện Công nghệ Bưu chính Viễn thông', major: 'An toàn Thông tin', startDate: '09/2016', endDate: '06/2020' }],
    workExperience: [
      { companyName: 'One Mount Group', position: 'DevOps Lead', startDate: '08/2022', endDate: 'Hiện tại', description: 'Quản lý cụm Kubernetes EKS 50+ nodes, giảm chi phí Cloud hạ tầng xuống 35%.' },
      { companyName: 'FPT Software', position: 'Cloud Engineer', startDate: '06/2020', endDate: '07/2022', description: 'Triển khai hạ tầng AWS bằng Terraform và viết pipeline CI/CD Gitlab.' }
    ]
  },
  {
    email: 'haidang.vu.mobile@talentpulse.com',
    name: 'Vũ Hải Đăng',
    gender: 'male',
    age: 25,
    address: 'Quận Bình Thạnh, TP. Hồ Chí Minh',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&auto=format&fit=crop&q=80',
    title: 'Mobile App Developer (Flutter & React Native)',
    isBoosted: false,
    isPremium: false,
    skills: ['Flutter', 'Dart', 'React Native', 'iOS', 'Android', 'Firebase', 'State Management (BLoC/Riverpod)'],
    careerObjective: 'Lập trình viên ứng dụng di động đa nền tảng với hơn 2.5 năm kinh nghiệm đưa 5+ ứng dụng lên Google Play & Apple App Store.',
    education: [{ schoolName: 'Đại học FPT TP.HCM', major: 'Kỹ thuật Phần mềm', startDate: '09/2019', endDate: '06/2023' }],
    workExperience: [
      { companyName: 'Amanotes Vietnam', position: 'Flutter Developer', startDate: '07/2023', endDate: 'Hiện tại', description: 'Phát triển game âm nhạc tương tác với hơn 5 triệu lượt tải.' }
    ]
  },
  {
    email: 'thutrang.nguyen.ai@talentpulse.com',
    name: 'Nguyễn Thu Trang',
    gender: 'female',
    age: 24,
    address: 'Quận Đống Đa, Hà Nội',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&auto=format&fit=crop&q=80',
    title: 'AI & Data Solutions Engineer (NLP / LLMs)',
    isBoosted: true,
    isPremium: false,
    skills: ['Python', 'PyTorch', 'Transformers', 'ONNX', 'NLP', 'Vector Database', 'FastAPI', 'LangChain'],
    careerObjective: 'Kỹ sư AI ứng dụng mô hình ngôn ngữ lớn (LLMs) và RAG vào giải pháp tìm kiếm thông minh và phân tích văn bản.',
    education: [{ schoolName: 'Đại học Quốc gia Hà Nội', major: 'Khoa học Dữ liệu & Trí tuệ Nhân tạo', startDate: '09/2020', endDate: '06/2024' }],
    workExperience: [
      { companyName: 'VinAI Research', position: 'AI Engineer', startDate: '07/2024', endDate: 'Hiện tại', description: 'Phát triển hệ thống RAG cho trợ lý ảo doanh nghiệp, đạt độ chính xác trích xuất 94%.' }
    ]
  },
  {
    email: 'tuankiet.dang.qa@talentpulse.com',
    name: 'Đặng Tuấn Kiệt',
    gender: 'male',
    age: 27,
    address: 'Quận Tân Bình, TP. Hồ Chí Minh',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&auto=format&fit=crop&q=80',
    title: 'Senior QA / Automation Tester',
    isBoosted: false,
    isPremium: false,
    skills: ['Automation Testing', 'Selenium', 'Cypress', 'Playwright', 'Jest', 'Postman', 'Performance Testing (JMeter)'],
    careerObjective: 'Chuyên viên kiểm thử tự động hóa 3 năm kinh nghiệm xây dựng Automation Framework từ đầu cho web và mobile.',
    education: [{ schoolName: 'Đại học Công nghiệp TP.HCM', major: 'Hệ thống Thông tin', startDate: '09/2017', endDate: '06/2021' }],
    workExperience: [
      { companyName: 'NashTech Vietnam', position: 'Senior Automation QA', startDate: '08/2022', endDate: 'Hiện tại', description: 'Xây dựng bộ test Playwright tự động chạy hàng ngày trong CI pipeline, giảm 60% lỗi hồi quy.' },
      { companyName: 'Global CyberSoft', position: 'Manual & QC Engineer', startDate: '06/2021', endDate: '07/2022', description: 'Kiểm thử chức năng và tích hợp cho hệ thống quản lý logistics.' }
    ]
  },

  // --- 2. SALES & KINH DOANH (4 Ứng viên) ---
  {
    email: 'hoangnam.bds@talentpulse.com',
    name: 'Nguyễn Hoàng Nam',
    gender: 'male',
    age: 30,
    address: 'Quận 2, TP. Hồ Chí Minh',
    avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=200&auto=format&fit=crop&q=80',
    title: 'Trưởng nhóm Kinh doanh Bất động sản (Real Estate Sales Lead)',
    isBoosted: true,
    isPremium: true,
    skills: ['Bất động sản', 'Kinh doanh', 'Đàm phán', 'Chốt sale', 'Quản lý đội ngũ', 'Chăm sóc khách hàng VIP', 'Phát triển thị trường'],
    careerObjective: 'Hơn 5 năm kinh nghiệm dẫn dắt đội ngũ môi giới bất động sản cao cấp, đạt danh hiệu Top 1 Best Seller năm 2023 với doanh số trên 150 tỷ VNĐ.',
    education: [{ schoolName: 'Đại học Kinh tế TP.HCM', major: 'Quản trị Kinh doanh', startDate: '09/2014', endDate: '06/2018' }],
    workExperience: [
      { companyName: 'Đất Xanh Group', position: 'Trưởng phòng Kinh doanh', startDate: '06/2021', endDate: 'Hiện tại', description: 'Quản lý team 15 chuyên viên, trực tiếp phân phối thành công 120 căn hộ cao cấp khu Đông TP.HCM.' },
      { companyName: 'CenLand', position: 'Chuyên viên Tư vấn BĐS', startDate: '07/2018', endDate: '05/2021', description: 'Tư vấn phân khúc biệt thự nghỉ dưỡng và shophouse thương mại.' }
    ]
  },
  {
    email: 'bichngoc.salesb2b@talentpulse.com',
    name: 'Đỗ Thị Bích Ngọc',
    gender: 'female',
    age: 26,
    address: 'Quận Hai Bà Trưng, Hà Nội',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200&auto=format&fit=crop&q=80',
    title: 'Chuyên viên Kinh doanh B2B & Quản lý Khách hàng Doanh nghiệp',
    isBoosted: false,
    isPremium: true,
    skills: ['Sales B2B', 'Tư vấn giải pháp', 'Kỹ năng đàm phán', 'Kinh doanh', 'Telesale', 'CRM Salesforce', 'Thuyết trình'],
    careerObjective: 'Chuyên viên kinh doanh giải pháp phần mềm B2B với 3 năm kinh nghiệm ký kết các hợp đồng doanh nghiệp lớn.',
    education: [{ schoolName: 'Đại học Ngoại thương Hà Nội', major: 'Kinh tế Quốc tế', startDate: '09/2018', endDate: '06/2022' }],
    workExperience: [
      { companyName: 'MISA JSC', position: 'Account Executive B2B', startDate: '07/2022', endDate: 'Hiện tại', description: 'Khai thác và chốt hợp đồng phần mềm hóa đơn điện tử cho 80+ doanh nghiệp vừa và lớn.' }
    ]
  },
  {
    email: 'thai.hoang.financialsales@talentpulse.com',
    name: 'Hoàng Văn Thái',
    gender: 'male',
    age: 29,
    address: 'Quận Hoàn Kiếm, Hà Nội',
    avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200&auto=format&fit=crop&q=80',
    title: 'Chuyên viên Tư vấn Tài chính & Bảo hiểm Cao cấp (MDRT)',
    isBoosted: false,
    isPremium: false,
    skills: ['Tư vấn tài chính', 'Bán hàng', 'Bảo hiểm nhân thọ', 'Chăm sóc khách hàng VIP', 'Lập kế hoạch tài chính', 'Telesales'],
    careerObjective: '4 năm kinh nghiệm tư vấn giải pháp quản lý gia sản và bảo hiểm, 2 năm liên tiếp đạt danh hiệu MDRT danh giá.',
    education: [{ schoolName: 'Học viện Tài chính', major: 'Tài chính - Ngân hàng', startDate: '09/2015', endDate: '06/2019' }],
    workExperience: [
      { companyName: 'Manulife Vietnam', position: 'Chuyên viên Hoạch định Tài chính Cấp cao', startDate: '08/2020', endDate: 'Hiện tại', description: 'Quản lý danh mục 300+ khách hàng cá nhân cao cấp, doanh số phí bảo hiểm năm đạt 3.5 tỷ VNĐ.' }
    ]
  },
  {
    email: 'mylinh.telesales@talentpulse.com',
    name: 'Lê Mỹ Linh',
    gender: 'female',
    age: 23,
    address: 'Quận Tân Phú, TP. Hồ Chí Minh',
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=200&auto=format&fit=crop&q=80',
    title: 'Chuyên viên Telesales & Chăm sóc Khách hàng (CSKH)',
    isBoosted: false,
    isPremium: false,
    skills: ['Telesale', 'Chăm sóc khách hàng', 'Kỹ năng giao tiếp', 'Xử lý phản hồi', 'Bán hàng qua điện thoại', 'Data Entry'],
    careerObjective: 'Kỹ năng giao tiếp truyền cảm, kiên nhẫn, luôn vượt chỉ tiêu cuộc gọi và tỷ lệ chuyển đổi khách hàng tiềm năng > 25%.',
    education: [{ schoolName: 'Đại học Mở TP.HCM', major: 'Quản trị Văn phòng', startDate: '09/2020', endDate: '06/2024' }],
    workExperience: [
      { companyName: 'California Fitness & Yoga', position: 'Telesales Consultant', startDate: '07/2024', endDate: 'Hiện tại', description: 'Thực hiện trung bình 100 cuộc gọi/ngày, đạt tỷ lệ hẹn lịch tham quan thành công 30%.' }
    ]
  },

  // --- 3. MARKETING & MEDIA (4 Ứng viên) ---
  {
    email: 'quochuy.marketing@talentpulse.com',
    name: 'Trần Quốc Huy',
    gender: 'male',
    age: 27,
    address: 'Quận Ba Đình, Hà Nội',
    avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=200&auto=format&fit=crop&q=80',
    title: 'Senior Digital Marketing Specialist & Performance Ads Lead',
    isBoosted: true,
    isPremium: true,
    skills: ['Marketing', 'Facebook Ads', 'Google Ads', 'TikTok Ads', 'Digital Marketing', 'SEO', 'Conversion Rate Optimization (CRO)', 'Analytics'],
    careerObjective: '4 năm kinh nghiệm quản lý ngân sách quảng cáo Performance trên 2 tỷ VNĐ/tháng, tối ưu chỉ số ROAS > 4.5.',
    education: [{ schoolName: 'Đại học Thương mại', major: 'Marketing & Thương mại Điện tử', startDate: '09/2017', endDate: '06/2021' }],
    workExperience: [
      { companyName: 'AdAsia Digital Agency', position: 'Performance Marketing Lead', startDate: '08/2021', endDate: 'Hiện tại', description: 'Lên chiến lược chạy ads đa kênh cho các nhãn hàng FMCG và E-commerce hàng đầu.' }
    ]
  },
  {
    email: 'ngocanh.content@talentpulse.com',
    name: 'Phan Ngọc Ánh',
    gender: 'female',
    age: 25,
    address: 'Quận 3, TP. Hồ Chí Minh',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&auto=format&fit=crop&q=80',
    title: 'Content Creator & Social Media Strategist',
    isBoosted: false,
    isPremium: false,
    skills: ['Marketing', 'Content Marketing', 'Copywriting', 'Social Media', 'Kịch bản TikTok', 'SEO Content', 'Canva', 'Storytelling'],
    careerObjective: 'Biên tập viên nội dung sáng tạo với hơn 2.5 năm kinh nghiệm sản xuất video ngắn TikTok đạt hàng triệu lượt xem.',
    education: [{ schoolName: 'Đại học Khoa học Xã hội & Nhân văn TP.HCM', major: 'Báo chí & Truyền thông', startDate: '09/2019', endDate: '06/2023' }],
    workExperience: [
      { companyName: 'Điền Quân Media', position: 'Creative Content Executive', startDate: '07/2023', endDate: 'Hiện tại', description: 'Xây dựng kênh TikTok doanh nghiệp từ 0 lên 250,000 người theo dõi trong 6 tháng.' }
    ]
  },
  {
    email: 'hoainam.seo@talentpulse.com',
    name: 'Võ Hoài Nam',
    gender: 'male',
    age: 28,
    address: 'Quận Gò Vấp, TP. Hồ Chí Minh',
    avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&auto=format&fit=crop&q=80',
    title: 'Senior SEO & Inbound Marketing Manager',
    isBoosted: false,
    isPremium: false,
    skills: ['SEO', 'Digital Marketing', 'Google Search Console', 'Ahrefs', 'Technical SEO', 'Content Strategy', 'Google Analytics 4', 'WordPress'],
    careerObjective: '5 năm kinh nghiệm SEO tổng thể đưa hàng nghìn từ khóa cạnh tranh cao lọt Top 1 - 3 Google bền vững.',
    education: [{ schoolName: 'Đại học Sư phạm Kỹ thuật TP.HCM', major: 'Công nghệ Thông tin', startDate: '09/2016', endDate: '06/2020' }],
    workExperience: [
      { companyName: 'GTV SEO Agency', position: 'SEO Project Manager', startDate: '07/2020', endDate: 'Hiện tại', description: 'Triển khai dự án SEO cho 40+ đối tác, tăng lưu lượng truy cập tự nhiên (Organic Traffic) trung bình 300%.' }
    ]
  },
  {
    email: 'ducduy.brand@talentpulse.com',
    name: 'Nguyễn Đức Duy',
    gender: 'male',
    age: 24,
    address: 'Quận Tây Hồ, Hà Nội',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200&auto=format&fit=crop&q=80',
    title: 'Brand Marketing & Communications Executive',
    isBoosted: false,
    isPremium: false,
    skills: ['Marketing', 'Branding', 'Truyền thông thương hiệu', 'Tổ chức sự kiện', 'PR Báo chí', 'Media Planning', 'Sáng tạo'],
    careerObjective: 'Năng động, tư duy thị giác tốt, đam mê xây dựng câu chuyện thương hiệu truyền cảm hứng và gia tăng nhận diện nhãn hàng.',
    education: [{ schoolName: 'Học viện Báo chí & Tuyên truyền', major: 'Quan hệ Công chúng (PR)', startDate: '09/2020', endDate: '06/2024' }],
    workExperience: [
      { companyName: 'Tập đoàn Sunhouse', position: 'Brand Executive', startDate: '07/2024', endDate: 'Hiện tại', description: 'Phối hợp tổ chức chuỗi sự kiện ra mắt bộ sưu tập gia dụng thu hút hơn 2,000 khách tham quan.' }
    ]
  },

  // --- 4. TÀI CHÍNH & KẾ TOÁN (2 Ứng viên) ---
  {
    email: 'maihuong.ketoan@talentpulse.com',
    name: 'Bùi Thị Mai Hương',
    gender: 'female',
    age: 28,
    address: 'Quận Nam Từ Liêm, Hà Nội',
    avatar: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=200&auto=format&fit=crop&q=80',
    title: 'Kế toán Tổng hợp (Senior Accountant)',
    isBoosted: false,
    isPremium: true,
    skills: ['Kế toán', 'Kế toán tổng hợp', 'Báo cáo tài chính', 'Thuế GTGT/TNDN', 'Phần mềm MISA', 'Quyết toán thuế', 'FAST Accounting'],
    careerObjective: '4.5 năm kinh nghiệm lập báo cáo tài chính, quyết toán thuế và kiểm soát chi phí doanh nghiệp chính xác tuyệt đối.',
    education: [{ schoolName: 'Học viện Tài chính', major: 'Kế toán Doanh nghiệp', startDate: '09/2016', endDate: '06/2020' }],
    workExperience: [
      { companyName: 'Công ty Cổ phần Vận tải Á Châu', position: 'Kế toán Tổng hợp', startDate: '07/2020', endDate: 'Hiện tại', description: 'Chịu trách nhiệm toàn bộ sổ sách kế toán, lập báo cáo tài chính năm và làm việc trực tiếp với đoàn thanh tra thuế.' }
    ]
  },
  {
    email: 'quocbao.financial@talentpulse.com',
    name: 'Lâm Quốc Bảo',
    gender: 'male',
    age: 26,
    address: 'Quận 7, TP. Hồ Chí Minh',
    avatar: 'https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?w=200&auto=format&fit=crop&q=80',
    title: 'Chuyên viên Phân tích Tài chính Doanh nghiệp (Financial Analyst)',
    isBoosted: false,
    isPremium: false,
    skills: ['Tài chính', 'Phân tích tài chính', 'Lập mô hình tài chính (Financial Modeling)', 'Excel nâng cao', 'Định giá doanh nghiệp', 'Quản trị dòng tiền'],
    careerObjective: 'Chuyên viên phân tích tài chính với 3 năm kinh nghiệm xây dựng mô hình dự báo doanh thu và đánh giá hiệu quả đầu tư dự án.',
    education: [{ schoolName: 'Đại học RMIT Việt Nam', major: 'Kinh tế & Tài chính', startDate: '09/2018', endDate: '06/2022' }],
    workExperience: [
      { companyName: 'PwC Vietnam', position: 'Financial Advisory Associate', startDate: '07/2022', endDate: 'Hiện tại', description: 'Thực hiện thẩm định tài chính (Due Diligence) cho 10+ thương vụ M&A trong khu vực.' }
    ]
  },

  // --- 5. THIẾT KẾ & SÁNG TẠO (2 Ứng viên) ---
  {
    email: 'thaonhi.uiux@talentpulse.com',
    name: 'Dương Thảo Nhi',
    gender: 'female',
    age: 27,
    address: 'Quận 4, TP. Hồ Chí Minh',
    avatar: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=200&auto=format&fit=crop&q=80',
    title: 'Senior UI/UX & Product Designer',
    isBoosted: true,
    isPremium: true,
    skills: ['UI/UX', 'Figma', 'Design System', 'User Research', 'Wireframing', 'Prototyping', 'Thiết kế', 'Micro-interactions'],
    careerObjective: '4 năm kinh nghiệm thiết kế giao diện sản phẩm số, am hiểu sâu sắc Design System và tối ưu hóa luồng trải nghiệm người dùng.',
    education: [{ schoolName: 'Đại học Kiến trúc TP.HCM', major: 'Thiết kế Đồ họa (Graphic Design)', startDate: '09/2017', endDate: '06/2021' }],
    workExperience: [
      { companyName: 'MoMo E-Wallet', position: 'Senior Product Designer', startDate: '08/2021', endDate: 'Hiện tại', description: 'Trực tiếp phụ trách thiết kế tính năng Ví Trả Sau và chuyển tiền P2P phục vụ hơn 10 triệu người dùng.' }
    ]
  },
  {
    email: 'trongphuc.graphic@talentpulse.com',
    name: 'Đinh Trọng Phúc',
    gender: 'male',
    age: 25,
    address: 'Quận Long Biên, Hà Nội',
    avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=200&auto=format&fit=crop&q=80',
    title: 'Graphic & Motion Designer (2D/3D)',
    isBoosted: false,
    isPremium: false,
    skills: ['Thiết kế', 'Photoshop', 'Illustrator', 'After Effects', 'Premiere Pro', '3D Blender', 'Motion Graphics', 'Typography'],
    careerObjective: '3 năm kinh nghiệm sản xuất visual quảng cáo sáng tạo, video animation và bộ nhận diện thương hiệu ấn tượng.',
    education: [{ schoolName: 'Đại học Mỹ thuật Công nghiệp Hà Nội', major: 'Thiết kế Mỹ thuật Ứng dụng', startDate: '09/2019', endDate: '06/2023' }],
    workExperience: [
      { companyName: 'Ogilvy Vietnam', position: 'Graphic & Motion Designer', startDate: '07/2023', endDate: 'Hiện tại', description: 'Sáng tạo bộ banner và video motion 3D cho các chiến dịch ra mắt sản phẩm mới của Unilever và Samsung.' }
    ]
  },

  // --- 6. NHÂN SỰ & TUYỂN DỤNG (2 Ứng viên) ---
  {
    email: 'thanhhuyen.hr@talentpulse.com',
    name: 'Nguyễn Thanh Huyền',
    gender: 'female',
    age: 26,
    address: 'Quận Cầu Giấy, Hà Nội',
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=200&auto=format&fit=crop&q=80',
    title: 'IT Talent Acquisition Specialist (Headhunter)',
    isBoosted: false,
    isPremium: true,
    skills: ['Nhân sự', 'Tuyển dụng', 'IT Recruitment', 'Headhunter', 'Sourcing LinkedIn', 'Đàm phán lương', 'Employer Branding', 'HR'],
    careerObjective: 'Chuyên gia săn đầu người (Headhunter) ngành IT với mạng lưới hơn 5,000 kỹ sư phần mềm cao cấp tại Việt Nam và Đông Nam Á.',
    education: [{ schoolName: 'Đại học Lao động - Xã hội', major: 'Quản trị Nhân lực', startDate: '09/2018', endDate: '06/2022' }],
    workExperience: [
      { companyName: 'Navigos Group (VietnamWorks)', position: 'Senior IT Recruitment Consultant', startDate: '07/2022', endDate: 'Hiện tại', description: 'Tuyển dụng thành công 45+ vị trí Tech Lead, Solution Architect cho các tập đoàn quốc tế.' }
    ]
  },
  {
    email: 'vanthinh.cb@talentpulse.com',
    name: 'Lê Văn Thịnh',
    gender: 'male',
    age: 28,
    address: 'Quận Bình Thạnh, TP. Hồ Chí Minh',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
    title: 'Chuyên viên C&B & Pháp chế Lao động (HR Generalist)',
    isBoosted: false,
    isPremium: false,
    skills: ['Nhân sự', 'C&B', 'Tiền lương & BHXH', 'Luật lao động', 'Đánh giá KPI', 'Nội quy lao động', 'HR', 'Excel nhân sự'],
    careerObjective: '4 năm kinh nghiệm quản lý chính sách tiền lương, phúc lợi C&B và xử lý quan hệ lao động cho công ty quy mô 500+ nhân sự.',
    education: [{ schoolName: 'Đại học Luật TP.HCM', major: 'Luật Thương mại & Lao động', startDate: '09/2016', endDate: '06/2020' }],
    workExperience: [
      { companyName: 'Masan Group', position: 'Chuyên viên Quản trị Tiền lương C&B', startDate: '07/2020', endDate: 'Hiện tại', description: 'Tính toán lương, thưởng và bảo hiểm hàng tháng chuẩn xác, xây dựng thang bảng lương theo phương pháp Mercer.' }
    ]
  },
];

async function runSeed() {
  console.log('\n================================================================');
  console.log('🚀 BẮT ĐẦU SEED 20 ỨNG VIÊN & 3 CÔNG TY ĐA DẠNG NGÀNH NGHỀ');
  console.log('================================================================');

  await AppDataSource.initialize();
  console.log('✓ Kết nối PostgreSQL thành công!');

  const userRepo = AppDataSource.getRepository(User);
  const companyRepo = AppDataSource.getRepository(Company);
  const jobRepo = AppDataSource.getRepository(Job);
  const onlineCvRepo = AppDataSource.getRepository(OnlineCV);
  const userCvRepo = AppDataSource.getRepository(UserCV);

  const hashedPassword = bcrypt.hashSync('12345678', bcrypt.genSaltSync(10));
  const oneYearLater = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const boostExpireDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days active boost

  // =====================================================================
  // 1. SEED 3 CÔNG TY KHÁC NHAU VỚI CÁC NGÀNH NGHỀ KHÁC NHAU
  // =====================================================================
  console.log('\n--- 1. Seed 3 Công ty & Tài khoản HR theo các lĩnh vực ---');

  // Công ty 1: Công nghệ Phần mềm (Tech / IT) -> HR PREMIUM
  let compTech = await companyRepo.findOne({ where: { name: 'TalentPulse Technology Group' } });
  if (!compTech) {
    compTech = companyRepo.create({
      name: 'TalentPulse Technology Group',
      taxCode: '0109988776',
      scale: '100-500 nhân sự',
      address: 'Keangnam Landmark 72, Phạm Hùng, Cầu Giấy, Hà Nội',
      description: 'Tập đoàn công nghệ và giải pháp phần mềm SaaS, Cloud Computing và trí tuệ nhân tạo AI hàng đầu Việt Nam.',
      logo: 'https://images.unsplash.com/photo-1549923746-c502d488b3ea?w=200&auto=format&fit=crop&q=60',
      isActive: true,
      isPremium: true,
      premiumExpiresAt: oneYearLater,
      isDeleted: false,
    });
    compTech = await companyRepo.save(compTech);
  }

  // HR 1: HR Trưởng Tech (HR PREMIUM)
  let hrTech = await userRepo.findOne({ where: { email: 'hr@talentpulse.com' } });
  const hrTechData = {
    email: 'hr@talentpulse.com',
    password: hashedPassword,
    name: 'Trần Quốc An (HR Trưởng - Tech Premium)',
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
    company: { _id: compTech._id, name: compTech.name, isActive: true },
  };
  if (!hrTech) {
    hrTech = userRepo.create(hrTechData);
  } else {
    Object.assign(hrTech, hrTechData);
  }
  hrTech = await userRepo.save(hrTech);
  console.log(`✓ HR Tech (Premium): ${hrTech.email} -> ${compTech.name}`);

  // Công ty 2: Bất động sản & Kinh doanh (Sales / Real Estate) -> HR STANDARD (5 CV/ngày)
  let compSales = await companyRepo.findOne({ where: { name: 'GrandLand Real Estate & Commercial Group' } });
  if (!compSales) {
    compSales = companyRepo.create({
      name: 'GrandLand Real Estate & Commercial Group',
      taxCode: '0315889922',
      scale: '500-1000 nhân sự',
      address: 'Bitexco Financial Tower, Quận 1, TP. Hồ Chí Minh',
      description: 'Tập đoàn phát triển bất động sản nghỉ dưỡng, thương mại dịch vụ cao cấp và phân phối dự án BĐS hàng đầu.',
      logo: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=200&auto=format&fit=crop&q=60',
      isActive: true,
      isPremium: false,
      isDeleted: false,
    });
    compSales = await companyRepo.save(compSales);
  }

  // HR 2: HR Sales (HR STANDARD - 5 CV/ngày)
  let hrSales = await userRepo.findOne({ where: { email: 'hr.grandland@talentpulse.com' } });
  const hrSalesData = {
    email: 'hr.grandland@talentpulse.com',
    password: hashedPassword,
    name: 'Nguyễn Thị Hồng Hạnh (HR BĐS & Sales Standard)',
    role: Role.HR,
    gender: 'female',
    age: 29,
    address: 'Quận 1, TP. Hồ Chí Minh',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200&auto=format&fit=crop&q=80',
    isApproved: true,
    isLocked: false,
    isDeleted: false,
    isPremium: false,
    premiumPlan: PremiumPlan.FREE,
    company: { _id: compSales._id, name: compSales.name, isActive: true },
  };
  if (!hrSales) {
    hrSales = userRepo.create(hrSalesData);
  } else {
    Object.assign(hrSales, hrSalesData);
  }
  hrSales = await userRepo.save(hrSales);
  console.log(`✓ HR Real Estate (Standard): ${hrSales.email} -> ${compSales.name}`);

  // Công ty 3: Digital Marketing & Truyền thông Sáng tạo -> HR STANDARD
  let compMarketing = await companyRepo.findOne({ where: { name: 'CreativePulse Digital & Media Agency' } });
  if (!compMarketing) {
    compMarketing = companyRepo.create({
      name: 'CreativePulse Digital & Media Agency',
      taxCode: '0108776655',
      scale: '50-100 nhân sự',
      address: 'Tòa nhà Charmvit, Trần Duy Hưng, Cầu Giấy, Hà Nội',
      description: 'Agency chuyên sâu về giải pháp tiếp thị kỹ thuật số Digital Marketing, sáng tạo nội dung viral, quản lý nhãn hàng và thiết kế trải nghiệm thương hiệu.',
      logo: 'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=200&auto=format&fit=crop&q=60',
      isActive: true,
      isPremium: false,
      isDeleted: false,
    });
    compMarketing = await companyRepo.save(compMarketing);
  }

  // HR 3: HR Marketing (HR STANDARD)
  let hrMarketing = await userRepo.findOne({ where: { email: 'hr.creative@talentpulse.com' } });
  const hrMarketingData = {
    email: 'hr.creative@talentpulse.com',
    password: hashedPassword,
    name: 'Vũ Thùy Chi (HR Marketing Agency Standard)',
    role: Role.HR,
    gender: 'female',
    age: 26,
    address: 'Cầu Giấy, Hà Nội',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&auto=format&fit=crop&q=80',
    isApproved: true,
    isLocked: false,
    isDeleted: false,
    isPremium: false,
    premiumPlan: PremiumPlan.FREE,
    company: { _id: compMarketing._id, name: compMarketing.name, isActive: true },
  };
  if (!hrMarketing) {
    hrMarketing = userRepo.create(hrMarketingData);
  } else {
    Object.assign(hrMarketing, hrMarketingData);
  }
  hrMarketing = await userRepo.save(hrMarketing);
  console.log(`✓ HR Marketing (Standard): ${hrMarketing.email} -> ${compMarketing.name}`);

  // =====================================================================
  // 2. SEED CÁC TIN TUYỂN DỤNG THEO TỪNG CÔNG TY ĐỂ CÁ NHÂN HÓA
  // =====================================================================
  console.log('\n--- 2. Seed Tin Tuyển Dụng đặc trưng cho từng công ty ---');

  // Xóa job cũ của các công ty để seed lại bài bản
  await jobRepo.delete({ company: { _id: compSales._id } as any });
  await jobRepo.delete({ company: { _id: compMarketing._id } as any });

  // Jobs cho Công ty BĐS / Sales:
  const salesJobs = [
    {
      name: 'Trưởng phòng Kinh doanh Bất động sản Nghỉ dưỡng',
      skills: ['Bất động sản', 'Kinh doanh', 'Đàm phán', 'Chốt sale', 'Quản lý đội ngũ'],
      company: { _id: compSales._id, name: compSales.name, logo: compSales.logo, isActive: true },
      salary: 35000000,
      level: 'Trưởng phòng',
      quantity: 3,
      location: 'TP. Hồ Chí Minh',
      startDate: new Date(),
      endDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      isHot: true,
      isActive: true,
      isDeleted: false,
      description: 'Tìm kiếm trưởng phòng tài năng dẫn dắt đội ngũ 15 nhân viên kinh doanh phân phối dự án nghỉ dưỡng cao cấp.',
    },
    {
      name: 'Chuyên viên Tư vấn & Môi giới Bất động sản Cao cấp',
      skills: ['Bất động sản', 'Tư vấn', 'Bán hàng', 'Chăm sóc khách hàng VIP', 'Telesale'],
      company: { _id: compSales._id, name: compSales.name, logo: compSales.logo, isActive: true },
      salary: 18000000,
      level: 'Nhân viên',
      quantity: 10,
      location: 'TP. Hồ Chí Minh',
      startDate: new Date(),
      endDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
      isHot: false,
      isActive: true,
      isDeleted: false,
      description: 'Tư vấn và chốt hợp đồng căn hộ và biệt thự cho khách hàng có nhu cầu ở và đầu tư.',
    },
    {
      name: 'Chuyên viên Telesales Bán hàng & Khai thác Data Dự án',
      skills: ['Telesale', 'Kinh doanh', 'Bán hàng', 'Chăm sóc khách hàng', 'Giao tiếp'],
      company: { _id: compSales._id, name: compSales.name, logo: compSales.logo, isActive: true },
      salary: 12000000,
      level: 'Nhân viên',
      quantity: 5,
      location: 'TP. Hồ Chí Minh',
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      isHot: false,
      isActive: true,
      isDeleted: false,
      description: 'Liên hệ qua điện thoại giới thiệu các chính sách ưu đãi mở bán dự án BĐS.',
    },
  ];

  for (const j of salesJobs) {
    const job = jobRepo.create(j);
    await jobRepo.save(job);
  }
  console.log(`✓ Đã tạo ${salesJobs.length} tin tuyển dụng ngành Bất động sản & Sales cho ${compSales.name}`);

  // Jobs cho Công ty Marketing & Media Agency:
  const marketingJobs = [
    {
      name: 'Senior Digital Marketing Specialist & Performance Ads Lead',
      skills: ['Marketing', 'Facebook Ads', 'Google Ads', 'Digital Marketing', 'TikTok Ads', 'SEO'],
      company: { _id: compMarketing._id, name: compMarketing.name, logo: compMarketing.logo, isActive: true },
      salary: 25000000,
      level: 'Trưởng nhóm',
      quantity: 2,
      location: 'Hà Nội',
      startDate: new Date(),
      endDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      isHot: true,
      isActive: true,
      isDeleted: false,
      description: 'Lên kế hoạch và trực tiếp chạy quảng cáo chuyển đổi đa kênh cho các nhãn hàng đối tác của Agency.',
    },
    {
      name: 'Content Creator & Sáng tạo Kịch bản Video TikTok',
      skills: ['Marketing', 'Content Marketing', 'Copywriting', 'Social Media', 'Kịch bản TikTok', 'Storytelling'],
      company: { _id: compMarketing._id, name: compMarketing.name, logo: compMarketing.logo, isActive: true },
      salary: 15000000,
      level: 'Nhân viên',
      quantity: 4,
      location: 'Hà Nội',
      startDate: new Date(),
      endDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
      isHot: false,
      isActive: true,
      isDeleted: false,
      description: 'Lên ý tưởng, viết kịch bản và tham gia sản xuất các video viral trên TikTok và Facebook Reels.',
    },
    {
      name: 'Senior UI/UX & Graphic Designer',
      skills: ['UI/UX', 'Figma', 'Photoshop', 'Illustrator', 'Thiết kế', 'Branding'],
      company: { _id: compMarketing._id, name: compMarketing.name, logo: compMarketing.logo, isActive: true },
      salary: 22000000,
      level: 'Chuyên viên',
      quantity: 2,
      location: 'Hà Nội',
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      isHot: false,
      isActive: true,
      isDeleted: false,
      description: 'Thiết kế giao diện landing page, banner truyền thông và bộ nhận diện thương hiệu.',
    },
  ];

  for (const j of marketingJobs) {
    const job = jobRepo.create(j);
    await jobRepo.save(job);
  }
  console.log(`✓ Đã tạo ${marketingJobs.length} tin tuyển dụng ngành Marketing & Design cho ${compMarketing.name}`);

  // =====================================================================
  // 3. SEED 20 ỨNG VIÊN ĐA DẠNG CÁC LĨNH VỰC KÈM CV CHUẨN
  // =====================================================================
  console.log('\n--- 3. Seed 20 Ứng viên & Hồ sơ CV đa ngành nghề ---');

  for (let i = 0; i < CANDIDATES_DATA.length; i++) {
    const cand = CANDIDATES_DATA[i];

    let user = await userRepo.findOne({ where: { email: cand.email } });
    const userData = {
      email: cand.email,
      password: hashedPassword,
      name: cand.name,
      role: Role.USER,
      gender: cand.gender,
      age: cand.age,
      address: cand.address,
      avatar: cand.avatar,
      isApproved: true,
      isVerified: true,
      isLocked: false,
      isDeleted: false,
      isPremium: cand.isPremium,
      premiumPlan: cand.isPremium ? PremiumPlan.CANDIDATE_PREMIUM : PremiumPlan.FREE,
      premiumExpiresAt: cand.isPremium ? oneYearLater : null,
      boostExpiresAt: cand.isBoosted ? boostExpireDate : null,
      isJobSeeking: true,
      isJobRecommendation: true,
      allowRecruiterSearch: true,
    };

    if (!user) {
      user = userRepo.create(userData);
    } else {
      Object.assign(user, userData);
    }
    user = await userRepo.save(user);

    // Xóa CV cũ của user này
    await onlineCvRepo.delete({ userId: user._id });
    await userCvRepo.delete({ userId: user._id });

    // Tạo Online CV chính
    const onlineCv = onlineCvRepo.create({
      userId: user._id,
      title: `CV - ${cand.title}`,
      templateType: i % 2 === 0 ? 'template1' : 'template2',
      isPrimary: true,
      isSearchable: true,
      isDeleted: false,
      fullName: cand.name,
      position: cand.title,
      phone: `09${Math.floor(10000000 + Math.random() * 90000000)}`,
      email: cand.email,
      address: cand.address,
      avatar: cand.avatar,
      careerObjective: cand.careerObjective,
      education: cand.education,
      workExperience: cand.workExperience,
      skills: cand.skills.map((s) => ({ name: s, description: 'Thành thạo & có kinh nghiệm thực tế' })),
      certificates: [{ name: `Chứng chỉ nghiệp vụ ${cand.title}`, date: '2023' }],
      createdBy: { _id: user._id, email: user.email },
    });
    await onlineCvRepo.save(onlineCv);

    // Tạo thêm 1 file CV đính kèm (PDF) để test tìm cả file CV
    const uploadedCv = userCvRepo.create({
      userId: user._id,
      title: `CV_${cand.name.replace(/\s+/g, '_')}_2026.pdf`,
      url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
      fileType: 'PDF',
      isPrimary: false,
      isSearchable: true,
      isDeleted: false,
      skills: cand.skills,
      createdBy: { _id: user._id, email: user.email },
    });
    await userCvRepo.save(uploadedCv);

    console.log(
      `  [${i + 1}/20] Ứng viên: ${cand.name.padEnd(20)} | Vị trí: ${cand.title.padEnd(45)} | ${cand.isBoosted ? '🚀 TOP' : cand.isPremium ? '👑 Premium' : '⭐ Standard'}`,
    );
  }

  console.log('\n================================================================');
  console.log('🎉 SEED DỮ LIỆU HOÀN TẤT THÀNH CÔNG VỚI 20 ỨNG VIÊN & 3 CÔNG TY!');
  console.log('================================================================');
  console.log('📋 THÔNG TIN TÀI KHOẢN HR ĐỂ TEST TÌM CV & CÁ NHÂN HÓA:');
  console.log('----------------------------------------------------------------');
  console.log('1. HR CÔNG TY TECH (Gói HR PREMIUM - Không giới hạn mở khóa):');
  console.log(`   • Email       : \x1b[36mhr@talentpulse.com\x1b[0m`);
  console.log(`   • Mật khẩu    : \x1b[33m12345678\x1b[0m`);
  console.log(`   • Công ty     : TalentPulse Technology Group (Lĩnh vực: IT / Phần mềm / SaaS)`);
  console.log(`   • Hiệu ứng gợi ý: Tự động ưu tiên xếp các ứng viên IT, Fullstack, Backend, DevOps lên đầu!`);
  console.log('----------------------------------------------------------------');
  console.log('2. HR CÔNG TY BẤT ĐỘNG SẢN & KINH DOANH (Gói HR STANDARD - Giới hạn 5 CV/ngày):');
  console.log(`   • Email       : \x1b[36mhr.grandland@talentpulse.com\x1b[0m`);
  console.log(`   • Mật khẩu    : \x1b[33m12345678\x1b[0m`);
  console.log(`   • Công ty     : GrandLand Real Estate & Commercial Group (Lĩnh vực: Bất động sản / Sales)`);
  console.log(`   • Hiệu ứng gợi ý: Tự động ưu tiên xếp các ứng viên Sales BĐS, Telesales, B2B lên đầu!`);
  console.log('----------------------------------------------------------------');
  console.log('3. HR CÔNG TY DIGITAL MARKETING & CREATIVE AGENCY (Gói HR STANDARD):');
  console.log(`   • Email       : \x1b[36mhr.creative@talentpulse.com\x1b[0m`);
  console.log(`   • Mật khẩu    : \x1b[33m12345678\x1b[0m`);
  console.log(`   • Công ty     : CreativePulse Digital & Media Agency (Lĩnh vực: Marketing / Media / Design)`);
  console.log(`   • Hiệu ứng gợi ý: Tự động ưu tiên xếp các ứng viên Ads Lead, Content TikTok, SEO, UI/UX lên đầu!`);
  console.log('================================================================\n');

  await AppDataSource.destroy();
}

runSeed().catch((err) => {
  console.error('❌ Lỗi khi chạy seed candidate pool:', err);
  process.exit(1);
});
