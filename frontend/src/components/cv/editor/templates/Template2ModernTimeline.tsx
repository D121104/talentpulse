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
  certificates,
  setCertificates,
  awards,
  setAwards,
  visibleSections,
  sectionLabels,
  markDirty,
  pageCount,
}: CVEditorTemplateProps) {
  return (
    <div className="p-8 sm:p-10 flex flex-col justify-between min-h-[297mm] h-auto w-full box-border">
      <div className="flex-1 w-full">
        {/* ================= TOP HEADER ================= */}
        <div className="flex flex-col sm:flex-row items-start justify-between gap-5 pb-6 mb-7 border-b-2 border-slate-200/90">
          <div className="flex-1 min-w-0 pr-2">
            <InlineText
              value={fullName}
              onChange={(v) => {
                setFullName(v);
                markDirty();
              }}
              placeholder="HỌ VÀ TÊN"
              asTitle={true}
              className="font-black tracking-tight block leading-tight"
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
              className="font-bold text-slate-600 uppercase tracking-wider block mt-1"
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
                placeholder="Mục tiêu nghề nghiệp của bạn, bao gồm mục tiêu ngắn hạn và dài hạn..."
                className="text-slate-600 mt-2.5 block leading-relaxed"
                style={{ fontSize: `${0.825 * fontMultiplier}rem` }}
                defaultFontSizePx={resolveFontSizePx(0.825 * fontMultiplier * 16)}
                defaultFontFamily={currentFont.family}
              />
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
            <div className="flex items-center gap-2">
              <div className="flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-lg bg-white/80 shadow-2xs">
                <Phone className="h-3 w-3" style={{ color: currentTheme.color }} />
              </div>
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
            <div className="flex items-center gap-2">
              <div className="flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-lg bg-white/80 shadow-2xs">
                <Mail className="h-3 w-3" style={{ color: currentTheme.color }} />
              </div>
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
            <div className="flex items-center gap-2">
              <div className="flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-lg bg-white/80 shadow-2xs">
                <MapPin className="h-3 w-3" style={{ color: currentTheme.color }} />
              </div>
              <InlineText
                value={address}
                onChange={(v) => {
                  setAddress(v);
                  markDirty();
                }}
                placeholder="Hà Nội, Việt Nam"
                className="flex-1 min-w-[120px]"
                defaultFontSizePx={resolveFontSizePx(0.825 * fontMultiplier * 16)}
                defaultFontFamily={currentFont.family}
              />
            </div>
            <div className="flex items-center gap-2">
              <div className="flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-lg bg-white/80 shadow-2xs">
                <Globe className="h-3 w-3" style={{ color: currentTheme.color }} />
              </div>
              <InlineText
                value={link}
                onChange={(v) => {
                  setLink(v);
                  markDirty();
                }}
                placeholder="linkedin.com/in/username"
                className="flex-1 min-w-[120px]"
                defaultFontSizePx={resolveFontSizePx(0.825 * fontMultiplier * 16)}
                defaultFontFamily={currentFont.family}
              />
            </div>
          </div>
        </div>

        {/* ================= 2-COLUMN MAIN BODY ================= */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-7">
          {/* LEFT COLUMN: Experience & Activities (7 cols) */}
          <div className="sm:col-span-7 space-y-7">
            {/* 1. Work Experience */}
            {visibleSections.experience && (
              <div>
                <div className="flex items-center justify-between pb-1.5 mb-4 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: currentTheme.color }} />
                    <h2
                      className="text-xs font-black uppercase tracking-wider text-slate-900"
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
                    className="text-[11px] font-bold text-primary hover:underline cursor-pointer opacity-75 hover:opacity-100 print:hidden"
                  >
                    + Thêm
                  </button>
                </div>

                <div className="space-y-4 relative pl-3.5 border-l-2 border-slate-200 ml-1.5">
                  {workExperience.map((exp, idx) => (
                    <div key={idx} className="relative group p-2 rounded-xl transition hover:bg-slate-50/90 pr-2">
                      {/* Floating Action Buttons Toolbar */}
                      <div className="absolute right-1 -top-3 z-30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 bg-white border border-slate-200 shadow-md rounded-lg p-0.5 print:hidden">
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

                      {/* Node Bullet */}
                      <span
                        className="absolute -left-[21px] top-3.5 h-2.5 w-2.5 rounded-full border-2 border-white shadow-2xs"
                        style={{ backgroundColor: currentTheme.color }}
                      />

                      {/* Header Row: Position on Left, Compact Date on Top-Right */}
                      <div className="flex items-start justify-between gap-2.5">
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
                            className="font-extrabold text-slate-900 leading-snug"
                            style={{ fontSize: `${0.875 * fontMultiplier}rem` }}
                            defaultFontSizePx={resolveFontSizePx(0.875 * fontMultiplier * 16)}
                            defaultFontFamily={currentFont.family}
                          />
                          <InlineText
                            value={exp.companyName || ''}
                            onChange={(v) => {
                              setWorkExperience((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, companyName: v } : item)),
                              );
                              markDirty();
                            }}
                            placeholder="Tên công ty"
                            className="font-bold text-xs mt-0.5 block"
                            style={{ color: currentTheme.color }}
                            defaultFontSizePx="12px"
                            defaultFontFamily={currentFont.family}
                            defaultColor={currentTheme.color}
                          />
                        </div>

                        {/* Compact Date Range Badge in Top-Right */}
                        <div className="flex items-center justify-end gap-1 text-[11px] font-medium text-slate-600 bg-slate-100/90 px-2 py-0.5 rounded-md border border-slate-200/70 shrink-0 mt-0.5 shadow-2xs">
                          <InlineText
                            nowrap={true}
                            value={exp.startDate || ''}
                            onChange={(v) => {
                              setWorkExperience((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, startDate: v } : item)),
                              );
                              markDirty();
                            }}
                            placeholder="Bắt đầu"
                            className="text-center font-medium"
                            style={{ fontSize: `${0.75 * fontMultiplier}rem` }}
                            defaultFontSizePx={resolveFontSizePx(0.75 * fontMultiplier * 16)}
                            defaultFontFamily={currentFont.family}
                          />
                          <span className="text-slate-400 font-bold select-none">-</span>
                          <InlineText
                            nowrap={true}
                            value={exp.endDate || ''}
                            onChange={(v) => {
                              setWorkExperience((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, endDate: v } : item)),
                              );
                              markDirty();
                            }}
                            placeholder="Kết thúc"
                            className="text-center font-medium"
                            style={{ fontSize: `${0.75 * fontMultiplier}rem` }}
                            defaultFontSizePx={resolveFontSizePx(0.75 * fontMultiplier * 16)}
                            defaultFontFamily={currentFont.family}
                          />
                        </div>
                      </div>

                      {/* Description */}
                      <div className="mt-1.5">
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
                          placeholder="Mô tả công việc chi tiết và các kết quả nổi bật..."
                          className="text-slate-600 text-xs leading-relaxed"
                          style={{ fontSize: `${0.8 * fontMultiplier}rem` }}
                          defaultFontSizePx={resolveFontSizePx(0.8 * fontMultiplier * 16)}
                          defaultFontFamily={currentFont.family}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 2. Activities & Projects */}
            {visibleSections.activities && (
              <div>
                <div className="flex items-center justify-between pb-1.5 mb-4 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: currentTheme.color }} />
                    <h2
                      className="text-xs font-black uppercase tracking-wider text-slate-900"
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
                    className="text-[11px] font-bold text-primary hover:underline cursor-pointer opacity-75 hover:opacity-100 print:hidden"
                  >
                    + Thêm
                  </button>
                </div>

                <div className="space-y-4 relative pl-3.5 border-l-2 border-slate-200 ml-1.5">
                  {activities.map((act, idx) => (
                    <div key={idx} className="relative group p-2 rounded-xl transition hover:bg-slate-50/90 pr-2">
                      {/* Floating Action Buttons Toolbar */}
                      <div className="absolute right-1 -top-3 z-30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 bg-white border border-slate-200 shadow-md rounded-lg p-0.5 print:hidden">
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

                      {/* Node Bullet */}
                      <span
                        className="absolute -left-[21px] top-3.5 h-2.5 w-2.5 rounded-full border-2 border-white shadow-2xs"
                        style={{ backgroundColor: currentTheme.color }}
                      />

                      {/* Header Row: Organization on Left, Compact Date on Top-Right */}
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex-1 min-w-0">
                          <InlineText
                            value={act.organizationName || ''}
                            onChange={(v) => {
                              setActivities((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, organizationName: v } : item)),
                              );
                              markDirty();
                            }}
                            placeholder="Tên tổ chức / Dự án"
                            className="font-extrabold text-slate-900 leading-snug"
                            style={{ fontSize: `${0.875 * fontMultiplier}rem` }}
                            defaultFontSizePx={resolveFontSizePx(0.875 * fontMultiplier * 16)}
                            defaultFontFamily={currentFont.family}
                          />
                          <InlineText
                            value={act.position || ''}
                            onChange={(v) => {
                              setActivities((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, position: v } : item)),
                              );
                              markDirty();
                            }}
                            placeholder="Vị trí / Vai trò tham gia"
                            className="font-semibold text-xs text-slate-600 block mt-0.5 italic"
                            defaultFontSizePx="12px"
                            defaultFontFamily={currentFont.family}
                          />
                        </div>

                        {/* Compact Date Range Badge in Top-Right */}
                        <div className="flex items-center justify-end gap-1 text-[11px] font-medium text-slate-600 bg-slate-100/90 px-2 py-0.5 rounded-md border border-slate-200/70 shrink-0 mt-0.5 shadow-2xs">
                          <InlineText
                            nowrap={true}
                            value={act.startDate || ''}
                            onChange={(v) => {
                              setActivities((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, startDate: v } : item)),
                              );
                              markDirty();
                            }}
                            placeholder="Bắt đầu"
                            className="text-center font-medium"
                            style={{ fontSize: `${0.75 * fontMultiplier}rem` }}
                            defaultFontSizePx={resolveFontSizePx(0.75 * fontMultiplier * 16)}
                            defaultFontFamily={currentFont.family}
                          />
                          <span className="text-slate-400 font-bold select-none">-</span>
                          <InlineText
                            nowrap={true}
                            value={act.endDate || ''}
                            onChange={(v) => {
                              setActivities((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, endDate: v } : item)),
                              );
                              markDirty();
                            }}
                            placeholder="Kết thúc"
                            className="text-center font-medium"
                            style={{ fontSize: `${0.75 * fontMultiplier}rem` }}
                            defaultFontSizePx={resolveFontSizePx(0.75 * fontMultiplier * 16)}
                            defaultFontFamily={currentFont.family}
                          />
                        </div>
                      </div>

                      {/* Description */}
                      <div className="mt-1.5">
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
                          placeholder="Mô tả vai trò, đóng góp và thành tích..."
                          className="text-slate-600 text-xs leading-relaxed"
                          style={{ fontSize: `${0.8 * fontMultiplier}rem` }}
                          defaultFontSizePx={resolveFontSizePx(0.8 * fontMultiplier * 16)}
                          defaultFontFamily={currentFont.family}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: Education, Skills, Certificates, Awards (5 cols) */}
          <div className="sm:col-span-5 space-y-7">
            {/* 3. Education */}
            {visibleSections.education && (
              <div>
                <div className="flex items-center justify-between pb-1.5 mb-4 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: currentTheme.color }} />
                    <h2
                      className="text-xs font-black uppercase tracking-wider text-slate-900"
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
                    className="text-[11px] font-bold text-primary hover:underline cursor-pointer opacity-75 hover:opacity-100 print:hidden"
                  >
                    + Thêm
                  </button>
                </div>

                <div className="space-y-3.5">
                  {education.map((edu, idx) => (
                    <div
                      key={idx}
                      className="relative group bg-slate-50/90 hover:bg-slate-100/90 p-3 rounded-xl border border-slate-200/70 transition shadow-2xs space-y-1 pr-2"
                    >
                      {/* Floating Action Buttons Toolbar */}
                      <div className="absolute right-1.5 -top-2.5 z-30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 bg-white border border-slate-200 shadow-md rounded-lg p-0.5 print:hidden">
                        {idx > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setEducation((prev) => {
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
                        {idx < education.length - 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              setEducation((prev) => {
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
                            setEducation((prev) => prev.filter((_, i) => i !== idx));
                            markDirty();
                          }}
                          className="p-1 hover:bg-red-50 rounded text-red-500 cursor-pointer"
                          title="Xóa mục này"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>

                      {/* Top Row: School on left, Date Badge on Top-Right */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <InlineText
                            value={edu.schoolName || ''}
                            onChange={(v) => {
                              setEducation((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, schoolName: v } : item)),
                              );
                              markDirty();
                            }}
                            placeholder="Tên trường học"
                            className="font-extrabold text-slate-900 block leading-snug"
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
                            placeholder="Chuyên ngành / Ngành học"
                            className="font-bold text-xs mt-0.5 block"
                            style={{ color: currentTheme.color }}
                            defaultFontSizePx="12px"
                            defaultFontFamily={currentFont.family}
                            defaultColor={currentTheme.color}
                          />
                        </div>

                        {/* Compact Date Range Badge */}
                        <div className="flex items-center justify-end gap-1 text-[10.5px] font-medium text-slate-600 bg-white px-1.5 py-0.5 rounded-md border border-slate-200/80 shrink-0 mt-0.5 shadow-2xs">
                          <InlineText
                            nowrap={true}
                            value={edu.startDate || ''}
                            onChange={(v) => {
                              setEducation((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, startDate: v } : item)),
                              );
                              markDirty();
                            }}
                            placeholder="Bắt đầu"
                            className="text-center font-medium"
                            style={{ fontSize: `${0.725 * fontMultiplier}rem` }}
                            defaultFontSizePx={resolveFontSizePx(0.725 * fontMultiplier * 16)}
                            defaultFontFamily={currentFont.family}
                          />
                          <span className="text-slate-400 font-bold select-none">-</span>
                          <InlineText
                            nowrap={true}
                            value={edu.endDate || ''}
                            onChange={(v) => {
                              setEducation((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, endDate: v } : item)),
                              );
                              markDirty();
                            }}
                            placeholder="Kết thúc"
                            className="text-center font-medium"
                            style={{ fontSize: `${0.725 * fontMultiplier}rem` }}
                            defaultFontSizePx={resolveFontSizePx(0.725 * fontMultiplier * 16)}
                            defaultFontFamily={currentFont.family}
                          />
                        </div>
                      </div>

                      {/* Education Description */}
                      <InlineText
                        multiline={true}
                        rows={1}
                        value={edu.description || ''}
                        onChange={(v) => {
                          setEducation((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, description: v } : item)),
                          );
                          markDirty();
                        }}
                        placeholder="GPA, học bổng hoặc thành tích..."
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

            {/* 4. Skills */}
            {visibleSections.skills && (
              <div>
                <div className="flex items-center justify-between pb-1.5 mb-4 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: currentTheme.color }} />
                    <h2
                      className="text-xs font-black uppercase tracking-wider text-slate-900"
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
                    className="text-[11px] font-bold text-primary hover:underline cursor-pointer opacity-75 hover:opacity-100 print:hidden"
                  >
                    + Thêm
                  </button>
                </div>

                <div className="space-y-2">
                  {skills.map((skill, idx) => (
                    <div
                      key={idx}
                      className="group relative flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-slate-50 transition pr-7"
                    >
                      <div className="w-28 sm:w-32 shrink-0">
                        <InlineText
                          value={skill.name || ''}
                          onChange={(v) => {
                            setSkills((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, name: v } : item)),
                            );
                            markDirty();
                          }}
                          placeholder="Tên kỹ năng"
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
                          placeholder="Mức độ / Chi tiết"
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
                        className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-400 hover:text-red-500 rounded bg-white shadow-2xs print:hidden cursor-pointer"
                        title="Xóa kỹ năng"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 5. Certificates */}
            {visibleSections.certificates && (
              <div>
                <div className="flex items-center justify-between pb-1.5 mb-3.5 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: currentTheme.color }} />
                    <h2
                      className="text-xs font-black uppercase tracking-wider text-slate-900"
                      style={{
                        color: currentTheme.color,
                        fontSize: `${0.9 * fontMultiplier}rem`,
                      }}
                    >
                      {sectionLabels.certificates}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCertificates((prev) => [...prev, { name: '', date: '' }]);
                      markDirty();
                    }}
                    className="text-[11px] font-bold text-primary hover:underline cursor-pointer opacity-75 hover:opacity-100 print:hidden"
                  >
                    + Thêm
                  </button>
                </div>

                <div className="space-y-2">
                  {certificates.map((cert, idx) => (
                    <div
                      key={idx}
                      className="group relative flex items-start justify-between gap-2 p-1.5 rounded-lg hover:bg-slate-50 transition pr-7"
                    >
                      <div className="flex-1 min-w-0">
                        <InlineText
                          value={cert.name || ''}
                          onChange={(v) => {
                            setCertificates((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, name: v } : item)),
                            );
                            markDirty();
                          }}
                          placeholder="Tên chứng chỉ..."
                          className="font-bold text-slate-800"
                          style={{ fontSize: `${0.825 * fontMultiplier}rem` }}
                          defaultFontSizePx={resolveFontSizePx(0.825 * fontMultiplier * 16)}
                          defaultFontFamily={currentFont.family}
                        />
                      </div>
                      <div className="shrink-0">
                        <InlineText
                          nowrap={true}
                          value={cert.date || ''}
                          onChange={(v) => {
                            setCertificates((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, date: v } : item)),
                            );
                            markDirty();
                          }}
                          placeholder="Năm"
                          className="text-center font-medium text-slate-500 text-[11px]"
                          style={{ fontSize: `${0.75 * fontMultiplier}rem` }}
                          defaultFontSizePx="11px"
                          defaultFontFamily={currentFont.family}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setCertificates((prev) => prev.filter((_, i) => i !== idx));
                          markDirty();
                        }}
                        className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-400 hover:text-red-500 rounded bg-white shadow-2xs print:hidden cursor-pointer"
                        title="Xóa chứng chỉ"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 6. Awards */}
            {visibleSections.awards && (
              <div>
                <div className="flex items-center justify-between pb-1.5 mb-3.5 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: currentTheme.color }} />
                    <h2
                      className="text-xs font-black uppercase tracking-wider text-slate-900"
                      style={{
                        color: currentTheme.color,
                        fontSize: `${0.9 * fontMultiplier}rem`,
                      }}
                    >
                      {sectionLabels.awards}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAwards((prev) => [...prev, { name: '', date: '' }]);
                      markDirty();
                    }}
                    className="text-[11px] font-bold text-primary hover:underline cursor-pointer opacity-75 hover:opacity-100 print:hidden"
                  >
                    + Thêm
                  </button>
                </div>

                <div className="space-y-2">
                  {awards.map((award, idx) => (
                    <div
                      key={idx}
                      className="group relative flex items-start justify-between gap-2 p-1.5 rounded-lg hover:bg-slate-50 transition pr-7"
                    >
                      <div className="flex-1 min-w-0">
                        <InlineText
                          value={award.name || ''}
                          onChange={(v) => {
                            setAwards((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, name: v } : item)),
                            );
                            markDirty();
                          }}
                          placeholder="Tên giải thưởng..."
                          className="font-bold text-slate-800"
                          style={{ fontSize: `${0.825 * fontMultiplier}rem` }}
                          defaultFontSizePx={resolveFontSizePx(0.825 * fontMultiplier * 16)}
                          defaultFontFamily={currentFont.family}
                        />
                      </div>
                      <div className="shrink-0">
                        <InlineText
                          nowrap={true}
                          value={award.date || ''}
                          onChange={(v) => {
                            setAwards((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, date: v } : item)),
                            );
                            markDirty();
                          }}
                          placeholder="Năm"
                          className="text-center font-medium text-slate-500 text-[11px]"
                          style={{ fontSize: `${0.75 * fontMultiplier}rem` }}
                          defaultFontSizePx="11px"
                          defaultFontFamily={currentFont.family}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setAwards((prev) => prev.filter((_, i) => i !== idx));
                          markDirty();
                        }}
                        className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-400 hover:text-red-500 rounded bg-white shadow-2xs print:hidden cursor-pointer"
                        title="Xóa giải thưởng"
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

      {/* ================= BOTTOM WATERMARK ================= */}
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
