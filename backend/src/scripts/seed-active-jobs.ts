import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { configurePostgresUtcParsers } from '../database/pg-type-parsers';

dotenv.config();
configurePostgresUtcParsers();

import { createHash } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';
import { createDataSourceOptions } from '../database/data-source-options';
import { Company } from '../companies/entities/company.entity';
import { Job } from '../jobs/entities/job.entity';
import { Skill } from '../skills/entities/skill.entity';
import { User } from '../users/entities/user.entity';
import {
  ElasticsearchService,
  TALENTPULSE_JOBS_INDEX,
} from '../elasticsearch/elasticsearch.service';
import { LOCAL_COMPANY_ID } from './seed-local-jobs';
import { Role } from '../decorator/customize';

interface JobTemplate {
  slug: string;
  name: string;
  skills: string[];
  salary: number;
  level: string;
  workingModel: string;
  education: string;
  quantity: number;
  benefits: string[];
  categories: string[];
  location?: string;
  lat?: number;
  lon?: number;
  isHot?: boolean;
  isFeatured?: boolean;
  isUrgent?: boolean;
  summary: string;
  responsibilities: string[];
  requirements: string[];
}

const DEFAULT_BENEFITS = [
  'Bảo hiểm xã hội',
  'Thưởng tháng 13',
  'Khám sức khỏe định kỳ',
  'Review lương 2 lần/năm',
];

const FALLBACK_HUBS = [
  { location: 'Cầu Giấy, Hà Nội', lat: 21.0285, lon: 105.783 },
  { location: 'Quận 1, TP. Hồ Chí Minh', lat: 10.7769, lon: 106.7009 },
  { location: 'Hải Châu, Đà Nẵng', lat: 16.0544, lon: 108.2022 },
  { location: 'Quận 3, TP. Hồ Chí Minh', lat: 10.7844, lon: 106.6845 },
];

const TALENTPULSE_TEMPLATES: JobTemplate[] = [
  {
    slug: 'tp-fullstack-nestjs-react',
    name: 'Senior Fullstack Engineer (NestJS / React)',
    skills: ['TypeScript', 'NestJS', 'React', 'PostgreSQL', 'Redis', 'Docker'],
    salary: 38000000,
    level: 'SENIOR',
    workingModel: 'Linh hoạt / Hybrid',
    education: 'Đại học trở lên',
    quantity: 2,
    benefits: [...DEFAULT_BENEFITS, 'Laptop / Thiết bị làm việc'],
    categories: ['Công nghệ Thông tin', 'Fullstack Developer'],
    isHot: true,
    isFeatured: true,
    summary:
      'Phát triển nền tảng tuyển dụng và phỏng vấn trực tuyến TalentPulse với kiến trúc NestJS, PostgreSQL, Redis và React.',
    responsibilities: [
      'Thiết kế REST API, WebSocket real-time và tối ưu truy vấn PostgreSQL/PostGIS.',
      'Phát triển giao diện người dùng bằng React, TypeScript, TailwindCSS.',
      'Phối hợp viết unit/integration test và rà soát hiệu năng hệ thống.',
    ],
    requirements: [
      'Từ 3 năm kinh nghiệm thực tế với TypeScript, Node.js/NestJS và React.',
      'Nắm vững PostgreSQL, Redis, Bull queue và Docker.',
      'Kinh nghiệm làm việc với Git workflow và CI/CD.',
    ],
  },
  {
    slug: 'tp-ai-rag-python',
    name: 'AI Engineer (Python / FastAPI / RAG)',
    skills: ['Python', 'FastAPI', 'PostgreSQL', 'Qdrant', 'Docker', 'NLP'],
    salary: 42000000,
    level: 'MIDDLE',
    workingModel: 'Làm việc tại văn phòng / Onsite',
    education: 'Đại học trở lên',
    quantity: 2,
    benefits: [...DEFAULT_BENEFITS, 'Đào tạo nâng cao'],
    categories: ['Công nghệ Thông tin', 'AI / Machine Learning'],
    isUrgent: true,
    summary:
      'Xây dựng và tối ưu dịch vụ phân tích CV, chấm điểm độ phù hợp và chatbot tư vấn nghề nghiệp dựa trên Qdrant và LLM.',
    responsibilities: [
      'Phát triển endpoint nội bộ trên FastAPI và pipeline xử lý văn bản CV.',
      'Quản lý dữ liệu vector trên Qdrant và đánh giá chất lượng truy xuất RAG.',
      'Giám sát độ trễ, timeout và kiểm thử hồi quy cho luồng gọi mô hình.',
    ],
    requirements: [
      'Thành thạo Python 3.11+, FastAPI, Pydantic và xử lý dữ liệu bất đồng bộ.',
      'Có kinh nghiệm với Vector Database (Qdrant/Milvus) và LLM API.',
      'Hiểu biết về kiểm soát dữ liệu đầu ra có cấu trúc (JSON Schema).',
    ],
  },
  {
    slug: 'tp-devops-sre',
    name: 'DevOps & Monitoring Engineer (Docker / Grafana)',
    skills: ['Linux', 'Docker', 'Kubernetes', 'CI/CD', 'Prometheus', 'AWS'],
    salary: 35000000,
    level: 'MIDDLE',
    workingModel: 'Linh hoạt / Hybrid',
    education: 'Đại học trở lên',
    quantity: 1,
    benefits: DEFAULT_BENEFITS,
    categories: ['Công nghệ Thông tin', 'DevOps / Cloud'],
    summary:
      'Vận hành hạ tầng container, thiết lập cảnh báo và giám sát tập trung bằng Prometheus, Loki và Grafana.',
    responsibilities: [
      'Duy trì Docker Compose, CI/CD pipeline và cấu hình reverse proxy HTTPS.',
      'Xây dựng dashboard theo dõi PostgreSQL, Redis, Elasticsearch và API latency.',
      'Tối ưu quy trình sao lưu dữ liệu và tự động hóa kiểm tra sẵn sàng dịch vụ.',
    ],
    requirements: [
      'Từ 2 năm kinh nghiệm vận hành Linux, Docker và GitHub Actions.',
      'Biết cấu hình Prometheus, Alertmanager, Loki hoặc ELK.',
      'Nắm chắc kiến thức mạng, SSL/TLS và bảo mật hệ thống web.',
    ],
  },
  {
    slug: 'tp-backend-intern',
    name: 'Backend Developer Intern (Node.js / TypeScript)',
    skills: ['TypeScript', 'NodeJS', 'NestJS', 'PostgreSQL', 'Git'],
    salary: 8000000,
    level: 'INTERN',
    workingModel: 'Làm việc tại văn phòng / Onsite',
    education: 'Đại học trở lên',
    quantity: 3,
    benefits: ['Phụ cấp ăn trưa', 'Đào tạo nâng cao', 'Du lịch hàng năm'],
    categories: ['Công nghệ Thông tin', 'Backend Developer'],
    summary:
      'Tham gia xây dựng các module nghiệp vụ và viết kiểm thử tự động dưới sự hướng dẫn của kỹ sư chính.',
    responsibilities: [
      'Hỗ trợ phát triển API CRUD, validation DTO và migration PostgreSQL.',
      'Viết unit test bằng Jest và cập nhật tài liệu Swagger cho endpoint mới.',
      'Tham gia review code hằng tuần cùng đội kỹ thuật.',
    ],
    requirements: [
      'Sinh viên năm cuối hoặc mới tốt nghiệp ngành CNTT, làm được tối thiểu 4 ngày/tuần.',
      'Có kiến thức nền tảng JavaScript/TypeScript và SQL.',
      'Chủ động học hỏi và đọc hiểu tài liệu kỹ thuật tiếng Anh.',
    ],
  },
];

