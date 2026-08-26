import { Phone, Mail, Globe, MapPin, MoveUp, MoveDown, Trash2, Sparkles } from 'lucide-react';
import { InlineText, resolveFontSizePx } from '../InlineText';
import type { CVEditorTemplateProps } from '../CVTemplateProps';

export function Template2ModernTimeline({
  currentTheme,
  currentFont,
  fontMultiplier,
  fullName,
  setFullName,
  position,
  setPosition,
  phone,
  setPhone,
  email,
  setEmail,
  link,
  setLink,
  address,
  setAddress,
  careerObjective,
  setCareerObjective,
  education,
  setEducation,
  workExperience,
  setWorkExperience,
  skills,
  setSkills,
  activities,
  setActivities,
  visibleSections,
  sectionLabels,
  markDirty,
  pageCount,
}: CVEditorTemplateProps) {
  return (
    <div className="p-8 sm:p-10 flex flex-col justify-between min-h-[297mm] h-auto w-full">
      <div className="flex-1 w-full">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row items-start justify-between gap-4 pb-5 mb-6 border-b-2 border-slate-200">
          <div className="flex-1 min-w-0">
            <InlineText
              value={fullName}
              onChange={(v) => {
                setFullName(v);
                markDirty();
              }}
              placeholder="HỌ VÀ TÊN"
              asTitle={true}
              className="font-black tracking-tight block"
              style={{
                color: currentTheme.color,
                fontSize: `${1.75 * fontMultiplier}rem`,
              }}
              defaultFontSizePx={resolveFontSizePx(1.75 * fontMultiplier * 16)}
              defaultFontFamily={currentFont.family}
              defaultColor={currentTheme.color}
            />
            <InlineText
              value={position}
              onChange={(v) => {
                setPosition(v);
                markDirty();
              }}
              placeholder="VỊ TRÍ ỨNG TUYỂN"
              className="font-bold text-slate-600 uppercase tracking-wider block mt-0.5"
              style={{ fontSize: `${0.95 * fontMultiplier}rem` }}
              defaultFontSizePx={resolveFontSizePx(0.95 * fontMultiplier * 16)}
              defaultFontFamily={currentFont.family}
            />
            {visibleSections.objective && (
              <InlineText
                multiline={true}
                rows={2}
                value={careerObjective}
                onChange={(v) => {
                  setCareerObjective(v);
                  markDirty();
                }}
                placeholder="Mục tiêu nghề nghiệp ngắn gọn..."
                className="text-slate-600 mt-2 block leading-relaxed"
                style={{ fontSize: `${0.825 * fontMultiplier}rem` }}
                defaultFontSizePx={resolveFontSizePx(0.825 * fontMultiplier * 16)}
                defaultFontFamily={currentFont.family}
              />
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
            <div className="flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5 shrink-0" style={{ color: currentTheme.color }} />
              <InlineText
                value={phone}
                onChange={(v) => {
                  setPhone(v);
                  markDirty();
                }}
                placeholder="0123 456 789"
                className="flex-1 min-w-[120px]"
                defaultFontSizePx={resolveFontSizePx(0.825 * fontMultiplier * 16)}
                defaultFontFamily={currentFont.family}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 shrink-0" style={{ color: currentTheme.color }} />
              <InlineText
                value={email}
                onChange={(v) => {
                  setEmail(v);
                  markDirty();
                }}
                placeholder="email@example.com"
                className="flex-1 min-w-[140px]"
                defaultFontSizePx={resolveFontSizePx(0.825 * fontMultiplier * 16)}
                defaultFontFamily={currentFont.family}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: currentTheme.color }} />
              <InlineText
                value={address}
                onChange={(v) => {
                  setAddress(v);
                  markDirty();
                }}
                placeholder="Hà Nội, VN"
                className="flex-1 min-w-[120px]"
                defaultFontSizePx={resolveFontSizePx(0.825 * fontMultiplier * 16)}
                defaultFontFamily={currentFont.family}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5 shrink-0" style={{ color: currentTheme.color }} />
              <InlineText
                value={link}
                onChange={(v) => {
                  setLink(v);
                  markDirty();
                }}
                placeholder="linkedin.com"
                className="flex-1 min-w-[120px]"
                defaultFontSizePx={resolveFontSizePx(0.825 * fontMultiplier * 16)}
                defaultFontFamily={currentFont.family}
              />
            </div>
          </div>
        </div>

        {/* 2-Column Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-6">
          {/* Left Column (Work Experience & Activities - 7 cols) */}
          <div className="sm:col-span-7 space-y-6">
            {/* Work Experience */}
            {visibleSections.experience && (
              <div>
                <div className="flex items-center justify-between pb-1 mb-3.5 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: currentTheme.color }} />
                    <h2
                      className="text-xs font-black uppercase tracking-wider"
                      style={{
                        color: currentTheme.color,
                        fontSize: `${0.9 * fontMultiplier}rem`,
                      }}
                    >
                      {sectionLabels.experience}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setWorkExperience((prev) => [
                        ...prev,
                        { companyName: '', position: '', startDate: '', endDate: '', description: '' },
                      ]);
                      markDirty();
                    }}
                    className="text-[11px] font-bold text-primary hover:underline cursor-pointer opacity-70 hover:opacity-100 print:hidden"
                  >
                    + Thêm
                  </button>
                </div>

                <div className="space-y-3.5 relative pl-3 border-l-2 border-slate-200 ml-1">
                  {workExperience.map((exp, idx) => (
                    <div key={idx} className="relative group p-2 rounded-lg hover:bg-slate-50/80 pr-14">
                      {/* Floating Action Buttons */}
                      <div className="absolute right-2 top-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 bg-white border border-slate-200 shadow-sm rounded-lg p-0.5 print:hidden">
                        {idx > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setWorkExperience((prev) => {
                                const arr = [...prev];
                                const temp = arr[idx];
                                arr[idx] = arr[idx - 1];
                                arr[idx - 1] = temp;
                                return arr;
                              });
                              markDirty();
                            }}
                            className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                            title="Di chuyển lên"
                          >
                            <MoveUp className="h-3 w-3" />
                          </button>
                        )}
                        {idx < workExperience.length - 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              setWorkExperience((prev) => {
                                const arr = [...prev];
                                const temp = arr[idx];
                                arr[idx] = arr[idx + 1];
                                arr[idx + 1] = temp;
                                return arr;
                              });
                              markDirty();
                            }}
                            className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                            title="Di chuyển xuống"
                          >
                            <MoveDown className="h-3 w-3" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setWorkExperience((prev) => prev.filter((_, i) => i !== idx));
                            markDirty();
                          }}
                          className="p-1 hover:bg-red-50 rounded text-red-500 cursor-pointer"
                          title="Xóa mục này"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>

                      <span
                        className="absolute -left-[19px] top-3 h-2.5 w-2.5 rounded-full border-2 border-white"
                        style={{ backgroundColor: currentTheme.color }}
                      />
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <InlineText
                            value={exp.position || ''}
                            onChange={(v) => {
                              setWorkExperience((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, position: v } : item)),
                              );
                              markDirty();
                            }}
                            placeholder="Vị trí công việc"
                            className="font-bold text-slate-900"
                            style={{ fontSize: `${0.875 * fontMultiplier}rem` }}
                            defaultFontSizePx={resolveFontSizePx(0.875 * fontMultiplier * 16)}
                            defaultFontFamily={currentFont.family}
                          />
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-slate-500 shrink-0 italic">
                          <InlineText
                            value={exp.startDate || ''}
                            onChange={(v) => {
                              setWorkExperience((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, startDate: v } : item)),
                              );
                              markDirty();
                            }}
                            placeholder="Bắt đầu"
                            className="w-14 text-right"
                            defaultFontSizePx={resolveFontSizePx(0.75 * fontMultiplier * 16)}
                            defaultFontFamily={currentFont.family}
                          />
                          <span>-</span>
                          <InlineText
                            value={exp.endDate || ''}
                            onChange={(v) => {
                              setWorkExperience((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, endDate: v } : item)),
                              );
                              markDirty();
                            }}
                            placeholder="Kết thúc"
                            className="w-14"
                            defaultFontSizePx={resolveFontSizePx(0.75 * fontMultiplier * 16)}
                            defaultFontFamily={currentFont.family}
                          />
                        </div>
                      </div>

                      <InlineText
                        value={exp.companyName || ''}
                        onChange={(v) => {
                          setWorkExperience((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, companyName: v } : item)),
                          );
                          markDirty();
                        }}
                        placeholder="Tên công ty"
                        className="font-semibold text-xs mt-0.5 block"
                        style={{ color: currentTheme.color }}
                        defaultFontSizePx="12px"
                        defaultFontFamily={currentFont.family}
                        defaultColor={currentTheme.color}
                      />

                      <InlineText
                        multiline={true}
                        rows={2}
                        value={exp.description || ''}
                        onChange={(v) => {
                          setWorkExperience((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, description: v } : item)),
                          );
                          markDirty();
                        }}
                        placeholder="Mô tả công việc chi tiết..."
                        className="text-slate-600 text-xs mt-1 block leading-relaxed"
                        style={{ fontSize: `${0.8 * fontMultiplier}rem` }}
                        defaultFontSizePx={resolveFontSizePx(0.8 * fontMultiplier * 16)}
                        defaultFontFamily={currentFont.family}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Activities */}
            {visibleSections.activities && (
              <div>
                <div className="flex items-center justify-between pb-1 mb-3.5 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: currentTheme.color }} />
                    <h2
                      className="text-xs font-black uppercase tracking-wider"
                      style={{
                        color: currentTheme.color,
                        fontSize: `${0.9 * fontMultiplier}rem`,
                      }}
                    >
                      {sectionLabels.activities}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActivities((prev) => [
                        ...prev,
                        { organizationName: '', position: '', startDate: '', endDate: '', description: '' },
                      ]);
                      markDirty();
                    }}
                    className="text-[11px] font-bold text-primary hover:underline cursor-pointer opacity-70 hover:opacity-100 print:hidden"
                  >
                    + Thêm
                  </button>
                </div>

                <div className="space-y-3 relative pl-3 border-l-2 border-slate-200 ml-1">
                  {activities.map((act, idx) => (
                    <div key={idx} className="relative group p-2 rounded-lg hover:bg-slate-50/80 pr-14">
                      {/* Floating Action Buttons */}
                      <div className="absolute right-2 top-2 z-10 opacity-0 group-hover/opacity-100 transition-opacity flex items-center gap-0.5 bg-white border border-slate-200 shadow-sm rounded-lg p-0.5 print:hidden">
                        {idx > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setActivities((prev) => {
                                const arr = [...prev];
                                const temp = arr[idx];
                                arr[idx] = arr[idx - 1];
                                arr[idx - 1] = temp;
                                return arr;
                              });
                              markDirty();
                            }}
                            className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                            title="Di chuyển lên"
                          >
                            <MoveUp className="h-3 w-3" />
                          </button>
                        )}
                        {idx < activities.length - 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              setActivities((prev) => {
                                const arr = [...prev];
                                const temp = arr[idx];
                                arr[idx] = arr[idx + 1];
                                arr[idx + 1] = temp;
                                return arr;
                              });
                              markDirty();
                            }}
                            className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                            title="Di chuyển xuống"
                          >
                            <MoveDown className="h-3 w-3" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setActivities((prev) => prev.filter((_, i) => i !== idx));
                            markDirty();
                          }}
                          className="p-1 hover:bg-red-50 rounded text-red-500 cursor-pointer"
                          title="Xóa mục này"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>

                      <span
                        className="absolute -left-[19px] top-3 h-2.5 w-2.5 rounded-full border-2 border-white"
                        style={{ backgroundColor: currentTheme.color }}
                      />
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <InlineText
                            value={act.organizationName || ''}
                            onChange={(v) => {
                              setActivities((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, organizationName: v } : item)),
                              );
                              markDirty();
                            }}
                            placeholder="Tổ chức / Dự án"
                            className="font-bold text-slate-900"
                            style={{ fontSize: `${0.875 * fontMultiplier}rem` }}
                            defaultFontSizePx={resolveFontSizePx(0.875 * fontMultiplier * 16)}
                            defaultFontFamily={currentFont.family}
                          />
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-slate-500 shrink-0 italic">
                          <InlineText
                            value={act.startDate || ''}
                            onChange={(v) => {
                              setActivities((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, startDate: v } : item)),
                              );
                              markDirty();
                            }}
                            placeholder="Bắt đầu"
                            className="w-14 text-right"
                            defaultFontSizePx={resolveFontSizePx(0.75 * fontMultiplier * 16)}
                            defaultFontFamily={currentFont.family}
                          />
                          <span>-</span>
                          <InlineText
                            value={act.endDate || ''}
                            onChange={(v) => {
                              setActivities((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, endDate: v } : item)),
                              );
                              markDirty();
                            }}
                            placeholder="Kết thúc"
                            className="w-14"
                            defaultFontSizePx={resolveFontSizePx(0.75 * fontMultiplier * 16)}
                            defaultFontFamily={currentFont.family}
                          />
                        </div>
                      </div>

                      <InlineText
                        value={act.position || ''}
                        onChange={(v) => {
                          setActivities((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, position: v } : item)),
                          );
                          markDirty();
                        }}
                        placeholder="Vị trí tham gia"
                        className="font-medium text-xs text-slate-600 block mt-0.5 italic"
                        defaultFontSizePx="12px"
                        defaultFontFamily={currentFont.family}
                      />

                      <InlineText
                        multiline={true}
                        rows={1}
                        value={act.description || ''}
                        onChange={(v) => {
                          setActivities((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, description: v } : item)),
                          );
                          markDirty();
                        }}
                        placeholder="Mô tả đóng góp..."
                        className="text-slate-600 text-xs mt-1 block"
                        style={{ fontSize: `${0.8 * fontMultiplier}rem` }}
                        defaultFontSizePx={resolveFontSizePx(0.8 * fontMultiplier * 16)}
                        defaultFontFamily={currentFont.family}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column (Education, Skills, Certificates - 5 cols) */}
          <div className="sm:col-span-5 space-y-6">
            {/* Education */}
            {visibleSections.education && (
              <div>
                <div className="flex items-center justify-between pb-1 mb-3 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: currentTheme.color }} />
                    <h2
                      className="text-xs font-black uppercase tracking-wider"
                      style={{
                        color: currentTheme.color,
                        fontSize: `${0.9 * fontMultiplier}rem`,
                      }}
                    >
                      {sectionLabels.education}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEducation((prev) => [
                        ...prev,
                        { schoolName: '', major: '', startDate: '', endDate: '', description: '' },
                      ]);
                      markDirty();
                    }}
                    className="text-[11px] font-bold text-primary hover:underline cursor-pointer opacity-70 hover:opacity-100 print:hidden"
                  >
                    + Thêm
                  </button>
                </div>

                <div className="space-y-3">
                  {education.map((edu, idx) => (
                    <div key={idx} className="bg-slate-50/80 p-2.5 rounded-xl border border-slate-100 space-y-1">
                      <InlineText
                        value={edu.schoolName || ''}
                        onChange={(v) => {
                          setEducation((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, schoolName: v } : item)),
                          );
                          markDirty();
                        }}
                        placeholder="Tên trường học"
                        className="font-bold text-slate-900 block"
                        style={{ fontSize: `${0.85 * fontMultiplier}rem` }}
                        defaultFontSizePx={resolveFontSizePx(0.85 * fontMultiplier * 16)}
                        defaultFontFamily={currentFont.family}
                      />
                      <InlineText
                        value={edu.major || ''}
                        onChange={(v) => {
                          setEducation((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, major: v } : item)),
                          );
                          markDirty();
                        }}
                        placeholder="Chuyên ngành"
                        className="font-semibold text-xs block"
                        style={{ color: currentTheme.color }}
                        defaultFontSizePx="12px"
                        defaultFontFamily={currentFont.family}
                        defaultColor={currentTheme.color}
                      />
                      <div className="flex items-center gap-1 text-[11px] text-slate-500 italic">
                        <InlineText
                          value={edu.startDate || ''}
                          onChange={(v) => {
                            setEducation((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, startDate: v } : item)),
                            );
                            markDirty();
                          }}
                          placeholder="Bắt đầu"
                          className="w-14"
                          defaultFontSizePx={resolveFontSizePx(0.75 * fontMultiplier * 16)}
                          defaultFontFamily={currentFont.family}
                        />
                        <span>-</span>
                        <InlineText
                          value={edu.endDate || ''}
                          onChange={(v) => {
                            setEducation((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, endDate: v } : item)),
                            );
                            markDirty();
                          }}
                          placeholder="Kết thúc"
                          className="w-14"
                          defaultFontSizePx={resolveFontSizePx(0.75 * fontMultiplier * 16)}
                          defaultFontFamily={currentFont.family}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Skills */}
            {visibleSections.skills && (
              <div>
                <div className="flex items-center justify-between pb-1 mb-3 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: currentTheme.color }} />
                    <h2
                      className="text-xs font-black uppercase tracking-wider"
                      style={{
                        color: currentTheme.color,
                        fontSize: `${0.9 * fontMultiplier}rem`,
                      }}
                    >
                      {sectionLabels.skills}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSkills((prev) => [...prev, { name: '', description: '' }]);
                      markDirty();
                    }}
                    className="text-[11px] font-bold text-primary hover:underline cursor-pointer opacity-70 hover:opacity-100 print:hidden"
                  >
                    + Thêm
                  </button>
                </div>

                <div className="space-y-1.5">
                  {skills.map((skill, idx) => (
                    <div key={idx} className="group relative flex items-center gap-2 p-1 rounded hover:bg-slate-50 pr-8">
                      <div className="w-28 shrink-0">
                        <InlineText
                          value={skill.name || ''}
                          onChange={(v) => {
                            setSkills((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, name: v } : item)),
                            );
                            markDirty();
                          }}
                          placeholder="Kỹ năng"
                          className="font-bold text-slate-800"
                          style={{ fontSize: `${0.825 * fontMultiplier}rem` }}
                          defaultFontSizePx={resolveFontSizePx(0.825 * fontMultiplier * 16)}
                          defaultFontFamily={currentFont.family}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <InlineText
                          value={skill.description || ''}
                          onChange={(v) => {
                            setSkills((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, description: v } : item)),
                            );
                            markDirty();
                          }}
                          placeholder="Mô tả mức độ"
                          className="text-slate-600 text-xs"
                          defaultFontSizePx="12px"
                          defaultFontFamily={currentFont.family}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSkills((prev) => prev.filter((_, i) => i !== idx));
                          markDirty();
                        }}
                        className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-400 hover:text-red-500 rounded bg-white print:hidden cursor-pointer"
                        title="Xóa kỹ năng"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
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
        <span>Tổng số trang: {pageCount}</span>
        <span className="inline-flex items-center gap-1 font-semibold text-slate-500">
          <Sparkles className="h-3 w-3 text-primary" />
          Được tạo bởi <b className="text-slate-700">TalentPulse</b> — talentpulse.vn
        </span>
      </div>
    </div>
  );
}
