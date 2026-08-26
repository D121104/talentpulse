import { Phone, Mail, Globe, MapPin, Sparkles } from 'lucide-react';
import type { CVPreviewTemplateProps } from '../CVPreviewTemplateProps';

export function PreviewTemplate1({
  data,
  currentTheme,
  fontMultiplier,
  langTitles,
}: CVPreviewTemplateProps) {
  return (
    <div className="p-10 sm:p-12 flex flex-col justify-between min-h-[297mm] h-auto w-full">
      <div className="flex-1 w-full">
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

          {/* Contact info list - TopCV responsive wrap style */}
          <div
            className="flex flex-wrap items-center justify-center gap-x-4 sm:gap-x-5 gap-y-2 text-slate-600 max-w-full"
            style={{ fontSize: `${0.85 * fontMultiplier}rem` }}
          >
            {data.phone && (
              <span className="inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                <Phone className="h-3.5 w-3.5 shrink-0" style={{ color: currentTheme.color }} />
                <span>{data.phone}</span>
              </span>
            )}
            {data.email && (
              <span className="inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                <Mail className="h-3.5 w-3.5 shrink-0" style={{ color: currentTheme.color }} />
                <span>{data.email}</span>
              </span>
            )}
            {data.link && (
              <span className="inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                <Globe className="h-3.5 w-3.5 shrink-0" style={{ color: currentTheme.color }} />
                <span>{data.link}</span>
              </span>
            )}
            {data.address && (
              <span className="inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: currentTheme.color }} />
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

      {/* Bottom Watermark */}
      <div
        className="cv-watermark mt-8 pt-3 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-400 select-none"
        data-watermark="true"
      >
        <span>Trang 1 / 1</span>
        <span className="inline-flex items-center gap-1 font-semibold text-slate-500">
          <Sparkles className="h-3 w-3 text-primary" />
          Được tạo bởi <b className="text-slate-700">TalentPulse</b> — talentpulse.vn
        </span>
      </div>
    </div>
  );
}