const GRANDLAND_TEMPLATES: JobTemplate[] = [
  {
    slug: 'gl-proptech-ba',
    name: 'Business Analyst (PropTech & CRM)',
    skills: ['SQL', 'Figma', 'Kinh doanh', 'Tư vấn', 'Excel'],
    salary: 26000000,
    level: 'MIDDLE',
    workingModel: 'Làm việc tại văn phòng / Onsite',
    education: 'Đại học trở lên',
    quantity: 2,
    benefits: [...DEFAULT_BENEFITS, 'Du lịch hàng năm'],
    categories: ['Phân tích nghiệp vụ', 'Công nghệ Thông tin'],
    isHot: true,
    summary:
      'Phân tích quy trình quản lý giỏ hàng bất động sản, chăm sóc khách hàng và phối hợp với đội kỹ thuật triển khai CRM nội bộ.',
    responsibilities: [
      'Thu thập yêu cầu từ bộ phận kinh doanh và chuyển hóa thành tài liệu đặc tả.',
      'Thiết kế luồng màn hình nghiệp vụ, viết kịch bản UAT và nghiệm thu sản phẩm.',
      'Phân tích dữ liệu giao dịch để đề xuất cải tiến quy trình bán hàng.',
    ],
    requirements: [
      'Từ 2 năm kinh nghiệm Business Analyst cho hệ thống CRM hoặc ERP.',
      'Thành thạo SQL cơ bản, vẽ flowchart/wireframe và giao tiếp rõ ràng.',
      'Ưu tiên ứng viên từng làm trong lĩnh vực bất động sản hoặc thương mại.',
    ],
  },
  {
    slug: 'gl-crm-backend',
    name: 'Backend Developer (Java / PostgreSQL)',
    skills: ['Java', 'Spring Boot', 'PostgreSQL', 'Redis', 'Elasticsearch'],
    salary: 32000000,
    level: 'SENIOR',
    workingModel: 'Linh hoạt / Hybrid',
    education: 'Đại học trở lên',
    quantity: 2,
    benefits: DEFAULT_BENEFITS,
    categories: ['Công nghệ Thông tin', 'Backend Developer'],
    isFeatured: true,
    summary:
      'Phát triển hệ thống tìm kiếm dự án, quản lý hợp đồng và đồng bộ dữ liệu bản đồ bất động sản khu vực TP.HCM.',
    responsibilities: [
      'Xây dựng các microservice quản lý khách hàng, lịch hẹn và hoa hồng.',
      'Tối ưu tìm kiếm theo vị trí địa lý và bộ lọc đa điều kiện.',
      'Đảm bảo tính nhất quán dữ liệu và phân quyền truy cập theo chi nhánh.',
    ],
    requirements: [
      'Từ 3 năm kinh nghiệm Java Spring Boot hoặc Node.js/NestJS.',
      'Thành thạo PostgreSQL, thiết kế schema và xử lý giao dịch lớn.',
      'Có tư duy hệ thống và kỹ năng xử lý sự cố production.',
    ],
  },
  {
    slug: 'gl-digital-sales',
    name: 'Chuyên viên Tư vấn Bất động sản Cao cấp',
    skills: ['Bất động sản', 'Tư vấn', 'Bán hàng', 'Giao tiếp', 'Kinh doanh'],
    salary: 22000000,
    level: 'JUNIOR',
    workingModel: 'Làm việc tại văn phòng / Onsite',
    education: 'Cao đẳng',
    quantity: 5,
    benefits: [...DEFAULT_BENEFITS, 'Du lịch hàng năm'],
    categories: ['Kinh doanh / Bán hàng', 'Bất động sản'],
    isUrgent: true,
    summary:
      'Tư vấn sản phẩm căn hộ và mặt bằng thương mại cho khách hàng cá nhân và doanh nghiệp tại TP. Hồ Chí Minh.',
    responsibilities: [
      'Tiếp nhận nguồn khách hàng từ hệ thống CRM và tư vấn dự án phù hợp.',
      'Dẫn khách tham quan thực tế, giải đáp thông tin pháp lý và tiến độ thanh toán.',
      'Phối hợp bộ phận thủ tục hoàn tất hợp đồng và chăm sóc sau bán.',
    ],
    requirements: [
      'Từ 1 năm kinh nghiệm tư vấn bán hàng, ưu tiên mảng bất động sản hoặc tài chính.',
      'Kỹ năng giao tiếp tốt, tác phong chuyên nghiệp và chịu được áp lực doanh số.',
      'Sử dụng thành thạo công cụ tin học văn phòng và CRM.',
    ],
  },
  {
    slug: 'gl-data-marketing-fresher',
    name: 'Fresher Data & Marketing Operations',
    skills: ['SQL', 'Excel', 'Digital Marketing', 'Google Ads', 'Data Quality'],
    salary: 14000000,
    level: 'FRESHER',
    workingModel: 'Làm việc tại văn phòng / Onsite',
    education: 'Đại học trở lên',
    quantity: 2,
    benefits: ['Bảo hiểm xã hội', 'Phụ cấp ăn trưa', 'Đào tạo nâng cao'],
    categories: ['Marketing', 'Dữ liệu'],
    summary:
      'Tổng hợp hiệu quả chiến dịch quảng cáo dự án, làm sạch dữ liệu khách hàng tiềm năng và lập báo cáo tuần.',
    responsibilities: [
      'Theo dõi tỷ lệ chuyển đổi lead từ các kênh tìm kiếm và mạng xã hội.',
      'Làm sạch dữ liệu trùng lặp trước khi phân bổ cho đội ngũ tư vấn.',
      'Lập bảng tổng hợp chi phí và hiệu suất chiến dịch hàng tuần.',
    ],
    requirements: [
      'Tốt nghiệp chuyên ngành Kinh tế, Marketing, Hệ thống thông tin hoặc liên quan.',
      'Thành thạo Excel/Google Sheets, biết SQL là điểm cộng lớn.',
      'Cẩn thận với số liệu và tư duy logic tốt.',
    ],
  },
];

