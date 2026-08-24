import { forwardRef } from 'react';
import type { OnlineCV, CVFontOption, CVThemeOption } from '../../lib/cvTypes';
import { CV_FONTS, CV_THEMES } from '../../lib/cvTypes';
import { Mail, Phone, MapPin, Globe, Sparkles } from 'lucide-react';

interface CVPreviewCanvasProps {
  data: Partial<OnlineCV>;
  fontFamilyId?: string;
  themeColorId?: string;
  fontSize?: 'small' | 'medium' | 'large';
  lineSpacing?: number;
  isPremium?: boolean;
  scale?: number;
  className?: string;
  cvLanguage?: 'vi' | 'en';
}

const SECTION_TITLES = {
  vi: {
    objective: 'Mục tiêu nghề nghiệp',
    education: 'Học vấn',
    experience: 'Kinh nghiệm làm việc',
    skills: 'Kỹ năng chuyên môn',
    activities: 'Hoạt động ngoại khóa & Dự án',
    certificates: 'Chứng chỉ',
    awards: 'Giải thưởng & Danh hiệu',
    contact: 'Thông tin liên hệ',
    personalInfo: 'Thông tin cá nhân',
  },
  en: {
    objective: 'Career Objective',
    education: 'Education',
    experience: 'Work Experience',
    skills: 'Professional Skills',
    activities: 'Activities & Projects',
    certificates: 'Certificates',
    awards: 'Honors & Awards',
    contact: 'Contact Information',
    personalInfo: 'Personal Information',
  },
};

