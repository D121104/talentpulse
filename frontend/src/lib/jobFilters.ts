export interface FeaturedCityOption {
  name: string;
  aliases?: string[];
  featured?: boolean;
}

export const FEATURED_CITIES: FeaturedCityOption[] = [
  { name: 'Hà Nội', aliases: ['ha noi', 'hn'], featured: true },
  { name: 'Hồ Chí Minh', aliases: ['ho chi minh', 'hcm', 'tphcm', 'sai gon'], featured: true },
  { name: 'Đà Nẵng', aliases: ['da nang'], featured: true },
  { name: 'Hải Phòng', aliases: ['hai phong'], featured: true },
  { name: 'Cần Thơ', aliases: ['can tho'], featured: true },
  { name: 'Bình Dương', aliases: ['binh duong'], featured: true },
  { name: 'Đồng Nai', aliases: ['dong nai', 'bien hoa'] },
  { name: 'Bắc Ninh', aliases: ['bac ninh'] },
  { name: 'Hưng Yên', aliases: ['hung yen'] },
  { name: 'Quảng Ninh', aliases: ['quang ninh', 'ha long'] },
  { name: 'Bà Rịa - Vũng Tàu', aliases: ['vung tau', 'ba ria'] },
  { name: 'Khánh Hòa', aliases: ['khanh hoa', 'nha trang'] },
  { name: 'Thừa Thiên Huế', aliases: ['hue', 'thua thien hue'] },
  { name: 'Thái Nguyên', aliases: ['thai nguyen'] },
  { name: 'Long An', aliases: ['long an'] },
  { name: 'Nghệ An', aliases: ['nghe an', 'vinh'] },
  { name: 'Lâm Đồng', aliases: ['lam dong', 'da lat'] },
];

export const JOB_LEVEL_OPTIONS = [
  { id: 'Intern', label: 'Intern', desc: 'Thực tập sinh' },
  { id: 'Fresher', label: 'Fresher', desc: 'Dưới 1 năm kinh nghiệm' },
  { id: 'Junior', label: 'Junior', desc: '1 - 2 năm kinh nghiệm' },
  { id: 'Middle', label: 'Middle', desc: '2 - 4 năm kinh nghiệm' },
  { id: 'Senior', label: 'Senior', desc: '5+ năm kinh nghiệm' },
  { id: 'Lead', label: 'Lead / Trưởng nhóm', desc: 'Quản lý nhóm kỹ thuật' },
  { id: 'Manager', label: 'Manager / Trưởng phòng', desc: 'Quản lý bộ phận' },
  { id: 'Director', label: 'Director / Giám đốc', desc: 'Cấp quản lý cấp cao' },
];

export interface SalaryPresetOption {
  id: string;
  label: string;
  desc: string;
  min?: number;
  max?: number;
  negotiable?: boolean;
}

export const SALARY_PRESETS: SalaryPresetOption[] = [
  { id: '', label: 'Tất cả mức lương', desc: 'Không giới hạn khoảng lương' },
  { id: '0-10000000', label: 'Dưới 10 triệu', desc: '< 10 triệu VNĐ', min: 0, max: 10000000 },
  {
    id: '10000000-15000000',
    label: '10 - 15 triệu',
    desc: '10M - 15M VNĐ',
    min: 10000000,
    max: 15000000,
  },
  {
    id: '15000000-20000000',
    label: '15 - 20 triệu',
    desc: '15M - 20M VNĐ',
    min: 15000000,
    max: 20000000,
  },
  {
    id: '20000000-25000000',
    label: '20 - 25 triệu',
    desc: '20M - 25M VNĐ',
    min: 20000000,
    max: 25000000,
  },
  {
    id: '25000000-30000000',
    label: '25 - 30 triệu',
    desc: '25M - 30M VNĐ',
    min: 25000000,
    max: 30000000,
  },
  {
    id: '30000000-50000000',
    label: '30 - 50 triệu',
    desc: '30M - 50M VNĐ',
    min: 30000000,
    max: 50000000,
  },
  {
    id: '50000000-999999999',
    label: 'Trên 50 triệu',
    desc: '> 50 triệu VNĐ',
    min: 50000000,
    max: 999999999,
  },
  {
    id: 'negotiable',
    label: 'Thỏa thuận',
    desc: 'Lương thương lượng khi phỏng vấn',
    negotiable: true,
  },
];

export const WORKING_MODEL_OPTIONS = [
  { id: '', label: 'Tất cả' },
  { id: 'Onsite', label: 'Onsite' },
  { id: 'Hybrid', label: 'Hybrid' },
  { id: 'Remote', label: 'Remote' },
];

export function normalizeFilterText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

export function parseSalaryPresetValue(presetId: string): {
  minSalary?: number;
  maxSalary?: number;
  negotiable?: boolean;
} {
  if (!presetId) return {};
  if (presetId === 'negotiable') return { negotiable: true };

  const [minStr, maxStr] = presetId.split('-');
  const minSalary = Number(minStr);
  const maxSalary = Number(maxStr);
  return {
    ...(Number.isFinite(minSalary) ? { minSalary } : {}),
    ...(Number.isFinite(maxSalary) ? { maxSalary } : {}),
  };
}

export function formatShortSalaryLabel(salary: number | string | null | undefined): string {
  if (salary === null || salary === undefined || salary === '' || salary === 0 || salary === '0') {
    return 'Thỏa thuận';
  }
  const num = typeof salary === 'string' ? parseFloat(salary) : salary;
  if (!Number.isFinite(num) || num <= 0) return 'Thỏa thuận';
  if (num >= 1000000) {
    const millions = Math.round((num / 1000000) * 10) / 10;
    return `${millions}tr`;
  }
  if (num >= 1000) {
    return `${Math.round(num / 1000)}k`;
  }
  return `${num}đ`;
}

export function buildGoogleMapsDirectionsUrl(
  destLat: number,
  destLon: number,
  origin?: { lat: number; lon: number } | null,
): string {
  const params = new URLSearchParams({
    api: '1',
    destination: `${destLat},${destLon}`,
    travelmode: 'driving',
  });
  if (
    origin &&
    Number.isFinite(origin.lat) &&
    Number.isFinite(origin.lon)
  ) {
    params.set('origin', `${origin.lat},${origin.lon}`);
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export interface JobLocationCluster<T> {
  key: string;
  lat: number;
  lon: number;
  distanceKm: number | null;
  jobs: T[];
}

export function clusterJobsByLocation<
  T extends { lat?: number | null; lon?: number | null; distanceKm?: number | null },
>(jobs: T[]): JobLocationCluster<T>[] {
  const map = new Map<string, JobLocationCluster<T>>();

  for (const job of jobs) {
    if (job.lat == null || job.lon == null || !Number.isFinite(job.lat) || !Number.isFinite(job.lon)) {
      continue;
    }

    const key = `${job.lat.toFixed(4)},${job.lon.toFixed(4)}`;
    const existing = map.get(key);
    if (existing) {
      existing.jobs.push(job);
      if (
        job.distanceKm != null &&
        (existing.distanceKm == null || job.distanceKm < existing.distanceKm)
      ) {
        existing.distanceKm = job.distanceKm;
      }
    } else {
      map.set(key, {
        key,
        lat: job.lat,
        lon: job.lon,
        distanceKm: job.distanceKm ?? null,
        jobs: [job],
      });
    }
  }

  return Array.from(map.values());
}