const CREATIVEPULSE_TEMPLATES: JobTemplate[] = [
  {
    slug: 'cp-uiux-designer',
    name: 'Senior UI/UX Product Designer',
    skills: ['UI/UX', 'Figma', 'Design System', 'HTML5/CSS3', 'Testing'],
    salary: 28000000,
    level: 'SENIOR',
    workingModel: 'Linh hoạt / Hybrid',
    education: 'Đại học trở lên',
    quantity: 1,
    benefits: [...DEFAULT_BENEFITS, 'Laptop / Thiết bị làm việc'],
    categories: ['Thiết kế', 'UI/UX Design'],
    isHot: true,
    summary:
      'Thiết kế trải nghiệm người dùng, xây dựng Design System và nguyên mẫu tương tác cho sản phẩm web và ứng dụng di động.',
    responsibilities: [
      'Nghiên cứu hành vi người dùng, dựng wireframe, user flow và prototype trên Figma.',
      'Chuẩn hóa thư viện component dùng chung phối hợp chặt với đội Frontend.',
      'Kiểm tra tính nhất quán giao diện trước khi phát hành sản phẩm.',
    ],
    requirements: [
      'Từ 3 năm kinh nghiệm UI/UX Product Design, có portfolio sản phẩm thực tế.',
      'Thành thạo Figma Auto Layout, Component Variants và Design Tokens.',
      'Hiểu giới hạn kỹ thuật của HTML/CSS và React để thiết kế khả thi.',
    ],
  },
  {
    slug: 'cp-frontend-nextjs',
    name: 'Frontend Engineer (React / Next.js / TailwindCSS)',
    skills: ['React', 'NextJS', 'TypeScript', 'TailwindCSS', 'HTML5/CSS3'],
    salary: 29000000,
    level: 'MIDDLE',
    workingModel: 'Linh hoạt / Hybrid',
    education: 'Đại học trở lên',
    quantity: 2,
    benefits: DEFAULT_BENEFITS,
    categories: ['Công nghệ Thông tin', 'Frontend Developer'],
    isFeatured: true,
    summary:
      'Phát triển trang giới thiệu sản phẩm, cổng nội dung số và giao diện web app tốc độ cao cho khách hàng doanh nghiệp.',
    responsibilities: [
      'Chuyển hóa thiết kế Figma thành giao diện React/Next.js chuẩn responsive.',
      'Tối ưu Core Web Vitals, SEO và hiệu ứng chuyển động mượt trên mọi thiết bị.',
      'Tích hợp REST API và quản lý trạng thái ứng dụng.',
    ],
    requirements: [
      'Từ 2 năm kinh nghiệm React/Next.js và TypeScript.',
      'Thành thạo TailwindCSS, xử lý form phức tạp và tối ưu bundle size.',
      'Có mắt thẩm mỹ tốt và kỹ năng phối hợp cùng team thiết kế.',
    ],
  },
  {
    slug: 'cp-performance-marketing',
    name: 'Performance Marketing Lead',
    skills: ['Digital Marketing', 'Google Ads', 'Facebook Ads', 'TikTok Ads', 'SEO'],
    salary: 30000000,
    level: 'LEAD',
    workingModel: 'Làm việc tại văn phòng / Onsite',
    education: 'Đại học trở lên',
    quantity: 1,
    benefits: [...DEFAULT_BENEFITS, 'Du lịch hàng năm'],
    categories: ['Marketing', 'Digital Marketing'],
    isUrgent: true,
    summary:
      'Hoạch định và tối ưu ngân sách quảng cáo đa kênh cho các chiến dịch thương hiệu và tuyển dụng của đối tác.',
    responsibilities: [
      'Quản lý đội ngũ chạy quảng cáo Google, Meta và TikTok theo KPI chuyển đổi.',
      'Phân tích dữ liệu phễu, thử nghiệm A/B landing page và tối ưu CPA/ROAS.',
      'Báo cáo trực tiếp kết quả chiến dịch cho khách hàng doanh nghiệp.',
    ],
    requirements: [
      'Từ 3 năm kinh nghiệm Performance Marketing, từng quản lý ngân sách lớn.',
      'Thành thạo Google Analytics 4, Tag Manager và các trình quản lý quảng cáo.',
      'Kỹ năng trình bày số liệu và điều phối nhóm 3-5 người.',
    ],
  },
  {
    slug: 'cp-mobile-flutter',
    name: 'Mobile App Developer (Flutter / Dart)',
    skills: ['Flutter', 'TypeScript', 'REST APIs', 'Git', 'Testing'],
    salary: 25000000,
    level: 'JUNIOR',
    workingModel: 'Làm từ xa / Remote',
    education: 'Cao đẳng',
    quantity: 2,
    benefits: DEFAULT_BENEFITS,
    categories: ['Công nghệ Thông tin', 'Mobile Developer'],
    summary:
      'Xây dựng ứng dụng di động đa nền tảng iOS và Android phục vụ chiến dịch tương tác người dùng và loyalty.',
    responsibilities: [
      'Phát triển màn hình ứng dụng Flutter kết nối API backend và thông báo đẩy.',
      'Xử lý bộ nhớ đệm ngoại tuyến, tối ưu tốc độ cuộn và dung lượng ứng dụng.',
      'Phối hợp QA kiểm thử và phát hành lên App Store / Google Play.',
    ],
    requirements: [
      'Từ 1 năm kinh nghiệm phát triển ứng dụng bằng Flutter.',
      'Nắm vững quản lý state (Bloc/Riverpod) và tích hợp REST API/WebSocket.',
      'Có sản phẩm đã phát hành trên store là lợi thế.',
    ],
  },
];

