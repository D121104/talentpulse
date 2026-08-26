import { Phone, Mail, Globe, MapPin, MoveUp, MoveDown, Plus, Trash2, Sparkles } from 'lucide-react';
import { InlineText, resolveFontSizePx } from '../InlineText';
import type { CVEditorTemplateProps } from '../CVTemplateProps';

export function Template1ClassicATS({
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
  sectionOrder,
  moveSection,
  sectionLabels,
  markDirty,
  pageCount,
}: CVEditorTemplateProps) {
  return (
    <div className="p-10 sm:p-12 flex flex-col justify-between min-h-[297mm] h-auto w-full">
      <div className="flex-1 w-full">
        {/* Header: Name, Position, Contacts */}
        <div className="text-center pb-5 mb-6 border-b-2" style={{ borderColor: currentTheme.color }}>
          {/* Full Name */}
          <div className="mb-1 flex justify-center">
            <InlineText
              value={fullName}
              onChange={(v) => {
                setFullName(v);
                markDirty();
              }}
              placeholder="HỌ VÀ TÊN"
              asTitle={true}
              className="font-extrabold text-center tracking-wide max-w-full"
              style={{
                color: currentTheme.color,
                fontSize: `${1.8 * fontMultiplier}rem`,
              }}
              defaultFontSizePx={resolveFontSizePx(1.8 * fontMultiplier * 16)}
              defaultFontFamily={currentFont.family}
              defaultColor={currentTheme.color}
            />
          </div>

          {/* Position */}
          <div className="mb-3 flex justify-center">
            <InlineText
              value={position}
              onChange={(v) => {
                setPosition(v);
                markDirty();
              }}
              placeholder="Vị trí ứng tuyển"
              className="font-medium text-slate-600 text-center tracking-wide italic max-w-full"
              style={{ fontSize: `${1.05 * fontMultiplier}rem` }}
              defaultFontSizePx={resolveFontSizePx(1.05 * fontMultiplier * 16)}
              defaultFontFamily={currentFont.family}
              defaultColor="#475569"
            />
          </div>

          {/* Contact Info Items - TopCV responsive wrap style */}
          <div
            className="flex flex-wrap items-center justify-center gap-x-4 sm:gap-x-5 gap-y-2 text-slate-600 max-w-full"
            style={{ fontSize: `${0.85 * fontMultiplier}rem` }}
          >
            <div className="inline-flex items-center gap-1.5 shrink-0 max-w-full">
              <Phone className="h-3.5 w-3.5 shrink-0" style={{ color: currentTheme.color }} />
              <InlineText
                value={phone}
                onChange={(v) => {
                  setPhone(v);
                  markDirty();
                }}
                placeholder="0123 456 789"
                nowrap={true}
                className="w-auto"
                defaultFontSizePx={resolveFontSizePx(0.85 * fontMultiplier * 16)}
                defaultFontFamily={currentFont.family}
              />
            </div>

            <div className="inline-flex items-center gap-1.5 shrink-0 max-w-full">
              <Mail className="h-3.5 w-3.5 shrink-0" style={{ color: currentTheme.color }} />
              <InlineText
                value={email}
                onChange={(v) => {
                  setEmail(v);
                  markDirty();
                }}
                placeholder="email@example.com"
                nowrap={true}
                className="w-auto"
                defaultFontSizePx={resolveFontSizePx(0.85 * fontMultiplier * 16)}
                defaultFontFamily={currentFont.family}
              />
            </div>

            <div className="inline-flex items-center gap-1.5 shrink-0 max-w-full">
              <Globe className="h-3.5 w-3.5 shrink-0" style={{ color: currentTheme.color }} />
              <InlineText
                value={link}
                onChange={(v) => {
                  setLink(v);
                  markDirty();
                }}
                placeholder="linkedin.com/in/username"
                nowrap={true}
                className="w-auto"
                defaultFontSizePx={resolveFontSizePx(0.85 * fontMultiplier * 16)}
                defaultFontFamily={currentFont.family}
              />
            </div>

            <div className="inline-flex items-center gap-1.5 shrink-0 max-w-full">
              <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: currentTheme.color }} />
              <InlineText
                value={address}
                onChange={(v) => {
                  setAddress(v);
                  markDirty();
                }}
                placeholder="Hà Nội, Việt Nam"
                nowrap={true}
                className="w-auto"
                defaultFontSizePx={resolveFontSizePx(0.85 * fontMultiplier * 16)}
                defaultFontFamily={currentFont.family}
              />
            </div>
          </div>
        </div>

        {/* Dynamic Sections Ordered by sectionOrder */}
        {sectionOrder.map((sectionKey, secIdx) => {
          // 1. MỤC TIÊU NGHỀ NGHIỆP
          if (sectionKey === 'objective' && visibleSections.objective) {
            return (
              <div key="objective" className="mb-5 group/sec relative">
                <div className="flex items-center justify-between pb-1 mb-2 border-b border-slate-200">
                  <h2
                    className="font-bold uppercase tracking-wider"
                    style={{
                      color: currentTheme.color,
                      fontSize: `${0.95 * fontMultiplier}rem`,
                    }}
                  >
                    {sectionLabels.objective}
                  </h2>
                  <div className="flex items-center gap-1 opacity-0 group-hover/sec:opacity-100 transition-opacity print:hidden">
                    {secIdx > 0 && (
                      <button
                        type="button"
                        onClick={() => moveSection('objective', 'up')}
                        className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                        title="Đưa mục này lên trên"
                      >
                        <MoveUp className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {secIdx < sectionOrder.length - 1 && (
                      <button
                        type="button"
                        onClick={() => moveSection('objective', 'down')}
                        className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                        title="Đưa mục này xuống dưới"
                      >
                        <MoveDown className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <InlineText
                  multiline={true}
                  rows={2}
                  value={careerObjective}
                  onChange={(v) => {
                    setCareerObjective(v);
                    markDirty();
                  }}
                  placeholder="Mục tiêu nghề nghiệp của bạn, bao gồm mục tiêu ngắn hạn và dài hạn..."
                  className="text-slate-700 leading-relaxed text-justify"
                  style={{ fontSize: `${0.875 * fontMultiplier}rem` }}
                  defaultFontSizePx={resolveFontSizePx(0.875 * fontMultiplier * 16)}
                  defaultFontFamily={currentFont.family}
                />
              </div>
            );
          }

          // 2. HỌC VẤN
          if (sectionKey === 'education' && visibleSections.education) {
            return (
              <div key="education" className="mb-5 group/sec relative">
                <div className="flex items-center justify-between pb-1 mb-2.5 border-b border-slate-200">
                  <h2
                    className="font-bold uppercase tracking-wider"
                    style={{
                      color: currentTheme.color,
                      fontSize: `${0.95 * fontMultiplier}rem`,
                    }}
                  >
                    {sectionLabels.education}
                  </h2>
                  <div className="flex items-center gap-1 print:hidden">
                    <div className="flex items-center gap-1 opacity-0 group-hover/sec:opacity-100 transition-opacity">
                      {secIdx > 0 && (
                        <button
                          type="button"
                          onClick={() => moveSection('education', 'up')}
                          className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                          title="Đưa mục này lên trên"
                        >
                          <MoveUp className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {secIdx < sectionOrder.length - 1 && (
                        <button
                          type="button"
                          onClick={() => moveSection('education', 'down')}
                          className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                          title="Đưa mục này xuống dưới"
                        >
                          <MoveDown className="h-3.5 w-3.5" />
                        </button>
                      )}
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
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline cursor-pointer opacity-70 hover:opacity-100 ml-1"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Thêm</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  {education.map((edu, idx) => (
                    <div
                      key={idx}
                      className="group relative p-2 rounded-lg hover:bg-slate-50/80 transition-all border border-transparent hover:border-slate-200 pr-14"
                    >
                      {/* Floating Action Buttons */}
                      <div className="absolute right-2 top-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 bg-white border border-slate-200 shadow-sm rounded-lg p-0.5 print:hidden">
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

                      <div className="flex items-baseline justify-between gap-4">
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
                            className="font-bold text-slate-900"
                            style={{ fontSize: `${0.9 * fontMultiplier}rem` }}
                            defaultFontSizePx={resolveFontSizePx(0.9 * fontMultiplier * 16)}
                            defaultFontFamily={currentFont.family}
                          />
                        </div>

                        <div className="flex items-center gap-1 text-slate-500 text-xs italic shrink-0">
                          <InlineText
                            value={edu.startDate || ''}
                            onChange={(v) => {
                              setEducation((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, startDate: v } : item)),
                              );
                              markDirty();
                            }}
                            placeholder="Bắt đầu"
                            className="w-16 text-right"
                            defaultFontSizePx={resolveFontSizePx(0.8 * fontMultiplier * 16)}
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
                            className="w-16"
                            defaultFontSizePx={resolveFontSizePx(0.8 * fontMultiplier * 16)}
                            defaultFontFamily={currentFont.family}
                          />
                        </div>
                      </div>

                      <InlineText
                        value={edu.major || ''}
                        onChange={(v) => {
                          setEducation((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, major: v } : item)),
                          );
                          markDirty();
                        }}
                        placeholder="Ngành học / Môn học"
                        className="font-medium text-slate-700 italic block mt-0.5"
                        style={{ fontSize: `${0.85 * fontMultiplier}rem` }}
                        defaultFontSizePx={resolveFontSizePx(0.85 * fontMultiplier * 16)}
                        defaultFontFamily={currentFont.family}
                      />

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
                        placeholder="Mô tả quá trình học tập hoặc thành tích của bạn"
                        className="text-slate-600 mt-1 block"
                        style={{ fontSize: `${0.825 * fontMultiplier}rem` }}
                        defaultFontSizePx={resolveFontSizePx(0.825 * fontMultiplier * 16)}
                        defaultFontFamily={currentFont.family}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          }

          // 3. KINH NGHIỆM LÀM VIỆC
          if (sectionKey === 'experience' && visibleSections.experience) {
            return (
              <div key="experience" className="mb-5 group/sec relative">
                <div className="flex items-center justify-between pb-1 mb-2.5 border-b border-slate-200">
                  <h2
                    className="font-bold uppercase tracking-wider"
                    style={{
                      color: currentTheme.color,
                      fontSize: `${0.95 * fontMultiplier}rem`,
                    }}
                  >
                    {sectionLabels.experience}
                  </h2>
                  <div className="flex items-center gap-1 print:hidden">
                    <div className="flex items-center gap-1 opacity-0 group-hover/sec:opacity-100 transition-opacity">
                      {secIdx > 0 && (
                        <button
                          type="button"
                          onClick={() => moveSection('experience', 'up')}
                          className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                          title="Đưa mục này lên trên"
                        >
                          <MoveUp className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {secIdx < sectionOrder.length - 1 && (
                        <button
                          type="button"
                          onClick={() => moveSection('experience', 'down')}
                          className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                          title="Đưa mục này xuống dưới"
                        >
                          <MoveDown className="h-3.5 w-3.5" />
                        </button>
                      )}
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
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline cursor-pointer opacity-70 hover:opacity-100 ml-1"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Thêm</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-3.5">
                  {workExperience.map((exp, idx) => (
                    <div
                      key={idx}
                      className="group relative p-2 rounded-lg hover:bg-slate-50/80 transition-all border border-transparent hover:border-slate-200 pr-14"
                    >
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

                      <div className="flex items-baseline justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <InlineText
                            value={exp.companyName || ''}
                            onChange={(v) => {
                              setWorkExperience((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, companyName: v } : item)),
                              );
                              markDirty();
                            }}
                            placeholder="Tên công ty"
                            className="font-bold text-slate-900"
                            style={{ fontSize: `${0.9 * fontMultiplier}rem` }}
                            defaultFontSizePx={resolveFontSizePx(0.9 * fontMultiplier * 16)}
                            defaultFontFamily={currentFont.family}
                          />
                        </div>

                        <div className="flex items-center gap-1 text-slate-500 text-xs italic shrink-0">
                          <InlineText
                            value={exp.startDate || ''}
                            onChange={(v) => {
                              setWorkExperience((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, startDate: v } : item)),
                              );
                              markDirty();
                            }}
                            placeholder="Bắt đầu"
                            className="w-16 text-right"
                            defaultFontSizePx={resolveFontSizePx(0.8 * fontMultiplier * 16)}
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
                            className="w-16"
                            defaultFontSizePx={resolveFontSizePx(0.8 * fontMultiplier * 16)}
                            defaultFontFamily={currentFont.family}
                          />
                        </div>
                      </div>

                      <InlineText
                        value={exp.position || ''}
                        onChange={(v) => {
                          setWorkExperience((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, position: v } : item)),
                          );
                          markDirty();
                        }}
                        placeholder="Vị trí công việc"
                        className="font-semibold text-slate-700 italic block mt-0.5"
                        style={{
                          color: currentTheme.color,
                          fontSize: `${0.85 * fontMultiplier}rem`,
                        }}
                        defaultFontSizePx={resolveFontSizePx(0.85 * fontMultiplier * 16)}
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
                        placeholder="Mô tả kinh nghiệm làm việc của bạn..."
                        className="text-slate-600 mt-1 block leading-relaxed text-justify"
                        style={{ fontSize: `${0.825 * fontMultiplier}rem` }}
                        defaultFontSizePx={resolveFontSizePx(0.825 * fontMultiplier * 16)}
                        defaultFontFamily={currentFont.family}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          }

          // 4. KỸ NĂNG
          if (sectionKey === 'skills' && visibleSections.skills) {
            return (
              <div key="skills" className="mb-5 group/sec relative">
                <div className="flex items-center justify-between pb-1 mb-2.5 border-b border-slate-200">
                  <h2
                    className="font-bold uppercase tracking-wider"
                    style={{
                      color: currentTheme.color,
                      fontSize: `${0.95 * fontMultiplier}rem`,
                    }}
                  >
                    {sectionLabels.skills}
                  </h2>
                  <div className="flex items-center gap-1 print:hidden">
                    <div className="flex items-center gap-1 opacity-0 group-hover/sec:opacity-100 transition-opacity">
                      {secIdx > 0 && (
                        <button
                          type="button"
                          onClick={() => moveSection('skills', 'up')}
                          className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                          title="Đưa mục này lên trên"
                        >
                          <MoveUp className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {secIdx < sectionOrder.length - 1 && (
                        <button
                          type="button"
                          onClick={() => moveSection('skills', 'down')}
                          className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                          title="Đưa mục này xuống dưới"
                        >
                          <MoveDown className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSkills((prev) => [...prev, { name: '', description: '' }]);
                        markDirty();
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline cursor-pointer opacity-70 hover:opacity-100 ml-1"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Thêm</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {skills.map((skill, idx) => (
                    <div
                      key={idx}
                      className="group relative flex items-center gap-3 p-1.5 rounded-lg hover:bg-slate-50/80 border border-transparent hover:border-slate-200 transition-all pr-14"
                    >
                      <div className="w-40 shrink-0">
                        <InlineText
                          value={skill.name || ''}
                          onChange={(v) => {
                            setSkills((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, name: v } : item)),
                            );
                            markDirty();
                          }}
                          placeholder="Kỹ năng / Danh mục"
                          className="font-bold text-slate-900"
                          style={{ fontSize: `${0.85 * fontMultiplier}rem` }}
                          defaultFontSizePx={resolveFontSizePx(0.85 * fontMultiplier * 16)}
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
                          placeholder="Chi tiết kỹ năng (vd: Python, React, ...)"
                          className="text-slate-600"
                          style={{ fontSize: `${0.85 * fontMultiplier}rem` }}
                          defaultFontSizePx={resolveFontSizePx(0.85 * fontMultiplier * 16)}
                          defaultFontFamily={currentFont.family}
                        />
                      </div>

                      {/* Floating Action Buttons */}
                      <div className="absolute right-1.5 top-1/2 -translate-y-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 bg-white border border-slate-200 shadow-sm rounded-lg p-0.5 print:hidden">
                        {idx > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setSkills((prev) => {
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
                        {idx < skills.length - 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              setSkills((prev) => {
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
                            setSkills((prev) => prev.filter((_, i) => i !== idx));
                            markDirty();
                          }}
                          className="p-1 hover:bg-red-50 rounded text-red-500 cursor-pointer"
                          title="Xóa kỹ năng"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          }

          // 5. HOẠT ĐỘNG
          if (sectionKey === 'activities' && visibleSections.activities) {
            return (
              <div key="activities" className="mb-5 group/sec relative">
                <div className="flex items-center justify-between pb-1 mb-2.5 border-b border-slate-200">
                  <h2
                    className="font-bold uppercase tracking-wider"
                    style={{
                      color: currentTheme.color,
                      fontSize: `${0.95 * fontMultiplier}rem`,
                    }}
                  >
                    {sectionLabels.activities}
                  </h2>
                  <div className="flex items-center gap-1 print:hidden">
                    <div className="flex items-center gap-1 opacity-0 group-hover/sec:opacity-100 transition-opacity">
                      {secIdx > 0 && (
                        <button
                          type="button"
                          onClick={() => moveSection('activities', 'up')}
                          className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                          title="Đưa mục này lên trên"
                        >
                          <MoveUp className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {secIdx < sectionOrder.length - 1 && (
                        <button
                          type="button"
                          onClick={() => moveSection('activities', 'down')}
                          className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                          title="Đưa mục này xuống dưới"
                        >
                          <MoveDown className="h-3.5 w-3.5" />
                        </button>
                      )}
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
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline cursor-pointer opacity-70 hover:opacity-100 ml-1"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Thêm</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  {activities.map((act, idx) => (
                    <div
                      key={idx}
                      className="group relative p-2 rounded-lg hover:bg-slate-50/80 transition-all border border-transparent hover:border-slate-200 pr-14"
                    >
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

                      <div className="flex items-baseline justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <InlineText
                            value={act.organizationName || ''}
                            onChange={(v) => {
                              setActivities((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, organizationName: v } : item)),
                              );
                              markDirty();
                            }}
                            placeholder="Tên tổ chức"
                            className="font-bold text-slate-900"
                            style={{ fontSize: `${0.9 * fontMultiplier}rem` }}
                            defaultFontSizePx={resolveFontSizePx(0.9 * fontMultiplier * 16)}
                            defaultFontFamily={currentFont.family}
                          />
                        </div>

                        <div className="flex items-center gap-1 text-slate-500 text-xs italic shrink-0">
                          <InlineText
                            value={act.startDate || ''}
                            onChange={(v) => {
                              setActivities((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, startDate: v } : item)),
                              );
                              markDirty();
                            }}
                            placeholder="Bắt đầu"
                            className="w-16 text-right"
                            defaultFontSizePx={resolveFontSizePx(0.8 * fontMultiplier * 16)}
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
                            className="w-16"
                            defaultFontSizePx={resolveFontSizePx(0.8 * fontMultiplier * 16)}
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
                        placeholder="Vị trí của bạn"
                        className="font-medium text-slate-700 italic block mt-0.5"
                        style={{ fontSize: `${0.85 * fontMultiplier}rem` }}
                        defaultFontSizePx={resolveFontSizePx(0.85 * fontMultiplier * 16)}
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
                        placeholder="Mô tả hoạt động"
                        className="text-slate-600 mt-1 block"
                        style={{ fontSize: `${0.825 * fontMultiplier}rem` }}
                        defaultFontSizePx={resolveFontSizePx(0.825 * fontMultiplier * 16)}
                        defaultFontFamily={currentFont.family}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          }

          // 6. CHỨNG CHỈ
          if (sectionKey === 'certificates' && visibleSections.certificates) {
            return (
              <div key="certificates" className="mb-5 group/sec relative">
                <div className="flex items-center justify-between pb-1 mb-2 border-b border-slate-200">
                  <h2
                    className="font-bold uppercase tracking-wider"
                    style={{
                      color: currentTheme.color,
                      fontSize: `${0.95 * fontMultiplier}rem`,
                    }}
                  >
                    {sectionLabels.certificates}
                  </h2>
                  <div className="flex items-center gap-1 print:hidden">
                    <div className="flex items-center gap-1 opacity-0 group-hover/sec:opacity-100 transition-opacity">
                      {secIdx > 0 && (
                        <button
                          type="button"
                          onClick={() => moveSection('certificates', 'up')}
                          className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                          title="Đưa mục này lên trên"
                        >
                          <MoveUp className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {secIdx < sectionOrder.length - 1 && (
                        <button
                          type="button"
                          onClick={() => moveSection('certificates', 'down')}
                          className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                          title="Đưa mục này xuống dưới"
                        >
                          <MoveDown className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setCertificates((prev) => [...prev, { name: '', date: '' }]);
                        markDirty();
                      }}
                      className="text-[11px] font-bold text-primary hover:underline cursor-pointer opacity-70 hover:opacity-100 ml-1"
                    >
                      + Thêm
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {certificates.map((cert, idx) => (
                    <div key={idx} className="group relative flex items-center gap-2 p-1 rounded hover:bg-slate-50/80 pr-8">
                      <div className="flex-1 min-w-0">
                        <InlineText
                          value={cert.name || ''}
                          onChange={(v) => {
                            setCertificates((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, name: v } : item)),
                            );
                            markDirty();
                          }}
                          placeholder="Tên chứng chỉ"
                          className="text-slate-800 font-semibold"
                          style={{ fontSize: `${0.85 * fontMultiplier}rem` }}
                          defaultFontSizePx={resolveFontSizePx(0.85 * fontMultiplier * 16)}
                          defaultFontFamily={currentFont.family}
                        />
                      </div>
                      <div className="w-14 shrink-0">
                        <InlineText
                          value={cert.date || ''}
                          onChange={(v) => {
                            setCertificates((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, date: v } : item)),
                            );
                            markDirty();
                          }}
                          placeholder="Năm"
                          className="text-center text-slate-500 text-xs"
                          defaultFontSizePx={resolveFontSizePx(0.75 * fontMultiplier * 16)}
                          defaultFontFamily={currentFont.family}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setCertificates((prev) => prev.filter((_, i) => i !== idx));
                          markDirty();
                        }}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-400 hover:text-red-500 rounded bg-white print:hidden cursor-pointer"
                        title="Xóa chứng chỉ"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          }

          // 7. GIẢI THƯỞNG
          if (sectionKey === 'awards' && visibleSections.awards) {
            return (
              <div key="awards" className="mb-5 group/sec relative">
                <div className="flex items-center justify-between pb-1 mb-2 border-b border-slate-200">
                  <h2
                    className="font-bold uppercase tracking-wider"
                    style={{
                      color: currentTheme.color,
                      fontSize: `${0.95 * fontMultiplier}rem`,
                    }}
                  >
                    {sectionLabels.awards}
                  </h2>
                  <div className="flex items-center gap-1 print:hidden">
                    <div className="flex items-center gap-1 opacity-0 group-hover/sec:opacity-100 transition-opacity">
                      {secIdx > 0 && (
                        <button
                          type="button"
                          onClick={() => moveSection('awards', 'up')}
                          className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                          title="Đưa mục này lên trên"
                        >
                          <MoveUp className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {secIdx < sectionOrder.length - 1 && (
                        <button
                          type="button"
                          onClick={() => moveSection('awards', 'down')}
                          className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                          title="Đưa mục này xuống dưới"
                        >
                          <MoveDown className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAwards((prev) => [...prev, { name: '', date: '' }]);
                        markDirty();
                      }}
                      className="text-[11px] font-bold text-primary hover:underline cursor-pointer opacity-70 hover:opacity-100 ml-1"
                    >
                      + Thêm
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {awards.map((award, idx) => (
                    <div key={idx} className="group relative flex items-center gap-2 p-1 rounded hover:bg-slate-50/80 pr-8">
                      <div className="flex-1 min-w-0">
                        <InlineText
                          value={award.name || ''}
                          onChange={(v) => {
                            setAwards((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, name: v } : item)),
                            );
                            markDirty();
                          }}
                          placeholder="Tên giải thưởng"
                          className="text-slate-800 font-semibold"
                          style={{ fontSize: `${0.85 * fontMultiplier}rem` }}
                          defaultFontSizePx={resolveFontSizePx(0.85 * fontMultiplier * 16)}
                          defaultFontFamily={currentFont.family}
                        />
                      </div>
                      <div className="w-14 shrink-0">
                        <InlineText
                          value={award.date || ''}
                          onChange={(v) => {
                            setAwards((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, date: v } : item)),
                            );
                            markDirty();
                          }}
                          placeholder="Năm"
                          className="text-center text-slate-500 text-xs"
                          defaultFontSizePx={resolveFontSizePx(0.75 * fontMultiplier * 16)}
                          defaultFontFamily={currentFont.family}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setAwards((prev) => prev.filter((_, i) => i !== idx));
                          markDirty();
                        }}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-400 hover:text-red-500 rounded bg-white print:hidden cursor-pointer"
                        title="Xóa giải thưởng"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
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
        <span>Tổng số trang: {pageCount}</span>
        <span className="inline-flex items-center gap-1 font-semibold text-slate-500">
          <Sparkles className="h-3 w-3 text-primary" />
          Được tạo bởi <b className="text-slate-700">TalentPulse</b> — talentpulse.vn
        </span>
      </div>
    </div>
  );
}
