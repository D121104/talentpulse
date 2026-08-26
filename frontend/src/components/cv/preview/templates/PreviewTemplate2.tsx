import { Phone, Mail, Globe, MapPin, Sparkles } from 'lucide-react';
import type { CVPreviewTemplateProps } from '../CVPreviewTemplateProps';

export function PreviewTemplate2({
  data,
  currentTheme,
  fontMultiplier,
  langTitles,
}: CVPreviewTemplateProps) {
  return (
    <div className="p-8 sm:p-10 flex flex-col justify-between min-h-[297mm] h-auto w-full box-border">
      <div className="flex-1 w-full">
        {/* ================= TOP HEADER ================= */}
        <div className="flex flex-col sm:flex-row items-start justify-between gap-5 pb-6 mb-7 border-b-2 border-slate-200/90">
          <div className="flex-1 min-w-0 pr-2">
            <h1
              className="text-2xl sm:text-3xl font-black uppercase tracking-tight leading-tight"
              style={{
                color: currentTheme.color,
                fontSize: `${1.75 * fontMultiplier}rem`,
              }}
            >
              {data.fullName || 'HỌ VÀ TÊN CỦA BẠN'}
            </h1>
            <p
              className="font-bold text-slate-600 uppercase tracking-wider mt-1"
              style={{ fontSize: `${0.95 * fontMultiplier}rem` }}
            >
              {data.position || 'VỊ TRÍ ỨNG TUYỂN'}
            </p>
            {data.careerObjective && (
              <p
                className="text-slate-600 mt-2.5 leading-relaxed text-justify"
                style={{ fontSize: `${0.825 * fontMultiplier}rem` }}
              >
                {data.careerObjective}
              </p>
            )}
          </div>

          {/* Right Contacts Box */}
          <div
            className="rounded-2xl p-4 space-y-2 text-xs text-slate-700 shrink-0 border border-slate-200/70 shadow-xs max-w-[290px] w-full sm:w-auto"
            style={{
              backgroundColor: currentTheme.bgLight,
              fontSize: `${0.825 * fontMultiplier}rem`,
            }}
          >
            {data.phone && (
              <div className="flex items-center gap-2">
                <div className="flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-lg bg-white/80 shadow-2xs">
                  <Phone className="h-3 w-3" style={{ color: currentTheme.color }} />
                </div>
                <span className="break-all">{data.phone}</span>
              </div>
            )}
            {data.email && (
              <div className="flex items-center gap-2">
                <div className="flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-lg bg-white/80 shadow-2xs">
                  <Mail className="h-3 w-3" style={{ color: currentTheme.color }} />
                </div>
                <span className="break-all">{data.email}</span>
              </div>
            )}
            {data.address && (
              <div className="flex items-center gap-2">
                <div className="flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-lg bg-white/80 shadow-2xs">
                  <MapPin className="h-3 w-3" style={{ color: currentTheme.color }} />
                </div>
                <span className="break-words">{data.address}</span>
              </div>
            )}
            {data.link && (
              <div className="flex items-center gap-2">
                <div className="flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-lg bg-white/80 shadow-2xs">
                  <Globe className="h-3 w-3" style={{ color: currentTheme.color }} />
                </div>
                <span className="break-all">{data.link}</span>
              </div>
            )}
          </div>
        </div>

        {/* ================= 2-COLUMN MAIN BODY ================= */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-7">
          {/* LEFT COLUMN: Experience & Activities (7 cols) */}
          <div className="sm:col-span-7 space-y-7">
            {/* 1. Work Experience */}
            {data.workExperience && data.workExperience.length > 0 && (
              <div>
                <div className="flex items-center gap-2 pb-1.5 mb-4 border-b border-slate-200">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
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

                <div className="space-y-4 relative pl-3.5 border-l-2 border-slate-200 ml-1.5">
                  {data.workExperience.map((exp, idx) => (
                    <div key={idx} className="relative p-1">
                      {/* Dot on timeline */}
                      <span
                        className="absolute -left-[21px] top-2 h-2.5 w-2.5 rounded-full border-2 border-white shadow-2xs"
                        style={{ backgroundColor: currentTheme.color }}
                      />
                      {/* Header Row: Position on left, Date Badge on Top-Right */}
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex-1 min-w-0">
                          <h3
                            className="font-extrabold text-slate-900 leading-snug"
                            style={{ fontSize: `${0.875 * fontMultiplier}rem` }}
                          >
                            {exp.position || 'Vị trí công việc'}
                          </h3>
                          <p
                            className="font-bold text-xs mt-0.5"
                            style={{ color: currentTheme.color }}
                          >
                            {exp.companyName}
                          </p>
                        </div>
                        {(exp.startDate || exp.endDate) && (
                          <div className="inline-flex items-center justify-end text-[11px] font-medium text-slate-600 bg-slate-100/90 px-2 py-0.5 rounded-md border border-slate-200/70 shrink-0 mt-0.5 shadow-2xs">
                            {exp.startDate} {exp.startDate && exp.endDate ? '-' : ''} {exp.endDate}
                          </div>
                        )}
                      </div>
                      {exp.description && (
                        <p
                          className="text-slate-600 text-xs mt-1.5 leading-relaxed whitespace-pre-line"
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

            {/* 2. Activities & Projects */}
            {data.activities && data.activities.length > 0 && (
              <div>
                <div className="flex items-center gap-2 pb-1.5 mb-4 border-b border-slate-200">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
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

                <div className="space-y-4 relative pl-3.5 border-l-2 border-slate-200 ml-1.5">
                  {data.activities.map((act, idx) => (
                    <div key={idx} className="relative p-1">
                      <span
                        className="absolute -left-[21px] top-2 h-2.5 w-2.5 rounded-full border-2 border-white shadow-2xs"
                        style={{ backgroundColor: currentTheme.color }}
                      />
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex-1 min-w-0">
                          <h3
                            className="font-extrabold text-slate-900 leading-snug"
                            style={{ fontSize: `${0.875 * fontMultiplier}rem` }}
                          >
                            {act.organizationName}
                          </h3>
                          {act.position && (
                            <p className="font-semibold text-xs text-slate-600 mt-0.5 italic">
                              {act.position}
                            </p>
                          )}
                        </div>
                        {(act.startDate || act.endDate) && (
                          <div className="inline-flex items-center justify-end text-[11px] font-medium text-slate-600 bg-slate-100/90 px-2 py-0.5 rounded-md border border-slate-200/70 shrink-0 mt-0.5 shadow-2xs">
                            {act.startDate} {act.startDate && act.endDate ? '-' : ''} {act.endDate}
                          </div>
                        )}
                      </div>
                      {act.description && (
                        <p
                          className="text-slate-600 text-xs mt-1.5 whitespace-pre-line leading-relaxed"
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

          {/* RIGHT COLUMN: Education, Skills, Certificates, Awards (5 cols) */}
          <div className="sm:col-span-5 space-y-7">
            {/* 3. Education */}
            {data.education && data.education.length > 0 && (
              <div>
                <div className="flex items-center gap-2 pb-1.5 mb-4 border-b border-slate-200">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
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
                <div className="space-y-3.5">
                  {data.education.map((edu, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-50/90 p-3 rounded-xl border border-slate-200/70 shadow-2xs space-y-1"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p
                            className="font-extrabold text-slate-900 leading-snug"
                            style={{ fontSize: `${0.85 * fontMultiplier}rem` }}
                          >
                            {edu.schoolName}
                          </p>
                          <p
                            className="font-bold text-xs mt-0.5"
                            style={{ color: currentTheme.color }}
                          >
                            {edu.major}
                          </p>
                        </div>
                        {(edu.startDate || edu.endDate) && (
                          <div className="inline-flex items-center justify-end text-[10.5px] font-medium text-slate-600 bg-white px-1.5 py-0.5 rounded-md border border-slate-200/80 shrink-0 mt-0.5 shadow-2xs">
                            {edu.startDate} {edu.startDate && edu.endDate ? '-' : ''} {edu.endDate}
                          </div>
                        )}
                      </div>
                      {edu.description && (
                        <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                          {edu.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 4. Skills */}
            {data.skills && data.skills.length > 0 && (
              <div>
                <div className="flex items-center gap-2 pb-1.5 mb-4 border-b border-slate-200">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
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
                <div className="space-y-2">
                  {data.skills.map((skill, idx) => (
                    <div key={idx} className="flex items-center gap-2.5 p-1.5 rounded-lg bg-slate-50/70 border border-slate-100">
                      <span
                        className="w-28 sm:w-32 shrink-0 font-bold text-slate-800 text-xs"
                        style={{ fontSize: `${0.825 * fontMultiplier}rem` }}
                      >
                        {skill.name}
                      </span>
                      {skill.description && (
                        <span className="flex-1 min-w-0 text-slate-600 text-xs truncate">
                          {skill.description}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 5. Certificates */}
            {data.certificates && data.certificates.length > 0 && (
              <div>
                <div className="flex items-center gap-2 pb-1.5 mb-3.5 border-b border-slate-200">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
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
                <div className="space-y-2 text-xs">
                  {data.certificates.map((cert, idx) => (
                    <div key={idx} className="flex items-start justify-between gap-2 p-1.5 rounded-lg bg-slate-50/60 border border-slate-100">
                      <span className="font-bold text-slate-800 flex-1 min-w-0">{cert.name}</span>
                      {cert.date && (
                        <span className="text-[11px] font-medium text-slate-500 shrink-0 bg-white px-1.5 py-0.5 rounded border border-slate-200/80">
                          {cert.date}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 6. Awards */}
            {data.awards && data.awards.length > 0 && (
              <div>
                <div className="flex items-center gap-2 pb-1.5 mb-3.5 border-b border-slate-200">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
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
                <div className="space-y-2 text-xs">
                  {data.awards.map((award, idx) => (
                    <div key={idx} className="flex items-start justify-between gap-2 p-1.5 rounded-lg bg-slate-50/60 border border-slate-100">
                      <span className="font-bold text-slate-800 flex-1 min-w-0">{award.name}</span>
                      {award.date && (
                        <span className="text-[11px] font-medium text-slate-500 shrink-0 bg-white px-1.5 py-0.5 rounded border border-slate-200/80">
                          {award.date}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ================= BOTTOM WATERMARK ================= */}
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