const GENERIC_POOL_A: JobTemplate[] = [
  {
    slug: 'gen-a-qa-automation',
    name: 'QA Automation Engineer (Playwright / Jest)',
    skills: ['Testing', 'TypeScript', 'JavaScript', 'CI/CD', 'Git'],
    salary: 24000000,
    level: 'MIDDLE',
    workingModel: 'Linh hoạt / Hybrid',
    education: 'Đại học trở lên',
    quantity: 2,
    benefits: DEFAULT_BENEFITS,
    categories: ['Công nghệ Thông tin', 'QA / Tester'],
    isHot: true,
    summary:
      'Xây dựng bộ kiểm thử tự động end-to-end và kiểm thử API giúp bảo đảm chất lượng mỗi lần phát hành phần mềm.',
    responsibilities: [
      'Thiết kế test case chức năng, hồi quy cho web app và API dịch vụ.',
      'Viết script kiểm thử tự động bằng Playwright/TypeScript tích hợp vào GitHub Actions.',
      'Theo dõi lỗi, tái hiện bug và phối hợp với developer xử lý dứt điểm.',
    ],
    requirements: [
      'Từ 2 năm kinh nghiệm QA Automation hoặc Manual kết hợp viết script.',
      'Biết TypeScript/JavaScript, Postman và truy vấn SQL kiểm tra dữ liệu.',
      'Tư duy hệ thống và cẩn thận khi nghiệm thu nghiệp vụ.',
    ],
  },
  {
    slug: 'gen-a-backend-go-node',
    name: 'Backend Engineer (Node.js / Golang / Microservices)',
    skills: ['NodeJS', 'Golang', 'Microservices', 'PostgreSQL', 'Kafka'],
    salary: 34000000,
    level: 'SENIOR',
    workingModel: 'Làm việc tại văn phòng / Onsite',
    education: 'Đại học trở lên',
    quantity: 2,
    benefits: [...DEFAULT_BENEFITS, 'Laptop / Thiết bị làm việc'],
    categories: ['Công nghệ Thông tin', 'Backend Developer'],
    isFeatured: true,
    summary:
      'Phát triển hệ thống xử lý đơn hàng, hàng đợi bất đồng bộ và dịch vụ API hiệu năng cao.',
    responsibilities: [
      'Xây dựng dịch vụ backend xử lý đồng thời cao với Node.js hoặc Golang.',
      'Thiết kế schema PostgreSQL, tối ưu index và tích hợp hàng đợi thông điệp.',
      'Giám sát log hệ thống và viết tài liệu kỹ thuật cho đội ngũ vận hành.',
    ],
    requirements: [
      'Từ 3 năm kinh nghiệm Backend (Node.js/NestJS hoặc Golang).',
      'Nắm chắc PostgreSQL, Redis, Docker và thiết kế REST API.',
      'Có kinh nghiệm xử lý concurrency và idempotency.',
    ],
  },
  {
    slug: 'gen-a-frontend-junior',
    name: 'Junior Frontend Developer (React / TypeScript)',
    skills: ['React', 'TypeScript', 'TailwindCSS', 'HTML5/CSS3', 'Git'],
    salary: 18000000,
    level: 'JUNIOR',
    workingModel: 'Linh hoạt / Hybrid',
    education: 'Cao đẳng',
    quantity: 2,
    benefits: DEFAULT_BENEFITS,
    categories: ['Công nghệ Thông tin', 'Frontend Developer'],
    summary:
      'Phát triển giao diện quản trị và cổng thông tin khách hàng trên nền tảng React và TypeScript.',
    responsibilities: [
      'Hiện thực hóa các màn hình giao diện theo thiết kế và tiêu chuẩn responsive.',
      'Kết nối API tìm kiếm, bộ lọc và phân trang dữ liệu.',
      'Sửa lỗi giao diện và tối ưu trải nghiệm thao tác trên trình duyệt.',
    ],
    requirements: [
      'Từ 1 năm kinh nghiệm làm việc với ReactJS và TypeScript.',
      'Hiểu rõ HTML5, CSS3/TailwindCSS và lifecycle của React Hooks.',
      'Biết sử dụng Git và làm việc theo quy trình Agile/Scrum.',
    ],
  },
  {
    slug: 'gen-a-tech-lead',
    name: 'Engineering Manager / Technical Lead',
    skills: ['Microservices', 'AWS', 'PostgreSQL', 'Docker', 'CI/CD'],
    salary: 52000000,
    level: 'MANAGER',
    workingModel: 'Linh hoạt / Hybrid',
    education: 'Đại học trở lên',
    quantity: 1,
    benefits: [...DEFAULT_BENEFITS, 'Laptop / Thiết bị làm việc'],
    categories: ['Công nghệ Thông tin', 'Software Engineering'],
    isUrgent: true,
    summary:
      'Dẫn dắt đội ngũ kỹ thuật 8-12 thành viên xây dựng kiến trúc phần mềm, lập kế hoạch phát hành và nâng chuẩn chất lượng code.',
    responsibilities: [
      'Định hướng kiến trúc hệ thống, phân rã bài toán kỹ thuật và đánh giá rủi ro.',
      'Quản lý tiến độ sprint, review thiết kế kỹ thuật và cố vấn cho thành viên.',
      'Phối hợp bộ phận sản phẩm thiết lập lộ trình phát triển dài hạn.',
    ],
    requirements: [
      'Từ 5 năm kinh nghiệm phát triển phần mềm, ít nhất 2 năm ở vai trò Lead/Manager.',
      'Am hiểu kiến trúc web backend, cloud AWS, bảo mật và hiệu năng database.',
      'Kỹ năng giao tiếp, phân công và giải quyết xung đột tốt.',
    ],
  },
];

