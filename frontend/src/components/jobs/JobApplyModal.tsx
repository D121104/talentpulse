import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  FileText,
  Upload,
  CheckCircle2,
  Sparkles,
  Building2,
  Loader2,
  Lock,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../context/ToastContext';
import { JobItem, formatSalary } from '../../lib/jobApi';
import { userCvApi, onlineCvApi, fileUploadApi } from '../../lib/cvApi';
import type { UserCV, OnlineCV } from '../../lib/cvTypes';
import { apiRequest } from '../../lib/api';

interface JobApplyModalProps {
  job: JobItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function JobApplyModal({
  job,
  isOpen,
  onClose,
  onSuccess,
}: JobApplyModalProps) {
  const { user, accessToken } = useAuth();
  const { success, error } = useToast();

  const [activeTab, setActiveTab] = useState<'uploaded' | 'online' | 'upload_new'>('uploaded');
  const [uploadedCvs, setUploadedCvs] = useState<UserCV[]>([]);
  const [onlineCvs, setOnlineCvs] = useState<OnlineCV[]>([]);
  const [selectedCvId, setSelectedCvId] = useState<string>('');
  const [coverLetter, setCoverLetter] = useState<string>('');
  const [aiConsent, setAiConsent] = useState<boolean>(true);

  const [loadingCvs, setLoadingCvs] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);

  useEffect(() => {
    if (isOpen && user && accessToken) {
      loadUserCvs();
    }
  }, [isOpen, user, accessToken]);

