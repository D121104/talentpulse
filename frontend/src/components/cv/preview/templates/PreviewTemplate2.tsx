import { Phone, Mail, Globe, MapPin, Sparkles } from 'lucide-react';
import type { CVPreviewTemplateProps } from '../CVPreviewTemplateProps';

export function PreviewTemplate2({
  data,
  currentTheme,
  fontMultiplier,
  langTitles,
}: CVPreviewTemplateProps) {
  return (
    <div className="p-8 sm:p-10 flex flex-col justify-between min-h-[297mm] h-auto w-full">
      <div className="flex-1 w-full">
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
            className="rounded-xl p-3.5 space-y-1.5 text-xs text-slate-700 shrink-0 border border-slate-100 max-w-[280px]"
            style={{
              backgroundColor: currentTheme.bgLight,
              fontSize: `${0.825 * fontMultiplier}rem`,
            }}
          >
            {data.phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 shrink-0" style={{ color: currentTheme.color }} />
                <span className="break-all">{data.phone}</span>
              </div>
            )}
            {data.email && (
              <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 shrink-0" style={{ color: currentTheme.color }} />
                <span className="break-all">{data.email}</span>
              </div>
            )}
            {data.address && (
              <div className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: currentTheme.color }} />
                <span className="break-words">{data.address}</span>
              </div>
            )}
            {data.link && (
              <div className="flex items-center gap-2">
                <Globe className="h-3.5 w-3.5 shrink-0" style={{ color: currentTheme.color }} />
                <span className="break-all">{data.link}</span>
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