const GENERIC_POOL_B: JobTemplate[] = [
  {
    slug: 'gen-b-fullstack-dotnet',
    name: 'Fullstack Developer (.NET Core / Angular)',
    skills: ['C#', '.NET CORE', 'Angular', 'PostgreSQL', 'Docker'],
    salary: 31000000,
    level: 'MIDDLE',
    workingModel: 'Làm việc tại văn phòng / Onsite',
    education: 'Đại học trở lên',
    quantity: 2,
    benefits: DEFAULT_BENEFITS,
    categories: ['Công nghệ Thông tin', 'Fullstack Developer'],
    isHot: true,
    summary:
      'Phát triển hệ thống cổng dịch vụ doanh nghiệp bằng .NET Core API kết hợp giao diện Angular.',
    responsibilities: [
      'Phát triển module nghiệp vụ kế toán, nhân sự và báo cáo tổng hợp.',
      'Thiết kế API chuẩn OpenAPI và tối ưu truy vấn cơ sở dữ liệu.',
      'Hỗ trợ đóng gói Docker và triển khai môi trường kiểm thử.',
    ],
    requirements: [
      'Từ 2 năm kinh nghiệm C#/.NET Core và frontend Angular hoặc React.',
      'Thành thạo SQL (PostgreSQL hoặc SQL Server) và lập trình hướng đối tượng.',
      'Chủ động phối hợp trong nhóm phát triển.',
    ],
  },
  {
    slug: 'gen-b-python-django',
    name: 'Python Backend Developer (Django / FastAPI)',
    skills: ['Python', 'Django', 'FastAPI', 'PostgreSQL', 'Docker'],
    salary: 27000000,
    level: 'MIDDLE',
    workingModel: 'Làm từ xa / Remote',
    education: 'Đại học trở lên',
    quantity: 2,
    benefits: DEFAULT_BENEFITS,
    categories: ['Công nghệ Thông tin', 'Backend Developer'],
    isFeatured: true,
    summary:
      'Xây dựng API xử lý dữ liệu và tích hợp cổng thanh toán trực tuyến cho nền tảng thương mại.',
    responsibilities: [
      'Phát triển và bảo trì hệ thống REST API trên Django/FastAPI.',
      'Tích hợp webhook thanh toán, xử lý tác vụ nền và đối soát dữ liệu.',
      'Viết unit test và đảm bảo độ tin cậy của luồng giao dịch.',
    ],
    requirements: [
      'Từ 2 năm kinh nghiệm lập trình Python backend.',
      'Hiểu rõ ORM, PostgreSQL, Redis và bảo mật API.',
      'Có khả năng làm việc độc lập hiệu quả theo mô hình Remote.',
    ],
  },
  {
    slug: 'gen-b-cloud-junior',
    name: 'Junior Cloud & Linux Engineer (AWS / GCP)',
    skills: ['Linux', 'AWS', 'GCP', 'Docker', 'CI/CD'],
    salary: 20000000,
    level: 'JUNIOR',
    workingModel: 'Làm việc tại văn phòng / Onsite',
    education: 'Đại học trở lên',
    quantity: 1,
    benefits: [...DEFAULT_BENEFITS, 'Đào tạo nâng cao'],
    categories: ['Công nghệ Thông tin', 'DevOps / Cloud'],
    summary:
      'Hỗ trợ quản trị máy chủ Linux, container và tối ưu chi phí triển khai trên hạ tầng AWS/GCP.',
    responsibilities: [
      'Cấu hình Nginx, SSL, firewall và theo dõi tài nguyên máy chủ.',
      'Viết script tự động sao lưu database và kiểm tra sức khỏe dịch vụ.',
      'Phối hợp với đội phát triển xử lý sự cố môi trường staging/production.',
    ],
    requirements: [
      'Từ 1 năm kinh nghiệm quản trị Linux và Docker.',
      'Biết sử dụng các dịch vụ cơ bản của AWS hoặc GCP.',
      'Có chứng chỉ AWS/GCP hoặc hiểu biết Terraform là lợi thế.',
    ],
  },
  {
    slug: 'gen-b-qa-fresher',
    name: 'Fresher Software Tester (Web & Mobile)',
    skills: ['Testing', 'SQL', 'HTML5/CSS3', 'Git', 'Excel'],
    salary: 12000000,
    level: 'FRESHER',
    workingModel: 'Làm việc tại văn phòng / Onsite',
    education: 'Cao đẳng',
    quantity: 2,
    benefits: ['Bảo hiểm xã hội', 'Phụ cấp ăn trưa', 'Đào tạo nâng cao'],
    categories: ['Công nghệ Thông tin', 'QA / Tester'],
    summary:
      'Thực hiện kiểm thử chức năng, kiểm thử giao diện đa thiết bị và ghi nhận lỗi trên hệ thống Jira.',
    responsibilities: [
      'Đọc tài liệu mô tả tính năng để viết test case chi tiết.',
      'Kiểm thử luồng nghiệp vụ web/mobile trước khi bàn giao khách hàng.',
      'Kiểm tra lại các lỗi đã được lập trình viên khắc phục.',
    ],
    requirements: [
      'Mới tốt nghiệp hoặc có dưới 1 năm kinh nghiệm kiểm thử phần mềm.',
      'Biết sử dụng DevTools trình duyệt, Postman và SQL cơ bản.',
      'Tỉ mỉ, giao tiếp rõ ràng khi mô tả lỗi.',
    ],
  },
];

