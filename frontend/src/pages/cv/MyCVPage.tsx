import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  Plus,
  Upload,
  Edit3,
  Download,
  Trash2,
  Briefcase,
  FileText,
  FileUp,
  ExternalLink,
  QrCode,
  Bookmark,
  MapPin,
  Crown,
  Star,
  MoreHorizontal,
  Eye,
  ShieldCheck,
  Rocket,
  Clock,
  AlertCircle,
  Zap,
} from 'lucide-react';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import { UserAvatar } from '../../components/common/UserAvatar';
import { formatDate, formatDateTime, parseDate } from '../../lib/dateUtils';
import { MobileNoticeModal } from '../../components/cv/MobileNoticeModal';
import { DownloadCVModal } from '../../components/cv/DownloadCVModal';
import { CVPreviewCanvas } from '../../components/cv/CVPreviewCanvas';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../context/ToastContext';
import { onlineCvApi, userCvApi, fileUploadApi } from '../../lib/cvApi';
import { candidateApi, type BoostStatusResult } from '../../lib/userApi';
import { authApi } from '../../lib/api';
import type { OnlineCV, UserCV } from '../../lib/cvTypes';

function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
  className = '',
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={`relative inline-flex h-5.5 w-10 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary/20 ${
        checked ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-700'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
          checked ? 'translate-x-5' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export default function MyCVPage() {
  const { t } = useTranslation();
  const { user, accessToken } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  // Data states
  const [onlineCvs, setOnlineCvs] = useState<OnlineCV[]>([]);
  const [uploadedCvs, setUploadedCvs] = useState<UserCV[]>([]);
  const [loadingOnline, setLoadingOnline] = useState(true);
  const [loadingUploaded, setLoadingUploaded] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [downloadingCvId, setDownloadingCvId] = useState<string | null>(null);
  const [activeMenuCvId, setActiveMenuCvId] = useState<string | null>(null);
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [selectedCvForDownload, setSelectedCvForDownload] = useState<OnlineCV | null>(null);

  // Profile Boost state
  const [boostStatus, setBoostStatus] = useState<BoostStatusResult | null>(null);
  const [isBoosting, setIsBoosting] = useState(false);
  const [isResendingVerify, setIsResendingVerify] = useState(false);

  // Toggles
  const [jobSeekingActive, setJobSeekingActive] = useState(true);
  const [jobRecommendationActive, setJobRecommendationActive] = useState(true);
  const [allowRecruiterSearchActive, setAllowRecruiterSearchActive] = useState(true);
  const [searchableMap, setSearchableMap] = useState<Record<string, boolean>>({});

  // Mobile check
  const [isMobileNoticeOpen, setIsMobileNoticeOpen] = useState(false);
  const [isMobileScreen, setIsMobileScreen] = useState(false);
  const [isUploadHighlighted, setIsUploadHighlighted] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadSectionRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  const triggerScrollToUpload = () => {
    setTimeout(() => {
      if (uploadSectionRef.current) {
        uploadSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setIsUploadHighlighted(true);
        setTimeout(() => setIsUploadHighlighted(false), 2200);
      }
    }, 120);
  };

  useEffect(() => {
    const isUploadTarget =
      location.hash === '#upload' ||
      location.hash === '#upload-cv' ||
      location.hash === '#upload-cv-section' ||
      (location.state as Record<string, unknown> | null)?.scrollTo === 'upload';

    if (isUploadTarget) {
      triggerScrollToUpload();
    }
  }, [location.hash, location.state]);

  const handledToastRef = useRef<string | null>(null);

  useEffect(() => {
    const navState = location.state as {
      toast?: { type: 'success' | 'error' | 'info'; message: string; description?: string };
    } | null;

    if (navState?.toast) {
      const toastKey = `${navState.toast.type}-${navState.toast.message}-${navState.toast.description || ''}`;
      if (handledToastRef.current !== toastKey) {
        handledToastRef.current = toastKey;
        toast.showToast({
          type: navState.toast.type || 'success',
          message: navState.toast.message,
          description: navState.toast.description,
        });
        navigate(location.pathname + location.search + location.hash, {
          replace: true,
          state: {},
        });
      }
    }
  }, [location.state, location.pathname, location.search, location.hash, navigate, toast]);

  useEffect(() => {
    const handleCustomScroll = () => {
      triggerScrollToUpload();
    };
    window.addEventListener('talentpulse:scroll-upload', handleCustomScroll);
    return () => window.removeEventListener('talentpulse:scroll-upload', handleCustomScroll);
  }, []);

  useEffect(() => {
    const checkScreen = () => {
      setIsMobileScreen(window.innerWidth < 1024);
    };
    checkScreen();
    window.addEventListener('resize', checkScreen);

    const handleClickOutside = () => setActiveMenuCvId(null);
    window.addEventListener('click', handleClickOutside);

    return () => {
      window.removeEventListener('resize', checkScreen);
      window.removeEventListener('click', handleClickOutside);
    };
  }, []);

  // Fetch candidate settings
  const fetchSettings = async () => {
    if (!accessToken) return;
    try {
      const res = await candidateApi.getSettings(accessToken);
      if (res) {
        setJobSeekingActive(res.isJobSeeking ?? true);
        setJobRecommendationActive(res.isJobRecommendation ?? true);
        setAllowRecruiterSearchActive(res.allowRecruiterSearch ?? true);
      }
    } catch (err) {
      console.error('Error fetching candidate settings:', err);
    }
  };

  // Fetch online CVs
  const fetchOnlineCvs = async () => {
    if (!accessToken) return;
    setLoadingOnline(true);
    try {
      const data = await onlineCvApi.findAll(accessToken);
      setOnlineCvs(data || []);
      setSearchableMap((prev) => {
        const next = { ...prev };
        (data || []).forEach((c) => {
          next[c._id] = c.isSearchable ?? true;
        });
        return next;
      });
    } catch (err) {
      console.error('Error fetching online CVs:', err);
    } finally {
      setLoadingOnline(false);
    }
  };

  // Fetch uploaded CVs
  const fetchUploadedCvs = async () => {
    if (!accessToken) return;
    setLoadingUploaded(true);
    try {
      const data = await userCvApi.findAll(accessToken);
      setUploadedCvs(data || []);
      setSearchableMap((prev) => {
        const next = { ...prev };
        (data || []).forEach((c) => {
          next[c._id] = c.isSearchable ?? true;
        });
        return next;
      });
    } catch (err) {
      console.error('Error fetching uploaded CVs:', err);
    } finally {
      setLoadingUploaded(false);
    }
  };

  // Fetch boost status
  const fetchBoostStatus = async () => {
    if (!accessToken) return;
    try {
      const res = await candidateApi.getBoostStatus(accessToken);
      setBoostStatus(res);
    } catch (err) {
      console.error('Error fetching boost status:', err);
    }
  };

  useEffect(() => {
    if (accessToken) {
      void fetchSettings();
      void fetchOnlineCvs();
      void fetchUploadedCvs();
      void fetchBoostStatus();
    }
  }, [accessToken]);

  // Toggle handlers with instant optimistic UI + backend sync
  const handleToggleOnlineCvSearchable = async (cvId: string, currentVal: boolean) => {
    if (!accessToken) return;
    const newVal = !currentVal;
    setSearchableMap((prev) => ({ ...prev, [cvId]: newVal }));
    try {
      await onlineCvApi.toggleSearchable(cvId, newVal, accessToken);
      toast.showToast({
        type: 'success',
        message: newVal
          ? 'Đã bật cho phép NTD tìm kiếm CV này'
          : 'Đã tắt cho phép NTD tìm kiếm CV này',
      });
    } catch (err: any) {
      setSearchableMap((prev) => ({ ...prev, [cvId]: currentVal }));
      toast.showToast({
        type: 'error',
        message: err?.message || 'Không thể cập nhật trạng thái tìm kiếm của CV',
      });
    }
  };

  const handleToggleUploadedCvSearchable = async (cvId: string, currentVal: boolean) => {
    if (!accessToken) return;
    const newVal = !currentVal;
    setSearchableMap((prev) => ({ ...prev, [cvId]: newVal }));
    try {
      await userCvApi.toggleSearchable(cvId, newVal, accessToken);
      toast.showToast({
        type: 'success',
        message: newVal
          ? 'Đã bật cho phép NTD tìm kiếm CV này'
          : 'Đã tắt cho phép NTD tìm kiếm CV này',
      });
    } catch (err: any) {
      setSearchableMap((prev) => ({ ...prev, [cvId]: currentVal }));
      toast.showToast({
        type: 'error',
        message: err?.message || 'Không thể cập nhật trạng thái tìm kiếm của CV',
      });
    }
  };

  const handleToggleJobSeeking = async (val: boolean) => {
    setJobSeekingActive(val);
    if (!accessToken) return;
    try {
      await candidateApi.updateSettings({ isJobSeeking: val }, accessToken);
      toast.showToast({
        type: 'success',
        message: val ? 'Đã bật trạng thái tìm việc' : 'Đã tắt trạng thái tìm việc',
      });
    } catch (err: any) {
      setJobSeekingActive(!val);
      toast.showToast({
        type: 'error',
        message: err?.message || 'Lỗi cập nhật cài đặt',
      });
    }
  };

  const handleToggleJobRecommendation = async (val: boolean) => {
    setJobRecommendationActive(val);
    if (!accessToken) return;
    try {
      await candidateApi.updateSettings({ isJobRecommendation: val }, accessToken);
      toast.showToast({
        type: 'success',
        message: val ? 'Đã bật gợi ý việc làm' : 'Đã tắt gợi ý việc làm',
      });
    } catch (err: any) {
      setJobRecommendationActive(!val);
      toast.showToast({
        type: 'error',
        message: err?.message || 'Lỗi cập nhật cài đặt',
      });
    }
  };

  const handleToggleAllowRecruiterSearch = async (val: boolean) => {
    setAllowRecruiterSearchActive(val);
    if (!accessToken) return;
    try {
      await candidateApi.updateSettings({ allowRecruiterSearch: val }, accessToken);
      toast.showToast({
        type: 'success',
        message: val
          ? 'Đã bật cho phép NTD tìm kiếm hồ sơ của bạn'
          : 'Đã tắt cho phép NTD tìm kiếm hồ sơ của bạn',
      });
    } catch (err: any) {
      setAllowRecruiterSearchActive(!val);
      toast.showToast({
        type: 'error',
        message: err?.message || 'Lỗi cập nhật cài đặt',
      });
    }
  };

  const handleSetPrimaryOnlineCv = async (cvId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!accessToken) return;
    setOnlineCvs((prev) =>
      prev.map((c) => ({
        ...c,
        isPrimary: c._id === cvId,
      })),
    );
    try {
      await onlineCvApi.setPrimary(cvId, accessToken);
      toast.showToast({
        type: 'success',
        message: '⭐ Đã đặt làm CV chính thành công!',
      });
    } catch (err: any) {
      void fetchOnlineCvs();
      toast.showToast({
        type: 'error',
        message: err?.message || 'Không thể đặt CV chính',
      });
    }
  };

  const handleSetPrimaryUploadedCv = async (cvId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!accessToken) return;
    setUploadedCvs((prev) =>
      prev.map((c) => ({
        ...c,
        isPrimary: c._id === cvId,
      })),
    );
    try {
      await userCvApi.setPrimary(cvId, accessToken);
      toast.showToast({
        type: 'success',
        message: '⭐ Đã đặt làm CV chính thành công!',
      });
    } catch (err: any) {
      void fetchUploadedCvs();
      toast.showToast({
        type: 'error',
        message: err?.message || 'Không thể đặt CV chính',
      });
    }
  };

  // Handle boost profile action
  const handleBoostProfile = async () => {
    if (!accessToken) return;
    setIsBoosting(true);
    try {
      const res = await candidateApi.boostProfile(accessToken);
      toast.success(
        'Đẩy Top Thành Công! 🚀',
        res.message || 'Hồ sơ của bạn đã được ưu tiên hiển thị hàng đầu với Nhà Tuyển Dụng.',
      );
      void fetchBoostStatus();
    } catch (err: any) {
      toast.error('Đẩy Top thất bại', err?.message || 'Không thể kích hoạt đẩy Top.');
    } finally {
      setIsBoosting(false);
    }
  };

  // Handle Resend Verification Email
  const handleResendVerification = async () => {
    if (!user?.email) return;
    setIsResendingVerify(true);
    try {
      const res = await authApi.resendVerification({ email: user.email });
      toast.success('Đã gửi email xác thực!', res.message || 'Vui lòng kiểm tra hòm thư của bạn.');
    } catch (err: any) {
      toast.error('Lỗi gửi email', err?.message || 'Không thể gửi lại email xác thực.');
    } finally {
      setIsResendingVerify(false);
    }
  };

  // Handle Create CV click
  const maxCvLimit = user?.isPremium ? 9999 : user?.isVerified ? 6 : 3;
  const isCvLimitReached = !user?.isPremium && onlineCvs.length >= maxCvLimit;

  const handleCreateCvClick = () => {
    if (isMobileScreen) {
      setIsMobileNoticeOpen(true);
      return;
    }
    if (isCvLimitReached) {
      toast.info(
        `Đạt giới hạn ${maxCvLimit} CV`,
        user?.isVerified
          ? 'Vui lòng nâng cấp gói Candidate Premium để tạo không giới hạn CV.'
          : 'Vui lòng xác thực email (nhận 6 CV) hoặc nâng cấp Premium (không giới hạn CV).',
      );
      return;
    }
    navigate('/cv-templates');
  };

  // Handle Edit CV click
  const handleEditCvClick = (cvId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isMobileScreen) {
      setIsMobileNoticeOpen(true);
      return;
    }
    navigate(`/cv-editor/${cvId}`);
  };

  // Trigger direct browser file download to user's disk
  const triggerPdfDownload = async (url: string, fullName?: string) => {
    const rawName = fullName ? `CV_${fullName}` : 'CV_TalentPulse';
    const safeName = rawName
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_');
    const fileName = `${safeName || 'CV_TalentPulse'}.pdf`;

    try {
      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) throw new Error('Fetch failed');
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 2000);
    } catch (err) {
      console.warn('Direct blob download failed, fallback to download attribute / attachment URL:', err);
      let downloadUrl = url;
      if (url.includes('/upload/') && !url.includes('/fl_attachment')) {
        downloadUrl = url.replace('/upload/', `/upload/fl_attachment:${encodeURIComponent(safeName)}/`);
      }
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', fileName);
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Handle Download PDF click -> Opens the Download Options Modal
  const handleDownloadCvClick = (cv: OnlineCV, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedCvForDownload(cv);
    setDownloadModalOpen(true);
  };

  // Handle Download from Modal (Free or Premium)
  const handleDownloadWithModal = async (cv: OnlineCV, isPremium: boolean) => {
    setDownloadingCvId(cv._id);
    try {
      const res = await onlineCvApi.exportPdf(cv._id, accessToken, undefined, isPremium);
      if (res?.pdfUrl) {
        await triggerPdfDownload(res.pdfUrl, cv.fullName);
        void fetchOnlineCvs();
      } else {
        alert('Không thể tạo file PDF. Vui lòng mở CV để chỉnh sửa và thử lại!');
      }
    } catch (err: any) {
      console.error('Download CV error:', err);
      alert(err.message || 'Không thể tải file PDF về máy.');
    } finally {
      setDownloadingCvId(null);
    }
  };

  // Handle Card Click (Open Cloudinary preview in new tab when clicking on the CV card body)
  const handleCardClick = async (cv: OnlineCV) => {
    if (cv.pdfUrl) {
      window.open(cv.pdfUrl, '_blank');
      return;
    }
    try {
      const res = await onlineCvApi.exportPdf(cv._id, accessToken);
      if (res?.pdfUrl) {
        window.open(res.pdfUrl, '_blank');
        void fetchOnlineCvs();
        return;
      }
    } catch (err) {
      console.warn('Cannot open preview directly:', err);
    }
    navigate(`/cv-editor/${cv._id}`);
  };

  // Handle Delete Online CV
  const handleDeleteOnlineCv = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Bạn có chắc chắn muốn xóa CV này?')) return;
    try {
      await onlineCvApi.remove(id, accessToken);
      setOnlineCvs((prev) => prev.filter((c) => c._id !== id));
      toast.success('Đã xóa CV thành công');
    } catch (err: any) {
      toast.error('Xóa CV thất bại', err.message || 'Không thể xóa CV.');
    }
  };

  // Handle File Upload for User CVs (PDF / DOCX)
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size < 5MB
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Kích thước file quá lớn', 'Kích thước file không được vượt quá 5MB.');
      return;
    }

    // Check format (PDF or DOCX)
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'pdf' && ext !== 'docx' && ext !== 'doc') {
      toast.error('Định dạng file không hỗ trợ', 'Hệ thống chỉ hỗ trợ định dạng file PDF hoặc DOCX.');
      return;
    }

    setIsUploading(true);
    setUploadError('');

    try {
      const uploadRes = await fileUploadApi.uploadCvFile(file, accessToken);
      if (uploadRes?.url) {
        await userCvApi.create(
          {
            url: uploadRes.url,
            title: file.name.replace(/\.[^/.]+$/, ''),
            fileType: ext === 'pdf' ? 'pdf' : 'docx',
          },
          accessToken,
        );
        void fetchUploadedCvs();
        toast.success('Tải CV lên thành công!', `File "${file.name}" đã được tải lên và sẵn sàng ứng tuyển.`);
      }
    } catch (err: any) {
      const errMsg = err.message || 'Không thể tải file lên. Vui lòng thử lại!';
      setUploadError(errMsg);
      toast.error('Tải CV thất bại', errMsg);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Handle Delete Uploaded CV
  const handleDeleteUploadedCv = async (id: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa file CV này?')) return;
    try {
      await userCvApi.remove(id, accessToken);
      setUploadedCvs((prev) => prev.filter((c) => c._id !== id));
      toast.success('Đã xóa file CV thành công');
    } catch (err: any) {
      toast.error('Xóa file thất bại', err.message || 'Không thể xóa file.');
    }
  };

  // Recommended Jobs Mock Data (matches image 2)
  const recommendedJobs = [
    {
      id: '1',
      title: 'Kỹ Sư Lập Trình Fullstack: Backend (Golang), Frontend (ReactJS, TypeScript)',
      company: 'Công ty TNHH Công Nghệ Dicom',
      logo: 'https://images.unsplash.com/photo-1549924231-f129b911e442?w=100&h=100&fit=crop&q=80',
      location: 'Hà Nội',
      deadline: 'Còn 4 ngày để ứng tuyển',
      salary: 'Thỏa thuận',
      updatedAt: 'Cập nhật 4 giờ trước',
      isHot: true,
    },
    {
      id: '2',
      title: 'Senior Fullstack Developer (NodeJS / NestJS, ReactJS)',
      company: 'Công ty Cổ phần TOPCV Việt Nam',
      logo: 'https://images.unsplash.com/photo-1572021335469-31706a17aaef?w=100&h=100&fit=crop&q=80',
      location: 'Hà Nội',
      deadline: 'Còn 10 ngày để ứng tuyển',
      salary: 'Thỏa thuận',
      updatedAt: 'Cập nhật 15 phút trước',
      isHot: true,
    },
    {
      id: '3',
      title: 'Nhân Viên JavaScript / TypeScript Fullstack [HN]',
      company: 'CÔNG TY TNHH GIẢI PHÁP CÔNG NGHỆ VIK SOLUTION',
      logo: 'https://images.unsplash.com/photo-1551434678-e076c223a692?w=100&h=100&fit=crop&q=80',
      location: 'Hà Nội',
      deadline: 'Còn 12 ngày để ứng tuyển',
      salary: 'Thỏa thuận',
      updatedAt: 'Cập nhật 1 ngày trước',
      isHot: false,
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950 font-sans">
      <Header />

      <main className="flex-1 pt-20 sm:pt-24 lg:pt-28 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          {/* Main 2-Column Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
            {/* ================= LEFT MAIN COLUMN (8 cols / ~70%) ================= */}
            <div className="lg:col-span-8 space-y-6">
              {/* 0. CV QUOTA & TIER STATUS BANNER */}
              <div className="rounded-3xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Dung lượng tạo CV
                      </span>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-black border ${
                        user?.isPremium
                          ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
                          : user?.isVerified
                          ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}>
                        {user?.isPremium ? (
                          <>👑 Premium (Không giới hạn)</>
                        ) : user?.isVerified ? (
                          <>🛡️ Đã Xác Thực (Tối đa 6 CV)</>
                        ) : (
                          <>Tài khoản Thường (Tối đa 3 CV)</>
                        )}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <h3 className="text-2xl font-black text-slate-900 dark:text-white">
                        {onlineCvs.length}
                        <span className="text-sm font-semibold text-slate-400">
                          {' '}/ {user?.isPremium ? '∞ (25+)' : user?.isVerified ? '6' : '3'} CV đã tạo
                        </span>
                      </h3>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 w-full sm:w-auto">
                    {!user?.isPremium && (
                      <Link
                        to="/premium"
                        className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 px-4 py-2.5 text-xs font-extrabold text-white shadow-md shadow-amber-500/20 active:scale-98 transition cursor-pointer"
                      >
                        <Crown className="h-3.5 w-3.5" />
                        <span>Nâng Cấp Premium (Không giới hạn)</span>
                      </Link>
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mt-3.5">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        user?.isPremium
                          ? 'bg-gradient-to-r from-amber-400 to-amber-500'
                          : isCvLimitReached
                          ? 'bg-red-500'
                          : 'bg-primary'
                      }`}
                      style={{
                        width: `${
                          user?.isPremium
                            ? 100
                            : Math.min(100, Math.round((onlineCvs.length / maxCvLimit) * 100))
                        }%`,
                      }}
                    />
                  </div>
                </div>

                {/* Unverified Alert */}
                {!user?.isVerified && !user?.isPremium && (
                  <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl bg-sky-500/10 border border-sky-500/20 p-3.5 text-xs text-sky-800 dark:text-sky-300">
                    <div className="flex items-start gap-2.5">
                      <ShieldCheck className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400 mt-0.5" />
                      <div>
                        <span className="font-bold">Xác thực tài khoản qua Gmail để mở rộng:</span> Tạo tối đa <strong>6 CV</strong>, nhận <strong>Tích Xanh</strong> và <strong>1 lượt Đẩy Top/tuần</strong> miễn phí.
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={isResendingVerify}
                      onClick={handleResendVerification}
                      className="shrink-0 rounded-xl bg-sky-600 hover:bg-sky-700 text-white px-3 py-1.5 font-bold transition cursor-pointer disabled:opacity-50"
                    >
                      {isResendingVerify ? 'Đang gửi...' : 'Gửi lại Email xác thực'}
                    </button>
                  </div>
                )}
              </div>

              {/* 1. TOP PROMO BANNER: Bật tìm việc cho CV */}
              <div className="relative overflow-hidden rounded-3xl border border-blue-200/80 bg-gradient-to-r from-blue-500/10 via-indigo-500/5 to-white p-5 sm:p-6 shadow-sm dark:border-blue-900/50 dark:from-blue-950/40 dark:to-slate-900 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="max-w-md">
                  <h3 className="text-base sm:text-lg font-extrabold text-blue-700 dark:text-blue-400">
                    {t('cv.promoBannerTitle', 'Bật tìm việc cho CV')}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                    {t(
                      'cv.promoBannerDesc',
                      'CV của bạn vừa mới được cập nhật. Hãy Bật tìm việc để CV nổi bật hơn trong Danh sách tìm kiếm của Nhà tuyển dụng.',
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => setJobSeekingActive(true)}
                    className="mt-3.5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs sm:text-sm font-extrabold text-white shadow-md shadow-primary/20 hover:bg-primary-dark transition cursor-pointer"
                  >
                    <span>{t('cv.turnOnSeekingBtn', 'Bật tìm việc ngay')}</span>
                  </button>
                </div>

                {/* Hand illustration vector */}
                <div className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light">
                  <Briefcase className="h-12 w-12 text-primary animate-pulse" />
                </div>
              </div>

              {/* 2. SECTION: CV ĐÃ TẠO TRÊN TALENTPULSE */}
              <div className="rounded-3xl border border-slate-200/80 bg-white p-5 sm:p-7 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                {/* Header Row */}
                <div className="flex items-center justify-between pb-5 mb-5 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light">
                      <FileText className="h-4.5 w-4.5" />
                    </div>
                    <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                      {t('cv.createdOnTalentPulse', 'CV đã tạo trên TalentPulse')}
                    </h2>
                  </div>

                  <button
                    type="button"
                    onClick={handleCreateCvClick}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs sm:text-sm font-bold text-white shadow-md shadow-primary/20 hover:bg-primary-dark active:scale-95 transition cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                    <span>{t('cv.createCv', 'Tạo CV')}</span>
                  </button>
                </div>

                {/* Loading skeleton */}
                {loadingOnline ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {[1, 2].map((i) => (
                      <div key={i} className="animate-pulse rounded-2xl border border-slate-200 p-4 space-y-3">
                        <div className="aspect-[210/297] w-full bg-slate-200 rounded-xl dark:bg-slate-800" />
                        <div className="h-4 w-3/4 bg-slate-200 rounded dark:bg-slate-800" />
                        <div className="h-3 w-1/2 bg-slate-200 rounded dark:bg-slate-800" />
                      </div>
                    ))}
                  </div>
                ) : onlineCvs.length === 0 ? (
                  /* Empty state */
                  <div className="py-12 text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                      <FileText className="h-8 w-8" />
                    </div>
                    <h3 className="mt-3 text-sm font-bold text-slate-700 dark:text-slate-200">
                      {t('cv.noOnlineCvsTitle', 'Chưa có CV nào được tạo trên hệ thống')}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                      {t(
                        'cv.noOnlineCvsDesc',
                        'Bấm vào nút "+ Tạo CV" ở góc trên để chọn mẫu thiết kế và bắt đầu tạo hồ sơ chuyên nghiệp.',
                      )}
                    </p>
                  </div>
                ) : (
                  /* CV Cards Grid */
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {onlineCvs.map((cv) => (
                      <motion.div
                        key={cv._id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        onClick={() => handleCardClick(cv)}
                        className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm hover:border-primary/50 hover:shadow-xl transition-all cursor-pointer dark:border-slate-800 dark:bg-slate-900"
                      >
                        {/* CV Miniature Canvas Thumbnail Container */}
                        <div className="relative aspect-[210/297] w-full overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800">
                          {/* Top Right Star Badge: Gold only when isPrimary === true, otherwise elegant subtle icon */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!cv.isPrimary) {
                                void handleSetPrimaryOnlineCv(cv._id, e);
                              }
                            }}
                            title={cv.isPrimary ? 'CV chính (Đang áp dụng)' : 'Bấm để đặt làm CV chính'}
                            className={`absolute top-2.5 right-2.5 z-10 flex h-7.5 w-7.5 items-center justify-center rounded-full transition-all duration-200 ${
                              cv.isPrimary
                                ? 'bg-gradient-to-tr from-amber-400 to-amber-500 text-white shadow-md shadow-amber-500/30 ring-2 ring-white dark:ring-slate-900 cursor-default scale-105'
                                : 'bg-slate-900/35 hover:bg-slate-900/60 text-slate-300 hover:text-amber-400 backdrop-blur-md border border-white/25 hover:border-amber-400/40 hover:scale-110 active:scale-95 cursor-pointer shadow-xs'
                            }`}
                          >
                            <Star
                              className={`h-4 w-4 transition-transform ${
                                cv.isPrimary
                                  ? 'fill-white text-white drop-shadow-xs'
                                  : 'text-white/80 hover:text-amber-300 hover:fill-amber-300'
                              }`}
                            />
                          </button>

                          {/* Render Mini Snapshot */}
                          <div className="pointer-events-none absolute inset-0 flex justify-center overflow-hidden">
                            <div className="w-[210mm] scale-[0.38] origin-top">
                              <CVPreviewCanvas
                                data={cv}
                                fontFamilyId={cv.templateType === 'template1' ? 'times' : 'inter'}
                                themeColorId="primary-blue"
                                isPremium={true}
                              />
                            </div>
                          </div>

                          {/* Hover Overlay: Subtle Dim with 3 Pill Buttons at bottom */}
                          <div className="absolute inset-0 flex flex-col justify-end p-3 bg-slate-900/20 opacity-0 backdrop-blur-[0.5px] transition-all duration-200 group-hover:opacity-100">
                            <div className="flex items-center justify-center gap-2">
                              {/* 1. Tải về button */}
                              <button
                                type="button"
                                disabled={downloadingCvId === cv._id}
                                onClick={(e) => void handleDownloadCvClick(cv, e)}
                                className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-bold text-slate-800 shadow-lg hover:bg-slate-50 hover:text-primary active:scale-95 transition border border-slate-200/80 cursor-pointer disabled:opacity-60"
                                title="Tải file PDF về máy"
                              >
                                <Download
                                  className={`h-3.5 w-3.5 text-slate-700 ${
                                    downloadingCvId === cv._id ? 'animate-bounce text-primary' : ''
                                  }`}
                                />
                                <span>{downloadingCvId === cv._id ? 'Đang tải...' : 'Tải về'}</span>
                              </button>

                              {/* 2. Chỉnh sửa button */}
                              <button
                                type="button"
                                onClick={(e) => handleEditCvClick(cv._id, e)}
                                className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-bold text-slate-800 shadow-lg hover:bg-slate-50 hover:text-primary active:scale-95 transition border border-slate-200/80 cursor-pointer"
                                title="Chỉnh sửa CV"
                              >
                                <Edit3 className="h-3.5 w-3.5 text-slate-700" />
                                <span>Chỉnh sửa</span>
                              </button>

                              {/* 3. More options (3 dots) */}
                              <div className="relative">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveMenuCvId((prev) => (prev === cv._id ? null : cv._id));
                                  }}
                                  className="flex h-7.5 w-7.5 items-center justify-center rounded-full bg-white text-slate-700 shadow-lg hover:bg-slate-50 hover:text-primary active:scale-95 transition border border-slate-200/80 cursor-pointer"
                                  title="Tùy chọn khác"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </button>

                                {activeMenuCvId === cv._id && (
                                  <div
                                    onClick={(e) => e.stopPropagation()}
                                    className="absolute right-0 bottom-full mb-2 w-36 rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-800 dark:bg-slate-900 z-30"
                                  >
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveMenuCvId(null);
                                        handleCardClick(cv);
                                      }}
                                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                                    >
                                      <Eye className="h-3.5 w-3.5 text-primary" />
                                      <span>Xem PDF</span>
                                    </button>
                                    {!cv.isPrimary && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setActiveMenuCvId(null);
                                          void handleSetPrimaryOnlineCv(cv._id, e);
                                        }}
                                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/40 cursor-pointer"
                                      >
                                        <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                                        <span>Đặt làm CV chính</span>
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveMenuCvId(null);
                                        void handleDeleteOnlineCv(cv._id, e);
                                      }}
                                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                      <span>Xóa CV</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Card Info Details */}
                        <div className="mt-3.5 flex flex-col flex-1 justify-between">
                          <div>
                            <h4 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white truncate group-hover:text-primary transition-colors">
                              CV - {cv.fullName} {cv.position ? `- ${cv.position}` : ''}
                            </h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                              {t('cv.updatedOn', 'Cập nhật')}{' '}
                              {formatDate(cv.updatedAt || cv.createdAt)}
                            </p>
                          </div>

                          {/* Switch: Cho phép NTD tìm kiếm (iOS Style Royal Blue) */}
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleToggleOnlineCvSearchable(
                                cv._id,
                                searchableMap[cv._id] ?? cv.isSearchable ?? true,
                              );
                            }}
                            className="mt-3 pt-1 flex items-center gap-2.5 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 cursor-pointer select-none"
                          >
                            <ToggleSwitch
                              checked={searchableMap[cv._id] ?? cv.isSearchable ?? true}
                              onChange={() =>
                                void handleToggleOnlineCvSearchable(
                                  cv._id,
                                  searchableMap[cv._id] ?? cv.isSearchable ?? true,
                                )
                              }
                            />
                            <span>{t('cv.allowRecruiterSearch', 'Cho phép NTD tìm kiếm')}</span>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>

              {/* 3. SECTION: CV ĐÃ TẢI LÊN TALENTPULSE */}
              <div
                id="upload-cv-section"
                ref={uploadSectionRef}
                className={`rounded-3xl border bg-white p-5 sm:p-7 shadow-xs dark:bg-slate-900 transition-all duration-500 ${
                  isUploadHighlighted
                    ? 'border-primary ring-4 ring-primary/20 shadow-lg shadow-primary/10 dark:border-primary-light dark:ring-primary-light/25'
                    : 'border-slate-200/80 dark:border-slate-800'
                }`}
              >
                {/* Header Row */}
                <div className="flex items-center justify-between pb-5 mb-5 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light">
                      <FileUp className="h-4.5 w-4.5" />
                    </div>
                    <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                      {t('cv.uploadedToTalentPulse', 'CV đã tải lên TalentPulse')}
                    </h2>
                  </div>

                  {/* Upload button with hidden file input */}
                  <div>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileSelect}
                      accept=".pdf,.docx,.doc"
                      className="hidden"
                    />
                    <button
                      type="button"
                      disabled={isUploading}
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs sm:text-sm font-bold text-white shadow-md shadow-primary/20 hover:bg-primary-dark active:scale-95 transition cursor-pointer disabled:opacity-50"
                    >
                      <Upload className="h-4 w-4" />
                      <span>{isUploading ? t('cv.uploading', 'Đang tải lên...') : t('cv.uploadCvBtn', 'Tải CV lên')}</span>
                    </button>
                  </div>
                </div>

                {uploadError && (
                  <div className="mb-4 rounded-xl bg-red-50 p-3 text-xs text-red-600 border border-red-200 dark:bg-red-950/40 dark:border-red-900">
                    {uploadError}
                  </div>
                )}

                {/* Uploaded CVs list or Empty State */}
                {loadingUploaded ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    {t('cv.uploading', 'Đang tải lên...')}
                  </div>
                ) : uploadedCvs.length === 0 ? (
                  /* Empty state matching image 2 */
                  <div className="py-12 text-center">
                    <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                      <Upload className="h-10 w-10 text-slate-300 dark:text-slate-600" />
                    </div>
                    <p className="mt-3 text-xs font-semibold text-slate-400 dark:text-slate-500">
                      {t('cv.noUploadedCvsTitle', 'Chưa có CV nào được tải lên.')}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {t('cv.uploadHint', 'Hỗ trợ định dạng .pdf hoặc .docx (tối đa 5MB)')}
                    </p>
                  </div>
                ) : (
                    <div className="space-y-3">
                    {uploadedCvs.map((item) => (
                      <div
                        key={item._id}
                        className="p-4 rounded-2xl border border-slate-200/80 bg-slate-50/50 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-800/40 transition"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold text-xs uppercase">
                              {item.fileType || 'PDF'}
                            </div>
                            <div className="min-w-0">
                              <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                                {item.title || 'CV đã tải lên'}
                              </h4>
                              <p className="text-[11px] text-slate-400">
                                {t('cv.uploadedOnDate', 'Tải lên ngày')}{' '}
                                {formatDate(item.createdAt)}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!item.isPrimary) {
                                  void handleSetPrimaryUploadedCv(item._id, e);
                                }
                              }}
                              title={item.isPrimary ? 'CV chính (Đang áp dụng)' : 'Bấm để đặt làm CV chính'}
                              className={`flex h-8.5 items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition-all ${
                                item.isPrimary
                                  ? 'bg-amber-500/15 border border-amber-500/40 text-amber-700 dark:text-amber-300'
                                  : 'border border-slate-200 bg-white text-slate-500 hover:text-amber-500 hover:border-amber-400/50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 cursor-pointer'
                              }`}
                            >
                              <Star
                                className={`h-3.5 w-3.5 ${
                                  item.isPrimary
                                    ? 'fill-amber-500 text-amber-500'
                                    : 'text-slate-400 hover:text-amber-500'
                                }`}
                              />
                              <span>{item.isPrimary ? 'CV chính' : 'Đặt làm chính'}</span>
                            </button>
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex h-8.5 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:text-primary dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 transition"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              <span>{t('cv.viewFile', 'Xem')}</span>
                            </a>
                            <button
                              type="button"
                              onClick={() => void handleDeleteUploadedCv(item._id)}
                              className="flex h-8.5 w-8.5 items-center justify-center rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50 transition cursor-pointer"
                              title="Xóa CV"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        {/* Switch: Cho phép NTD tìm kiếm */}
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleToggleUploadedCvSearchable(
                              item._id,
                              searchableMap[item._id] ?? item.isSearchable ?? true,
                            );
                          }}
                          className="mt-3 pt-2.5 border-t border-slate-200/70 dark:border-slate-800/80 flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer select-none"
                        >
                          <span className="flex items-center gap-2">
                            <ToggleSwitch
                              checked={searchableMap[item._id] ?? item.isSearchable ?? true}
                              onChange={() =>
                                void handleToggleUploadedCvSearchable(
                                  item._id,
                                  searchableMap[item._id] ?? item.isSearchable ?? true,
                                )
                              }
                            />
                            <span>{t('cv.allowRecruiterSearch', 'Cho phép NTD tìm kiếm CV này')}</span>
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {(searchableMap[item._id] ?? item.isSearchable ?? true)
                              ? 'Đang bật'
                              : 'Đã tắt'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 4. SECTION: VIỆC LÀM PHÙ HỢP VỚI BẠN */}
              <div className="rounded-3xl border border-slate-200/80 bg-white p-5 sm:p-7 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <div className="pb-4 mb-4 border-b border-slate-100 dark:border-slate-800">
                  <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                    {t('cv.matchingJobsTitle', 'Việc làm phù hợp với bạn')}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {t('cv.jobAlertsHint', 'Để nhận được gợi ý việc làm chính xác hơn, hãy')}{' '}
                    <Link to="/job-alerts" className="text-primary hover:underline font-bold">
                      {t('cv.jobAlertsLink', 'tùy chỉnh cài đặt gợi ý việc làm')}
                    </Link>
                    .
                  </p>
                </div>

                <div className="space-y-4">
                  {recommendedJobs.map((job) => (
                    <div
                      key={job.id}
                      className="p-4 rounded-2xl border border-slate-200/80 bg-white hover:border-primary/40 hover:shadow-md transition dark:border-slate-800 dark:bg-slate-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                    >
                      <div className="flex items-start gap-3.5 min-w-0">
                        <img
                          src={job.logo}
                          alt={job.company}
                          className="h-12 w-12 rounded-xl object-cover border border-slate-200 shrink-0"
                        />
                        <div className="min-w-0">
                          {job.isHot && (
                            <span className="inline-block rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-extrabold text-amber-600 dark:bg-amber-500/20 mb-1">
                              {t('cv.featuredBadge', '✨ Nổi bật')}
                            </span>
                          )}
                          <h4 className="font-extrabold text-xs sm:text-sm text-slate-900 dark:text-white leading-snug hover:text-primary transition-colors cursor-pointer">
                            {job.title}
                          </h4>
                          <p className="text-xs text-slate-500 mt-0.5 font-medium">{job.company}</p>
                          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 mt-2">
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3 text-slate-400" />
                              {job.location}
                            </span>
                            <span>&bull;</span>
                            <span className="text-primary font-semibold">{job.deadline}</span>
                            <span>&bull;</span>
                            <span>{job.updatedAt}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-3 shrink-0">
                        <span className="font-bold text-xs sm:text-sm text-primary">
                          💰 {job.salary}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="rounded-xl bg-primary px-4 py-2 text-xs font-extrabold text-white shadow-xs hover:bg-primary-dark transition cursor-pointer"
                          >
                            {t('cv.applyNow', 'Ứng tuyển')}
                          </button>
                          <button
                            type="button"
                            className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:text-red-500 dark:border-slate-700 cursor-pointer"
                          >
                            <Bookmark className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ================= RIGHT SIDEBAR COLUMN (4 cols / ~30%) ================= */}
            <div className="lg:col-span-4 space-y-6">
              {/* 1. USER PROFILE CARD */}
              <div className="rounded-3xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900 text-center">
                <div className="flex justify-center mb-3">
                  <UserAvatar
                    src={user?.avatar}
                    alt={user?.name}
                    size="xl"
                    className="border-2 border-primary/20 shadow-md"
                  />
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('cv.welcomeBack', 'Chào bạn trở lại,')}
                </p>
                <div className="flex items-center justify-center gap-1.5 mt-0.5">
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                    {user?.name || 'Người dùng TalentPulse'}
                  </h3>
                  {user?.isPremium ? (
                    <span title="Candidate Premium" className="text-amber-500">
                      👑
                    </span>
                  ) : user?.isVerified ? (
                    <span title="Đã Xác Thực">
                      <ShieldCheck className="h-4.5 w-4.5 text-sky-500 fill-sky-500 text-white" />
                    </span>
                  ) : null}
                </div>

                <div className="mt-2 flex flex-col items-center gap-1.5 w-full">
                  {user?.isPremium ? (
                    <>
                      <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-3.5 py-1 text-amber-700 dark:text-amber-300 font-extrabold flex items-center gap-1.5 text-xs shadow-xs">
                        <Crown className="h-3.5 w-3.5 text-amber-500" /> Candidate Premium
                      </span>
                      {user.premiumExpiresAt && (() => {
                        const exp = parseDate(user.premiumExpiresAt);
                        if (!exp) return null;
                        const now = new Date();
                        const diffDays = Math.max(0, Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
                        const formatted = formatDate(exp);
                        return (
                          <div className="w-full mt-2 p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-center space-y-1">
                            <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-amber-900 dark:text-amber-300">
                              <Clock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                              <span>Hạn dùng: {formatted}</span>
                            </div>
                            <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                              {diffDays > 0 ? `⏳ Còn lại ${diffDays} ngày hiệu lực` : '⚠️ Hết hạn hôm nay'}
                            </p>
                          </div>
                        );
                      })()}
                    </>
                  ) : user?.isVerified ? (
                    <span className="rounded-full bg-sky-500/15 border border-sky-500/30 px-3 py-1 text-sky-700 dark:text-sky-300 font-extrabold flex items-center gap-1 text-xs">
                      <ShieldCheck className="h-3.5 w-3.5 text-sky-600" /> Đã Xác Thực
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1 text-slate-600 dark:text-slate-400 font-medium text-xs">
                      Tài khoản Thường
                    </span>
                  )}
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <Link
                    to="/premium"
                    className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition cursor-pointer ${
                      user?.isPremium
                        ? 'bg-amber-50 hover:bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                        : 'bg-slate-100 hover:bg-amber-50 hover:text-amber-600 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                    }`}
                  >
                    <Crown className="h-3.5 w-3.5 text-amber-500" />
                    <span>
                      {user?.isPremium
                        ? 'Gia hạn / Quyền lợi Premium'
                        : t('cv.upgradeAccount', 'Nâng cấp tài khoản Premium')}
                    </span>
                  </Link>
                </div>
              </div>

              {/* 1.5. PROFILE BOOST (ĐẨY TOP HỒ SƠ) WIDGET */}
              <div className="rounded-3xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400">
                      <Rocket className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">
                        Đẩy Top Hồ Sơ Với NTD
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Ưu tiên hiển thị Top đầu khi Nhà Tuyển Dụng tìm kiếm CV
                      </p>
                    </div>
                  </div>
                </div>

                {/* Status Box */}
                {boostStatus?.isBoosted ? (
                  <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/25 p-4 text-xs space-y-2">
                    <div className="flex items-center gap-2 font-black text-emerald-700 dark:text-emerald-400">
                      <Zap className="h-4 w-4" />
                      <span>HỒ SƠ ĐANG ĐƯỢC ĐẨY TOP 1!</span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300">
                      Hồ sơ và CV của bạn đang được ghim ở vị trí ưu tiên cao nhất trong bộ lọc tìm kiếm của các nhà tuyển dụng.
                    </p>
                    {boostStatus.boostExpiresAt && (
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                        Hiệu lực đến: {formatDateTime(boostStatus.boostExpiresAt)}
                      </p>
                    )}
                  </div>
                ) : boostStatus?.canBoost ? (
                  <div className="rounded-2xl bg-indigo-500/10 border border-indigo-500/20 p-4 text-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-indigo-900 dark:text-indigo-200">
                        Lượt đẩy Top khả dụng:
                      </span>
                      <span className="rounded-full bg-indigo-600 text-white px-2.5 py-0.5 text-[10px] font-black">
                        Sẵn sàng 🚀
                      </span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 text-[11px]">
                      Hạn mức: <strong>{boostStatus.boostLimitText}</strong>. Nhấn nút bên dưới để ghim hồ sơ của bạn lên đầu kết quả tìm kiếm ngay lập tức!
                    </p>
                    <button
                      type="button"
                      disabled={isBoosting}
                      onClick={handleBoostProfile}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-primary hover:from-indigo-700 hover:to-primary-dark px-4 py-2.5 font-extrabold text-white text-xs shadow-md shadow-indigo-500/20 active:scale-98 transition cursor-pointer disabled:opacity-50"
                    >
                      <Rocket className="h-4 w-4" />
                      <span>{isBoosting ? 'Đang kích hoạt...' : 'Kích Hoạt Đẩy Top 1 Ngay'}</span>
                    </button>
                  </div>
                ) : boostStatus?.remainingCooldownSeconds ? (
                  <div className="rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 p-4 text-xs space-y-2">
                    <div className="flex items-center gap-2 font-bold text-slate-700 dark:text-slate-300">
                      <Clock className="h-4 w-4 text-slate-400" />
                      <span>Thời Gian Hồi Chiêu Đẩy Top:</span>
                    </div>
                    <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                      Bạn đã sử dụng lượt đẩy top gần đây. Lượt tiếp theo sẽ mở sau:
                    </p>
                    <div className="rounded-xl bg-white dark:bg-slate-900 p-2.5 text-center font-black text-primary text-xs border border-slate-200 dark:border-slate-700">
                      ⏳ Còn lại: {boostStatus.remainingCooldownText}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl bg-amber-500/10 border border-amber-500/20 p-4 text-xs space-y-3">
                    <div className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-300">
                      <AlertCircle className="h-4 w-4 text-amber-600" />
                      <span>Chưa Kích Hoạt Tính Năng</span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
                      Để sử dụng quyền Đẩy Top hồ sơ lên đầu tìm kiếm NTD, bạn cần:
                    </p>
                    <div className="space-y-1.5 text-[11px]">
                      <div className="flex items-center gap-1.5 text-sky-700 dark:text-sky-300">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        <span><strong>Xác thực Email:</strong> Được 1 lần đẩy Top / tuần</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
                        <Crown className="h-3.5 w-3.5" />
                        <span><strong>Candidate Premium:</strong> Được 1 lần đẩy Top / ngày (24/7)</span>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      {!user?.isVerified && (
                        <button
                          type="button"
                          disabled={isResendingVerify}
                          onClick={handleResendVerification}
                          className="flex-1 rounded-xl bg-sky-600 hover:bg-sky-700 text-white py-2 text-[11px] font-bold transition cursor-pointer disabled:opacity-50 text-center"
                        >
                          Xác thực Email
                        </button>
                      )}
                      <Link
                        to="/premium"
                        className="flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white py-2 text-[11px] font-bold text-center transition cursor-pointer"
                      >
                        Nâng Cấp Premium
                      </Link>
                    </div>
                  </div>
                )}
              </div>

              {/* 2. JOB SEARCHING STATUS WIDGET */}
              <div className="rounded-3xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-4">
                {/* Gợi ý việc làm toggle */}
                <div
                  onClick={() => void handleToggleJobRecommendation(!jobRecommendationActive)}
                  className="flex items-center justify-between cursor-pointer select-none"
                >
                  <span className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-200">
                    {t('cv.jobRecommendation', 'Gợi ý việc làm')}
                  </span>
                  <ToggleSwitch
                    checked={jobRecommendationActive}
                    onChange={(val) => void handleToggleJobRecommendation(val)}
                  />
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
                  <div
                    onClick={() => void handleToggleJobSeeking(!jobSeekingActive)}
                    className="flex items-center justify-between cursor-pointer select-none"
                  >
                    <span className="font-bold text-xs sm:text-sm text-primary dark:text-primary-light">
                      {jobSeekingActive
                        ? t('cv.jobSeekingStatusOn', 'Trạng thái tìm việc đang bật')
                        : 'Trạng thái tìm việc đang tắt'}
                    </span>
                    <ToggleSwitch
                      checked={jobSeekingActive}
                      onChange={(val) => void handleToggleJobSeeking(val)}
                    />
                  </div>

                  <p className="text-[11.5px] text-slate-500 leading-relaxed">
                    {t(
                      'cv.jobSeekingNotice',
                      'Trạng thái Bật tìm việc giúp hồ sơ của bạn được đề xuất và hiển thị với các Nhà Tuyển Dụng đang tìm kiếm nhân sự.',
                    )}
                  </p>

                  <div className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5 text-xs text-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                    <span className="flex items-center gap-1.5 font-bold">
                      <FileText className="h-3.5 w-3.5 text-primary" />
                      <span>
                        {onlineCvs.filter((c) => searchableMap[c._id] ?? c.isSearchable ?? true).length +
                          uploadedCvs.filter((c) => searchableMap[c._id] ?? c.isSearchable ?? true).length}{' '}
                        {t('cv.cvsSelectedCount', 'CV đang được bật tìm kiếm')}
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              {/* 3. RECRUITER SEARCH PERMISSION WIDGET */}
              <div className="rounded-3xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-xs sm:text-sm text-slate-900 dark:text-white">
                    {t('cv.allowRecruiterSearchTitle', 'Cho phép NTD tìm kiếm hồ sơ')}
                  </h4>
                  <ToggleSwitch
                    checked={allowRecruiterSearchActive}
                    onChange={(val) => void handleToggleAllowRecruiterSearch(val)}
                  />
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {t('cv.allowRecruiterSearchCountPrefix', 'Có')}{' '}
                  <b>
                    {onlineCvs.filter((c) => searchableMap[c._id] ?? c.isSearchable ?? true).length +
                      uploadedCvs.filter((c) => searchableMap[c._id] ?? c.isSearchable ?? true).length}
                  </b>{' '}
                  {t('cv.allowRecruiterSearchCountSuffix', 'CV đang bật cho phép NTD tìm kiếm.')}
                </p>

                <p className="text-[11px] text-slate-400 leading-relaxed pt-1">
                  {t(
                    'cv.allowRecruiterSearchDesc',
                    'Khi bạn cho phép Nhà tuyển dụng (NTD) tìm kiếm hồ sơ, chỉ những CV bạn BẬT quyền tìm kiếm mới được hiển thị trong công cụ tìm kiếm và được đẩy Top.',
                  )}
                </p>
              </div>

              {/* 4. APP PROMO & ORIENTATION BANNER (Matching Image 1) */}
              <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 p-5 sm:p-6 text-white shadow-xl space-y-4">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-xl bg-primary flex items-center justify-center font-black text-sm">
                    TP
                  </div>
                  <div>
                    <h4 className="font-extrabold text-sm">
                      {t('cv.downloadAppTitle', 'Tải App TalentPulse ngay!')}
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      {t('cv.downloadAppDesc', 'Để không bỏ lỡ bất cứ cơ hội nào từ NTD')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-center p-3 bg-white rounded-2xl">
                  <QrCode className="h-28 w-28 text-slate-900" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />

      {/* Mobile restriction notice modal */}
      <MobileNoticeModal
        isOpen={isMobileNoticeOpen}
        onClose={() => setIsMobileNoticeOpen(false)}
      />

      {/* Download Options Modal (Free with Watermark vs Premium) */}
      <DownloadCVModal
        isOpen={downloadModalOpen}
        onClose={() => setDownloadModalOpen(false)}
        cv={selectedCvForDownload}
        onDownload={handleDownloadWithModal}
        isUserPremium={user?.role === 'USER' && !!(user as any)?.candidateSubscription}
      />
    </div>
  );
}