  const loadUserCvs = async () => {
    try {
      setLoadingCvs(true);
      const [uCvs, oCvs] = await Promise.all([
        userCvApi.findAll(accessToken).catch(() => []),
        onlineCvApi.findAll(accessToken).catch(() => []),
      ]);

      const validUCvs = Array.isArray(uCvs) ? uCvs : [];
      const validOCvs = Array.isArray(oCvs) ? oCvs : [];

      setUploadedCvs(validUCvs);
      setOnlineCvs(validOCvs);

      // Auto select primary or first available CV
      const primaryUCv = validUCvs.find((c) => c.isPrimary);
      const primaryOCv = validOCvs.find((c) => c.isPrimary);

      if (primaryUCv) {
        setSelectedCvId(primaryUCv._id);
        setActiveTab('uploaded');
      } else if (primaryOCv) {
        setSelectedCvId(primaryOCv._id);
        setActiveTab('online');
      } else if (validUCvs.length > 0) {
        setSelectedCvId(validUCvs[0]._id);
        setActiveTab('uploaded');
      } else if (validOCvs.length > 0) {
        setSelectedCvId(validOCvs[0]._id);
        setActiveTab('online');
      } else {
        setActiveTab('upload_new');
      }
    } catch {
      // Ignore load error
    } finally {
      setLoadingCvs(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!accessToken) return;
    try {
      setUploadingFile(true);
      const uploadRes = await fileUploadApi.uploadCvFile(file, accessToken);
      if (uploadRes?.url) {
        // Create UserCV record
        const createdCv = await userCvApi.create(
          {
            title: file.name.replace(/\.[^/.]+$/, ''),
            url: uploadRes.url,
            fileType: file.type || 'application/pdf',
            isPrimary: uploadedCvs.length === 0,
          },
          accessToken,
        );

        if (createdCv?._id) {
          setUploadedCvs((prev) => [createdCv, ...prev]);
          setSelectedCvId(createdCv._id);
          setActiveTab('uploaded');
          success('Tải CV lên thành công!');
        }
      }
    } catch (err: any) {
      error(err?.message || 'Tải file CV thất bại. Vui lòng thử lại.');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!job || !accessToken) return;

    if (!selectedCvId) {
      error('Vui lòng chọn hoặc tải lên một CV để ứng tuyển.');
      return;
    }

    try {
      setSubmitting(true);
      await apiRequest('/applications', {
        method: 'POST',
        body: {
          cvId: selectedCvId,
          jobId: job._id,
          companyId: job.company?._id || '',
          coverLetter: coverLetter.trim() || undefined,
        },
        accessToken,
      });

      success('Nộp hồ sơ ứng tuyển thành công! Nhà tuyển dụng sẽ sớm phản hồi.');
      onSuccess?.();
      onClose();
    } catch (err: any) {
      error(err?.message || 'Nộp hồ sơ ứng tuyển thất bại. Vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !job) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', duration: 0.35 }}
          className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden z-10 my-8"
        >
          {/* Modal Header */}
          <div className="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between">
            <div>
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light mb-2">
                <Sparkles className="w-3 h-3" />
                Ứng tuyển trực tuyến
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white line-clamp-1">
                {job.name}
              </h2>
              <div className="mt-1 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5" />
                  {job.company?.name || 'TalentPulse Employer'}
                </span>
                <span>•</span>
                <span className="font-semibold text-rose-600 dark:text-rose-400">
                  {formatSalary(job.salary)}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Modal Body */}
          {!user ? (
            <div className="p-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
                <Lock className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Vui lòng đăng nhập để nộp đơn ứng tuyển
              </h3>
              <p className="mt-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Đăng nhập tài khoản ứng viên giúp bạn nộp CV nhanh chóng, theo dõi trạng thái hồ sơ và nhận gợi ý việc làm chuẩn xác từ AI.
              </p>
              <div className="mt-6 flex items-center justify-center gap-3">
                <Link
                  to="/login"
                  className="px-5 py-2.5 bg-primary hover:bg-primary-dark text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-primary/25"
                >
                  Đăng nhập ngay
                </Link>
                <Link
                  to="/register"
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl transition-colors"
                >
                  Tạo tài khoản mới
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {/* CV Selection Tabs */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                  Chọn CV ứng tuyển <span className="text-rose-500">*</span>
                </label>

                {/* Tab Switcher */}
                <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-3">
                  <button
                    type="button"
                    onClick={() => setActiveTab('uploaded')}
                    className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-lg transition-all ${
                      activeTab === 'uploaded'
                        ? 'bg-white dark:bg-slate-700 text-primary shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    CV đã tải lên ({uploadedCvs.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('online')}
                    className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-lg transition-all ${
                      activeTab === 'online'
                        ? 'bg-white dark:bg-slate-700 text-primary shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    CV Online ({onlineCvs.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('upload_new')}
                    className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-lg transition-all ${
                      activeTab === 'upload_new'
                        ? 'bg-white dark:bg-slate-700 text-primary shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    + Tải CV mới
                  </button>
                </div>

                {/* Tab 1: Uploaded CVs */}
                {activeTab === 'uploaded' && (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {loadingCvs ? (
                      <div className="py-6 flex items-center justify-center gap-2 text-xs text-slate-400">
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        Đang tải danh sách CV...
                      </div>
                    ) : uploadedCvs.length === 0 ? (
                      <div className="py-5 text-center bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                        <FileText className="w-6 h-6 text-slate-400 mx-auto mb-1" />
                        <p className="text-xs text-slate-500">Bạn chưa có file CV tải lên nào.</p>
                        <button
                          type="button"
                          onClick={() => setActiveTab('upload_new')}
                          className="mt-2 text-xs font-bold text-primary hover:underline"
                        >
                          + Tải file CV lên ngay
                        </button>
                      </div>
                    ) : (
                      uploadedCvs.map((cv) => (
                        <label
                          key={cv._id}
                          className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                            selectedCvId === cv._id
                              ? 'border-primary bg-primary/5 dark:bg-primary/10 ring-1 ring-primary'
                              : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800/60'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <input
                              type="radio"
                              name="cv_select"
                              checked={selectedCvId === cv._id}
                              onChange={() => setSelectedCvId(cv._id)}
                              className="w-4 h-4 text-primary focus:ring-primary"
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                                  {cv.title || 'CV tải lên'}
                                </span>
                                {cv.isPrimary && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                    Chính
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-400">
                                Cập nhật:{' '}
                                {new Date(cv.updatedAt || cv.createdAt).toLocaleDateString('vi-VN')}
                              </p>
                            </div>
                          </div>

                          {cv.url && (
                            <a
                              href={cv.url}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-xs text-primary hover:underline font-medium ml-2 shrink-0"
                            >
                              Xem CV
                            </a>
                          )}
                        </label>
                      ))
                    )}
                  </div>
                )}

                {/* Tab 2: Online CVs */}
                {activeTab === 'online' && (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {onlineCvs.length === 0 ? (
                      <div className="py-5 text-center bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                        <FileText className="w-6 h-6 text-slate-400 mx-auto mb-1" />
                        <p className="text-xs text-slate-500">Bạn chưa tạo CV Online nào.</p>
                        <Link
                          to="/cv-templates"
                          className="mt-2 inline-block text-xs font-bold text-primary hover:underline"
                        >
                          + Tạo CV Online ngay
                        </Link>
                      </div>
                    ) : (
                      onlineCvs.map((cv) => (
                        <label
                          key={cv._id}
                          className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                            selectedCvId === cv._id
                              ? 'border-primary bg-primary/5 dark:bg-primary/10 ring-1 ring-primary'
                              : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800/60'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <input
                              type="radio"
                              name="cv_select"
                              checked={selectedCvId === cv._id}
                              onChange={() => setSelectedCvId(cv._id)}
                              className="w-4 h-4 text-primary focus:ring-primary"
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                                  {cv.title || cv.fullName || 'CV Trực tuyến'}
                                </span>
                                {cv.isPrimary && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                    Chính
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-400">
                                {cv.position || 'Vị trí ứng tuyển'} • Mẫu {cv.templateType}
                              </p>
                            </div>
                          </div>
                        </label>
                      ))
                    )}
                  </div>
                )}

                {/* Tab 3: Upload New CV */}
                {activeTab === 'upload_new' && (
                  <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-primary rounded-2xl p-6 text-center transition-colors">
                    <input
                      type="file"
                      id="file-upload-modal"
                      accept=".pdf,.doc,.docx"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          handleFileUpload(f);
                        }
                      }}
                      className="hidden"
                    />
                    <label
                      htmlFor="file-upload-modal"
                      className="flex flex-col items-center justify-center cursor-pointer"
                    >
                      {uploadingFile ? (
                        <div className="py-2 flex flex-col items-center">
                          <Loader2 className="w-8 h-8 animate-spin text-primary mb-2" />
                          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                            Đang tải lên và phân tích CV...
                          </span>
                        </div>
                      ) : (
                        <>
                          <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-2">
                            <Upload className="w-6 h-6" />
                          </div>
                          <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100">
                            Nhấn để chọn file CV hoặc kéo thả vào đây
                          </span>
                          <span className="mt-1 text-[11px] text-slate-400">
                            Hỗ trợ định dạng PDF, DOC, DOCX (Dung lượng tối đa 10MB)
                          </span>
                        </>
                      )}
                    </label>
                  </div>
                )}
              </div>

              {/* Cover Letter */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Thư giới thiệu (Cover letter)
                </label>
                <textarea
                  rows={3}
                  value={coverLetter}
                  onChange={(e) => setCoverLetter(e.target.value)}
                  placeholder="Viết lời chào hoặc giới thiệu ngắn gọn lý do bạn phù hợp với vị trí này..."
                  className="w-full text-xs sm:text-sm p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all resize-none"
                />
              </div>

              {/* AI Consent Checkbox */}
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40">
                <input
                  type="checkbox"
                  id="ai-consent"
                  checked={aiConsent}
                  onChange={(e) => setAiConsent(e.target.checked)}
                  className="w-4 h-4 text-primary rounded border-slate-300 mt-0.5 focus:ring-primary"
                />
                <label htmlFor="ai-consent" className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed cursor-pointer select-none">
                  Cho phép hệ thống AI của TalentPulse so khớp kỹ năng và kinh nghiệm trong CV với tiêu chuẩn của công việc để tối ưu hóa điểm đánh giá hồ sơ.
                </label>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                >
                  Hủy bỏ
                </button>

                <button
                  type="submit"
                  disabled={submitting || !selectedCvId}
                  className="px-6 py-2.5 bg-primary hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl shadow-md shadow-primary/25 hover:shadow-primary/35 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Đang nộp hồ sơ...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Nộp hồ sơ ngay
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