function deterministicUuid(seedKey: string): string {
  const hash = createHash('sha256').update(seedKey).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function buildDescriptionHtml(template: JobTemplate): string {
  const respItems = template.responsibilities
    .map((item) => `  <li>${item}</li>`)
    .join('\n');
  const reqItems = template.requirements
    .map((item) => `  <li>${item}</li>`)
    .join('\n');
  const benefitItems = template.benefits
    .map((item) => `  <li>${item}</li>`)
    .join('\n');

  return [
    '<h3>Mô tả công việc</h3>',
    `<p>${template.summary}</p>`,
    '<ul>',
    respItems,
    '</ul>',
    '<h3>Yêu cầu ứng viên</h3>',
    '<ul>',
    reqItems,
    '</ul>',
    '<h3>Quyền lợi</h3>',
    '<ul>',
    benefitItems,
    '</ul>',
  ].join('\n');
}

function pickTemplatesForCompany(
  company: Company,
  genericIndex: number,
): JobTemplate[] {
  const name = company.name.toLowerCase();
  if (name.includes('talentpulse')) return TALENTPULSE_TEMPLATES;
  if (name.includes('grandland')) return GRANDLAND_TEMPLATES;
  if (name.includes('creativepulse')) return CREATIVEPULSE_TEMPLATES;
  return genericIndex % 2 === 0 ? GENERIC_POOL_A : GENERIC_POOL_B;
}

function resolveCompanyGeo(
  company: Company,
  template: JobTemplate,
  companyIndex: number,
  jobIndex: number,
): { location: string; lat: number; lon: number } {
  if (
    template.location &&
    template.lat != null &&
    template.lon != null &&
    Number.isFinite(template.lat) &&
    Number.isFinite(template.lon)
  ) {
    return {
      location: template.location,
      lat: template.lat,
      lon: template.lon,
    };
  }
  if (
    company.lat != null &&
    company.lon != null &&
    Number.isFinite(Number(company.lat)) &&
    Number.isFinite(Number(company.lon))
  ) {
    const cityLabel = company.address?.includes('Hồ Chí Minh')
      ? 'TP. Hồ Chí Minh'
      : company.address?.includes('Đà Nẵng')
      ? 'Đà Nẵng'
      : 'Cầu Giấy, Hà Nội';
    return {
      location: cityLabel,
      lat: Number(company.lat),
      lon: Number(company.lon),
    };
  }
  const hub = FALLBACK_HUBS[(companyIndex + jobIndex) % FALLBACK_HUBS.length];
  return { ...hub };
}

function assertSafeRuntime(): void {
  const nodeEnv = String(process.env.NODE_ENV ?? 'development')
    .trim()
    .toLowerCase();
  if (nodeEnv === 'production') {
    throw new Error('Refusing to run sample job seed in production');
  }
}

async function ensureMasterSkills(
  manager: EntityManager,
  allSkills: Set<string>,
  actor: { _id: string; email: string },
): Promise<number> {
  const skillRepo = manager.getRepository(Skill);
  let inserted = 0;
  for (const rawSkill of allSkills) {
    const normalized = rawSkill.trim().toUpperCase();
    if (!normalized) continue;
    const existing = await skillRepo.findOne({ where: { name: normalized } });
    if (!existing) {
      await skillRepo.save(
        skillRepo.create({
          name: normalized,
          isDeleted: false,
          createdBy: actor,
        }),
      );
      inserted += 1;
    }
  }
  return inserted;
}

async function main(): Promise<void> {
  assertSafeRuntime();
  const dataSource = new DataSource(createDataSourceOptions());
  await dataSource.initialize();

  const summary: Array<{
    companyId: string;
    companyName: string;
    created: number;
    existing: number;
  }> = [];

  try {
    await dataSource.transaction(async (manager) => {
      const companyRepo = manager.getRepository(Company);
      const userRepo = manager.getRepository(User);
      const jobRepo = manager.getRepository(Job);

      const companies = await companyRepo.find({
        where: { isDeleted: false, isActive: true },
        order: { createdAt: 'ASC' },
      });

      const targetCompanies = companies.filter(
        (c) => c._id !== LOCAL_COMPANY_ID,
      );

      if (targetCompanies.length === 0) {
        throw new Error('No active non-deleted companies found to seed');
      }

      const defaultActor = {
        _id: 'seed-active-jobs',
        email: 'seed@talentpulse.local',
      };

      const requiredSkills = new Set<string>();
      const startDate = new Date();
      const endDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      const boostExpiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

      let genericCounter = 0;
      for (
        let companyIdx = 0;
        companyIdx < targetCompanies.length;
        companyIdx += 1
      ) {
        const company = targetCompanies[companyIdx];
        const lowerName = company.name.toLowerCase();
        const isNamedCompany =
          lowerName.includes('talentpulse') ||
          lowerName.includes('grandland') ||
          lowerName.includes('creativepulse');
        const templates = pickTemplatesForCompany(company, genericCounter);
        if (!isNamedCompany) {
          genericCounter += 1;
        }

        const hrOwner = await userRepo
          .createQueryBuilder('u')
          .where('u."isDeleted" = false')
          .andWhere('u.role = :role', { role: Role.HR })
          .andWhere("u.company->>'_id' = :companyId", {
            companyId: company._id,
          })
          .orderBy('u."createdAt"', 'ASC')
          .getOne();

        const actor = hrOwner
          ? { _id: hrOwner._id, email: hrOwner.email }
          : company.createdBy?._id
          ? company.createdBy
          : defaultActor;

        let createdCount = 0;
        let existingCount = 0;

        for (let jobIdx = 0; jobIdx < templates.length; jobIdx += 1) {
          const tpl = templates[jobIdx];
          tpl.skills.forEach((s) => requiredSkills.add(s));

          const seededId = deterministicUuid(
            `seed-active-jobs:${company._id}:${tpl.slug}`,
          );
          const geo = resolveCompanyGeo(company, tpl, companyIdx, jobIdx);

          const existingById = await jobRepo.findOne({
            where: { _id: seededId },
            withDeleted: true,
          });
          if (existingById) {
            existingById.startDate = startDate;
            existingById.endDate = endDate;
            existingById.isActive = true;
            existingById.isDeleted = false;
            existingById.deletedAt = null;
            existingById.lat = geo.lat;
            existingById.lon = geo.lon;
            existingById.location = geo.location;
            existingById.company = {
              _id: company._id,
              name: company.name,
              ...(company.logo ? { logo: company.logo } : {}),
              isActive: company.isActive,
              ...(company.scale ? { scale: company.scale } : {}),
              ...(company.address ? { address: company.address } : {}),
            };
            if (tpl.isHot) {
              existingById.isHot = true;
              existingById.boostedAt = startDate;
              existingById.boostExpiresAt = boostExpiresAt;
            }
            await jobRepo.save(existingById);
            existingCount += 1;
            continue;
          }

          const existingByName = await jobRepo
            .createQueryBuilder('j')
            .where('j."isDeleted" = false')
            .andWhere('j.name = :name', { name: tpl.name })
            .andWhere("j.company->>'_id' = :companyId", {
              companyId: company._id,
            })
            .getOne();

          if (existingByName) {
            existingCount += 1;
            continue;
          }

          const newJob = jobRepo.create({
            _id: seededId,
            name: tpl.name,
            description: buildDescriptionHtml(tpl),
            skills: [...tpl.skills],
            company: {
              _id: company._id,
              name: company.name,
              ...(company.logo ? { logo: company.logo } : {}),
              isActive: company.isActive,
              ...(company.scale ? { scale: company.scale } : {}),
              ...(company.address ? { address: company.address } : {}),
            },
            salary: tpl.salary,
            level: tpl.level,
            workingModel: tpl.workingModel,
            education: tpl.education,
            benefits: [...tpl.benefits],
            categories: [...tpl.categories],
            startDate,
            endDate,
            quantity: tpl.quantity,
            location: geo.location,
            lat: geo.lat,
            lon: geo.lon,
            isActive: true,
            isHot: Boolean(tpl.isHot),
            boostedAt: tpl.isHot ? startDate : null,
            boostExpiresAt: tpl.isHot ? boostExpiresAt : null,
            isFeatured: Boolean(tpl.isFeatured),
            isUrgent: Boolean(tpl.isUrgent),
            isDeleted: false,
            createdBy: actor,
            updatedBy: actor,
          });

          await jobRepo.save(newJob);
          createdCount += 1;
        }

        summary.push({
          companyId: company._id,
          companyName: company.name,
          created: createdCount,
          existing: existingCount,
        });
      }

      const skillsAdded = await ensureMasterSkills(
        manager,
        requiredSkills,
        defaultActor,
      );
      console.log(`Synced master skills catalog (newly added: ${skillsAdded})`);
    });

    console.log('Seeded active sample jobs per company:');
    console.table(summary);

    // Sync all non-deleted jobs to Elasticsearch
    const esNode = process.env.ELASTICSEARCH_NODE || 'http://localhost:9200';
    const esService = new ElasticsearchService(
      new ConfigService({ ELASTICSEARCH_NODE: esNode }),
    );
    await esService.ensureIndexExists();
    const nonDeletedJobs = await dataSource.getRepository(Job).find({
      where: { isDeleted: false },
      order: { createdAt: 'DESC' },
    });
    const { count, errors } = await esService.bulkIndexJobs(nonDeletedJobs);
    if (errors.length > 0) {
      throw new Error(
        `Elasticsearch bulk index returned ${errors.length} error(s)`,
      );
    }
    const esCount = await esService
      .getClient()
      .count({ index: TALENTPULSE_JOBS_INDEX });
    console.log(
      `Elasticsearch synced: ${count}/${nonDeletedJobs.length} jobs (index total: ${esCount.count})`,
    );
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }

  process.exit(0);
}

main().catch((error) => {
  console.error('Failed to seed active sample jobs:', error);
  process.exit(1);
});