export const CVPreviewCanvas = forwardRef<HTMLDivElement, CVPreviewCanvasProps>(
  (
    {
      data,
      fontFamilyId = 'inter',
      themeColorId = 'primary-blue',
      fontSize = 'medium',
      lineSpacing = 1.3,
      isPremium = false,
      scale = 1,
      className = '',
      cvLanguage = 'vi',
    },
    ref,
  ) => {
    const currentFont: CVFontOption =
      CV_FONTS.find((f) => f.id === fontFamilyId) || CV_FONTS[0];
    const currentTheme: CVThemeOption =
      CV_THEMES.find((t) => t.id === themeColorId) || CV_THEMES[0];

    const fontSizeMultipliers = {
      small: 0.9,
      medium: 1.0,
      large: 1.1,
    };
    const fontMultiplier = fontSizeMultipliers[fontSize] || 1.0;

    const templateType = data.templateType || 'template1';
    const langTitles = SECTION_TITLES[cvLanguage] || SECTION_TITLES.vi;

    return (
      <div
        className={`relative bg-white shadow-2xl transition-all select-text overflow-hidden ${className}`}
        style={{
          transform: scale !== 1 ? `scale(${scale})` : undefined,
          transformOrigin: 'top center',
          width: '210mm',
          minHeight: '297mm',
          fontFamily: currentFont.family,
          lineHeight: lineSpacing,
          color: '#1E293B',
        }}
        ref={ref}
        id="cv-print-area"
      >
        {/* Render Template 1: Classic Single-Column ATS Layout */}
        {templateType === 'template1' && (
          <div className="p-10 sm:p-12 flex flex-col justify-between min-h-[297mm]">
            <div>
              {/* Header */}
              <div
                className="text-center pb-6 mb-7 border-b-2"
                style={{ borderColor: currentTheme.color }}
              >
                <h1
                  className="text-2xl sm:text-3xl font-extrabold uppercase tracking-wide mb-1.5"
                  style={{
                    color: currentTheme.color,
                    fontSize: `${1.75 * fontMultiplier}rem`,
                  }}
                >
                  {data.fullName || 'HỌ VÀ TÊN CỦA BẠN'}
                </h1>
                <p
                  className="font-medium text-slate-600 mb-3 tracking-wide"
                  style={{ fontSize: `${1.05 * fontMultiplier}rem` }}
                >
                  {data.position || 'Vị trí công việc ứng tuyển'}
                </p>

                {/* Contact info list - Always single line */}
                <div
                  className="flex flex-nowrap items-center justify-center gap-x-2 sm:gap-x-3 text-slate-600 max-w-full"
                  style={{ fontSize: `${0.85 * fontMultiplier}rem` }}
                >
                  {data.phone && (
                    <span className="inline-flex items-center gap-1 shrink-0">
                      <Phone className="h-3.5 w-3.5" style={{ color: currentTheme.color }} />
                      <span>{data.phone}</span>
                    </span>
                  )}
                  {data.phone && data.email && <span className="text-slate-300 select-none">&bull;</span>}
                  {data.email && (
                    <span className="inline-flex items-center gap-1 shrink-0">
                      <Mail className="h-3.5 w-3.5" style={{ color: currentTheme.color }} />
                      <span>{data.email}</span>
                    </span>
                  )}
                  {data.email && data.link && <span className="text-slate-300 select-none">&bull;</span>}
                  {data.link && (
                    <span className="inline-flex items-center gap-1 shrink-0">
                      <Globe className="h-3.5 w-3.5" style={{ color: currentTheme.color }} />
                      <span>{data.link}</span>
                    </span>
                  )}
                  {data.link && data.address && <span className="text-slate-300 select-none">&bull;</span>}
                  {data.address && (
                    <span className="inline-flex items-center gap-1 shrink-0">
                      <MapPin className="h-3.5 w-3.5" style={{ color: currentTheme.color }} />
                      <span>{data.address}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Dynamic Sections rendering based on sectionOrder */}
              {(
                data.sectionOrder || [
                  'objective',
                  'education',
                  'experience',
                  'skills',
                  'activities',
                  'certificates',
                  'awards',
                ]
              ).map((secKey) => {
                // 1. Objective
                if (secKey === 'objective' && data.careerObjective) {
                  return (
                    <div key="objective" className="mb-6">
                      <h2
                        className="text-sm font-bold uppercase tracking-wider pb-1 mb-2.5 border-b"
                        style={{
                          color: currentTheme.color,
                          borderColor: '#E2E8F0',
                          fontSize: `${0.95 * fontMultiplier}rem`,
                        }}
                      >
                        {langTitles.objective}
                      </h2>
                      <p
                        className="text-slate-700 leading-relaxed text-justify"
                        style={{ fontSize: `${0.875 * fontMultiplier}rem` }}
                      >
                        {data.careerObjective}
                      </p>
                    </div>
                  );
                }

                // 2. Education
                if (secKey === 'education' && data.education && data.education.length > 0) {
                  return (
                    <div key="education" className="mb-6">
                      <h2
                        className="text-sm font-bold uppercase tracking-wider pb-1 mb-2.5 border-b"
                        style={{
                          color: currentTheme.color,
                          borderColor: '#E2E8F0',
                          fontSize: `${0.95 * fontMultiplier}rem`,
                        }}
                      >
                        {langTitles.education}
                      </h2>
                      <div className="space-y-3">
                        {data.education.map((edu, idx) => (
                          <div key={idx} className="group">
                            <div className="flex items-baseline justify-between">
                              <span
                                className="font-bold text-slate-900"
                                style={{ fontSize: `${0.9 * fontMultiplier}rem` }}
                              >
                                {edu.schoolName || 'Tên trường học / Viện đào tạo'}
                              </span>
                              <span
                                className="text-xs text-slate-500 font-medium shrink-0 ml-2"
                                style={{ fontSize: `${0.8 * fontMultiplier}rem` }}
                              >
                                {edu.startDate} {edu.startDate && edu.endDate ? '—' : ''} {edu.endDate}
                              </span>
                            </div>
                            {edu.major && (
                              <p
                                className="font-medium text-slate-700 italic mt-0.5"
                                style={{ fontSize: `${0.85 * fontMultiplier}rem` }}
                              >
                                {edu.major}
                              </p>
                            )}
                            {edu.description && (
                              <p
                                className="text-slate-600 mt-1 whitespace-pre-line"
                                style={{ fontSize: `${0.825 * fontMultiplier}rem` }}
                              >
                                {edu.description}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }

                // 3. Work Experience
                if (secKey === 'experience' && data.workExperience && data.workExperience.length > 0) {
                  return (
                    <div key="experience" className="mb-6">
                      <h2
                        className="text-sm font-bold uppercase tracking-wider pb-1 mb-2.5 border-b"
                        style={{
                          color: currentTheme.color,
                          borderColor: '#E2E8F0',
                          fontSize: `${0.95 * fontMultiplier}rem`,
                        }}
                      >
                        {langTitles.experience}
                      </h2>
                      <div className="space-y-3.5">
                        {data.workExperience.map((exp, idx) => (
                          <div key={idx}>
                            <div className="flex items-baseline justify-between">
                              <span
                                className="font-bold text-slate-900"
                                style={{ fontSize: `${0.9 * fontMultiplier}rem` }}
                              >
                                {exp.companyName || 'Tên công ty / Doanh nghiệp'}
                              </span>
                              <span
                                className="text-xs text-slate-500 font-medium shrink-0 ml-2"
                                style={{ fontSize: `${0.8 * fontMultiplier}rem` }}
                              >
                                {exp.startDate} {exp.startDate && exp.endDate ? '—' : ''} {exp.endDate}
                              </span>
                            </div>
                            {exp.position && (
                              <p
                                className="font-semibold text-slate-700 mt-0.5"
                                style={{
                                  color: currentTheme.color,
                                  fontSize: `${0.85 * fontMultiplier}rem`,
                                }}
                              >
                                {exp.position}
                              </p>
                            )}
                            {exp.description && (
                              <p
                                className="text-slate-600 mt-1 whitespace-pre-line text-justify"
                                style={{ fontSize: `${0.825 * fontMultiplier}rem` }}
                              >
                                {exp.description}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }

                // 4. Skills
                if (secKey === 'skills' && data.skills && data.skills.length > 0) {
                  return (
                    <div key="skills" className="mb-6">
                      <h2
                        className="text-sm font-bold uppercase tracking-wider pb-1 mb-2.5 border-b"
                        style={{
                          color: currentTheme.color,
                          borderColor: '#E2E8F0',
                          fontSize: `${0.95 * fontMultiplier}rem`,
                        }}
                      >
                        {langTitles.skills}
                      </h2>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {data.skills.map((skill, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <span
                              className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: currentTheme.color }}
                            />
                            <div style={{ fontSize: `${0.85 * fontMultiplier}rem` }}>
                              <span className="font-bold text-slate-900">{skill.name}</span>
                              {skill.description && (
                                <span className="text-slate-600 ml-1.5">— {skill.description}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }

                // 5. Activities
                if (secKey === 'activities' && data.activities && data.activities.length > 0) {
                  return (
                    <div key="activities" className="mb-6">
                      <h2
                        className="text-sm font-bold uppercase tracking-wider pb-1 mb-2.5 border-b"
                        style={{
                          color: currentTheme.color,
                          borderColor: '#E2E8F0',
                          fontSize: `${0.95 * fontMultiplier}rem`,
                        }}
                      >
                        {langTitles.activities}
                      </h2>
                      <div className="space-y-3">
                        {data.activities.map((act, idx) => (
                          <div key={idx}>
                            <div className="flex items-baseline justify-between">
                              <span
                                className="font-bold text-slate-900"
                                style={{ fontSize: `${0.9 * fontMultiplier}rem` }}
                              >
                                {act.organizationName}
                              </span>
                              <span
                                className="text-xs text-slate-500 font-medium shrink-0 ml-2"
                                style={{ fontSize: `${0.8 * fontMultiplier}rem` }}
                              >
                                {act.startDate} {act.startDate && act.endDate ? '—' : ''} {act.endDate}
                              </span>
                            </div>
                            {act.position && (
                              <p
                                className="font-medium italic text-slate-700"
                                style={{ fontSize: `${0.85 * fontMultiplier}rem` }}
                              >
                                {act.position}
                              </p>
                            )}
                            {act.description && (
                              <p
                                className="text-slate-600 mt-1 whitespace-pre-line"
                                style={{ fontSize: `${0.825 * fontMultiplier}rem` }}
                              >
                                {act.description}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }

                // 6. Certificates
                if (secKey === 'certificates' && data.certificates && data.certificates.length > 0) {
                  return (
                    <div key="certificates" className="mb-6">
                      <h2
                        className="text-sm font-bold uppercase tracking-wider pb-1 mb-2.5 border-b"
                        style={{
                          color: currentTheme.color,
                          borderColor: '#E2E8F0',
                          fontSize: `${0.95 * fontMultiplier}rem`,
                        }}
                      >
                        {langTitles.certificates}
                      </h2>
                      <div className="space-y-1.5">
                        {data.certificates.map((cert, idx) => (
                          <div
                            key={idx}
                            className="flex items-baseline justify-between"
                            style={{ fontSize: `${0.85 * fontMultiplier}rem` }}
                          >
                            <span className="font-semibold text-slate-800">• {cert.name}</span>
                            {cert.date && <span className="text-xs text-slate-500">{cert.date}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }

                // 7. Awards
                if (secKey === 'awards' && data.awards && data.awards.length > 0) {
                  return (
                    <div key="awards" className="mb-6">
                      <h2
                        className="text-sm font-bold uppercase tracking-wider pb-1 mb-2.5 border-b"
                        style={{
                          color: currentTheme.color,
                          borderColor: '#E2E8F0',
                          fontSize: `${0.95 * fontMultiplier}rem`,
                        }}
                      >
                        {langTitles.awards}
                      </h2>
                      <div className="space-y-1.5">
                        {data.awards.map((award, idx) => (
                          <div
                            key={idx}
                            className="flex items-baseline justify-between"
                            style={{ fontSize: `${0.85 * fontMultiplier}rem` }}
                          >
                            <span className="font-semibold text-slate-800">• {award.name}</span>
                            {award.date && <span className="text-xs text-slate-500">{award.date}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }

                return null;
              })}
            </div>

            {/* Bottom Watermark (Free Tier) */}
            {!isPremium ? (
              <div className="mt-8 pt-3 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-400 select-none">
                <span>Trang 1 / 1</span>
                <span className="inline-flex items-center gap-1 font-semibold text-slate-500">
                  <Sparkles className="h-3 w-3 text-primary" />
                  Được tạo bởi <b className="text-slate-700">TalentPulse</b> — talentpulse.vn
                </span>
              </div>
            ) : (
              <div className="mt-8 pt-3 text-right text-[10px] text-slate-400 select-none">
                Trang 1 / 1
              </div>
            )}
          </div>
        )}

        {/* Render Template 2: Modern Two-Column Timeline Layout */}
        {templateType === 'template2' && (
          <div className="p-8 sm:p-10 flex flex-col justify-between min-h-[297mm]">
            <div>
              {/* Modern Header with Gradient / Accent bar */}
              <div className="flex flex-col sm:flex-row items-start justify-between gap-4 pb-6 mb-6 border-b-2 border-slate-200">
                <div className="flex-1">
                  <h1
                    className="text-2xl sm:text-3xl font-black uppercase tracking-tight"
                    style={{
                      color: currentTheme.color,
                      fontSize: `${1.75 * fontMultiplier}rem`,
                    }}
                  >
                    {data.fullName || 'HỌ VÀ TÊN CỦA BẠN'}
                  </h1>
                  <p
                    className="font-bold text-slate-600 uppercase tracking-wider mt-0.5"
                    style={{ fontSize: `${0.95 * fontMultiplier}rem` }}
                  >
                    {data.position || 'VỊ TRÍ ỨNG TUYỂN'}
                  </p>
                  {data.careerObjective && (
                    <p
                      className="text-slate-600 mt-2 leading-relaxed text-justify"
                      style={{ fontSize: `${0.825 * fontMultiplier}rem` }}
                    >
                      {data.careerObjective}
                    </p>
                  )}
                </div>

                {/* Right Contacts Box */}
                <div
                  className="rounded-xl p-3.5 space-y-1.5 text-xs text-slate-700 shrink-0 border border-slate-100"
                  style={{
                    backgroundColor: currentTheme.bgLight,
                    fontSize: `${0.825 * fontMultiplier}rem`,
                  }}
                >
                  {data.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 shrink-0" style={{ color: currentTheme.color }} />
                      <span>{data.phone}</span>
                    </div>
                  )}
                  {data.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 shrink-0" style={{ color: currentTheme.color }} />
                      <span className="truncate max-w-[180px]">{data.email}</span>
                    </div>
                  )}
                  {data.address && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: currentTheme.color }} />
                      <span>{data.address}</span>
                    </div>
                  )}
                  {data.link && (
                    <div className="flex items-center gap-2">
                      <Globe className="h-3.5 w-3.5 shrink-0" style={{ color: currentTheme.color }} />
                      <span className="truncate max-w-[180px]">{data.link}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Main 2-Column Split */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-6">
                {/* Left Column (Work Experience & Projects - 7 cols) */}
                <div className="sm:col-span-7 space-y-6">
                  {/* Work Experience */}
                  {data.workExperience && data.workExperience.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 pb-1 mb-3.5 border-b border-slate-200">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: currentTheme.color }}
                        />
                        <h2
                          className="text-xs font-black uppercase tracking-wider text-slate-900"
                          style={{
                            color: currentTheme.color,
                            fontSize: `${0.9 * fontMultiplier}rem`,
                          }}
                        >
                          {langTitles.experience}
                        </h2>
                      </div>

                      <div className="space-y-4 relative pl-3 border-l-2 border-slate-200 ml-1">
                        {data.workExperience.map((exp, idx) => (
                          <div key={idx} className="relative">
                            {/* Dot on timeline */}
                            <span
                              className="absolute -left-[19px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white"
                              style={{ backgroundColor: currentTheme.color }}
                            />
                            <div className="flex items-baseline justify-between">
                              <h3
                                className="font-bold text-slate-900"
                                style={{ fontSize: `${0.875 * fontMultiplier}rem` }}
                              >
                                {exp.position || 'Vị trí'}
                              </h3>
                              <span className="text-[11px] font-medium text-slate-500">
                                {exp.startDate} {exp.startDate && exp.endDate ? '—' : ''} {exp.endDate}
                              </span>
                            </div>
                            <p
                              className="font-semibold text-slate-700 text-xs mt-0.5"
                              style={{ color: currentTheme.color }}
                            >
                              {exp.companyName}
                            </p>
                            {exp.description && (
                              <p
                                className="text-slate-600 text-xs mt-1 leading-relaxed whitespace-pre-line"
                                style={{ fontSize: `${0.8 * fontMultiplier}rem` }}
                              >
                                {exp.description}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Activities */}
                  {data.activities && data.activities.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 pb-1 mb-3.5 border-b border-slate-200">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: currentTheme.color }}
                        />
                        <h2
                          className="text-xs font-black uppercase tracking-wider text-slate-900"
                          style={{
                            color: currentTheme.color,
                            fontSize: `${0.9 * fontMultiplier}rem`,
                          }}
                        >
                          {langTitles.activities}
                        </h2>
                      </div>

                      <div className="space-y-3 relative pl-3 border-l-2 border-slate-200 ml-1">
                        {data.activities.map((act, idx) => (
                          <div key={idx} className="relative">
                            <span
                              className="absolute -left-[19px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white"
                              style={{ backgroundColor: currentTheme.color }}
                            />
                            <div className="flex items-baseline justify-between">
                              <h3
                                className="font-bold text-slate-900"
                                style={{ fontSize: `${0.875 * fontMultiplier}rem` }}
                              >
                                {act.organizationName}
                              </h3>
                              <span className="text-[11px] font-medium text-slate-500">
                                {act.startDate} {act.startDate && act.endDate ? '—' : ''} {act.endDate}
                              </span>
                            </div>
                            {act.position && (
                              <p className="font-medium italic text-slate-600 text-xs">
                                {act.position}
                              </p>
                            )}
                            {act.description && (
                              <p
                                className="text-slate-600 text-xs mt-1 whitespace-pre-line"
                                style={{ fontSize: `${0.8 * fontMultiplier}rem` }}
                              >
                                {act.description}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Column (Education, Skills, Certificates, Awards - 5 cols) */}
                <div className="sm:col-span-5 space-y-6">
                  {/* Education */}
                  {data.education && data.education.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 pb-1 mb-3 border-b border-slate-200">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: currentTheme.color }}
                        />
                        <h2
                          className="text-xs font-black uppercase tracking-wider text-slate-900"
                          style={{
                            color: currentTheme.color,
                            fontSize: `${0.9 * fontMultiplier}rem`,
                          }}
                        >
                          {langTitles.education}
                        </h2>
                      </div>
                      <div className="space-y-2.5">
                        {data.education.map((edu, idx) => (
                          <div key={idx} className="bg-slate-50/80 p-2.5 rounded-lg border border-slate-100">
                            <p
                              className="font-bold text-slate-900"
                              style={{ fontSize: `${0.85 * fontMultiplier}rem` }}
                            >
                              {edu.schoolName}
                            </p>
                            <p
                              className="font-semibold text-xs mt-0.5"
                              style={{ color: currentTheme.color }}
                            >
                              {edu.major}
                            </p>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {edu.startDate} {edu.startDate && edu.endDate ? '—' : ''} {edu.endDate}
                            </p>
                            {edu.description && (
                              <p className="text-[11px] text-slate-600 mt-1">
                                {edu.description}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Skills */}
                  {data.skills && data.skills.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 pb-1 mb-3 border-b border-slate-200">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: currentTheme.color }}
                        />
                        <h2
                          className="text-xs font-black uppercase tracking-wider text-slate-900"
                          style={{
                            color: currentTheme.color,
                            fontSize: `${0.9 * fontMultiplier}rem`,
                          }}
                        >
                          {langTitles.skills}
                        </h2>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {data.skills.map((skill, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold text-xs border border-slate-200"
                            style={{
                              backgroundColor: currentTheme.bgLight,
                              color: currentTheme.color,
                              fontSize: `${0.8 * fontMultiplier}rem`,
                            }}
                          >
                            {skill.name}
                            {skill.description && (
                              <span className="text-[10px] text-slate-500 font-normal">
                                ({skill.description})
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Certificates */}
                  {data.certificates && data.certificates.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 pb-1 mb-2.5 border-b border-slate-200">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: currentTheme.color }}
                        />
                        <h2
                          className="text-xs font-black uppercase tracking-wider text-slate-900"
                          style={{
                            color: currentTheme.color,
                            fontSize: `${0.9 * fontMultiplier}rem`,
                          }}
                        >
                          {langTitles.certificates}
                        </h2>
                      </div>
                      <div className="space-y-1 text-xs">
                        {data.certificates.map((cert, idx) => (
                          <div key={idx} className="flex items-baseline justify-between text-slate-800">
                            <span className="font-semibold">• {cert.name}</span>
                            {cert.date && <span className="text-[11px] text-slate-500">{cert.date}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Awards */}
                  {data.awards && data.awards.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 pb-1 mb-2.5 border-b border-slate-200">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: currentTheme.color }}
                        />
                        <h2
                          className="text-xs font-black uppercase tracking-wider text-slate-900"
                          style={{
                            color: currentTheme.color,
                            fontSize: `${0.9 * fontMultiplier}rem`,
                          }}
                        >
                          {langTitles.awards}
                        </h2>
                      </div>
                      <div className="space-y-1 text-xs">
                        {data.awards.map((award, idx) => (
                          <div key={idx} className="flex items-baseline justify-between text-slate-800">
                            <span className="font-semibold">• {award.name}</span>
                            {award.date && <span className="text-[11px] text-slate-500">{award.date}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Watermark (Free Tier) */}
            {!isPremium ? (
              <div className="mt-8 pt-3 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-400 select-none">
                <span>Trang 1 / 1</span>
                <span className="inline-flex items-center gap-1 font-semibold text-slate-500">
                  <Sparkles className="h-3 w-3 text-primary" />
                  Được tạo bởi <b className="text-slate-700">TalentPulse</b> — talentpulse.vn
                </span>
              </div>
            ) : (
              <div className="mt-8 pt-3 text-right text-[10px] text-slate-400 select-none">
                Trang 1 / 1
              </div>
            )}
          </div>
        )}
      </div>
    );
  },
);

CVPreviewCanvas.displayName = 'CVPreviewCanvas';
