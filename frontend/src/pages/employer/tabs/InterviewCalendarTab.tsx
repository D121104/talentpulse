import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  Video,
  MapPin,
  User,
  CheckCircle2,
  Send,
  RefreshCw,
  X,
} from 'lucide-react';
import {
  employerApi,
  InterviewRoundItem,
  ApplicationItem,
} from '../../../lib/employerApi';
import { useToast } from '../../../context/ToastContext';
import { useNavigate } from 'react-router-dom';

interface InterviewCalendarTabProps {
  company: any;
  hasCompany: boolean;
  accessToken: string;
  onNavigateTab?: (tab: string, extraData?: any) => void;
}

// Hours matrix: 07:00 to 23:00 (matches reference matrix)
const TIME_SLOTS = Array.from({ length: 17 }, (_, i) => {
  const hour = i + 7;
  return `${hour.toString().padStart(2, '0')}:00`;
});

const DAY_NAMES = [
  'Thứ 2',
  'Thứ 3',
  'Thứ 4',
  'Thứ 5',
  'Thứ 6',
  'Thứ 7',
  'Chủ Nhật',
];

export function InterviewCalendarTab({
  company: _company,
  hasCompany,
  accessToken,
  onNavigateTab: _onNavigateTab,
}: InterviewCalendarTabProps) {
  const { success, error, info } = useToast();
  const navigate = useNavigate();

  // Current selected reference date (start of week: Monday)
  const [currentDate, setCurrentDate] = useState<Date>(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  });

  const [rounds, setRounds] = useState<InterviewRoundItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'PENDING' | 'COMPLETED'>('ALL');

  // Modal states
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [selectedRound, setSelectedRound] = useState<InterviewRoundItem | null>(null);
  const [isSendingInvite, setIsSendingInvite] = useState(false);

  // New interview form state
  const [candidatesList, setCandidatesList] = useState<ApplicationItem[]>([]);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const [selectedAppId, setSelectedAppId] = useState('');
  const [title, setTitle] = useState('');
  const [roundType, setRoundType] = useState<'TECHNICAL' | 'HR' | 'CULTURE' | 'FINAL'>('TECHNICAL');
  const [scheduleDate, setScheduleDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [isOnline, setIsOnline] = useState(true);
  const [location, setLocation] = useState('Trực tuyến qua TalentPulse Meeting');
  const [notes, setNotes] = useState('');
  const [sendEmailInvite, setSendEmailInvite] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Calculate the 7 days of current week
  const weekDays = useMemo(() => {
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(currentDate);
      d.setDate(currentDate.getDate() + i);
      days.push(d);
    }
    return days;
  }, [currentDate]);

  const startDateStr = useMemo(() => {
    const d = new Date(weekDays[0]);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, [weekDays]);

  const endDateStr = useMemo(() => {
    const d = new Date(weekDays[6]);
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
  }, [weekDays]);

  // Fetch interviews for current week
  const fetchCalendar = useCallback(async () => {
    if (!accessToken || !hasCompany) return;
    setIsLoading(true);
    try {
      const data = await employerApi.getCalendarInterviews(
        { startDate: startDateStr, endDate: endDateStr },
        accessToken,
      );
      setRounds(data || []);
    } catch (err: any) {
      console.error('Lỗi khi tải dữ liệu lịch phỏng vấn', err);
      error(err?.message || 'Không thể tải lịch phỏng vấn');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, hasCompany, startDateStr, endDateStr, error]);

  useEffect(() => {
    void fetchCalendar();
  }, [fetchCalendar]);

  // Fetch candidates available for scheduling
  const fetchCandidates = useCallback(async () => {
    if (!accessToken || !hasCompany) return;
    setIsLoadingCandidates(true);
    try {
      const res = await employerApi.getApplicationsByCompany(
        { current: 1, pageSize: 100 },
        accessToken,
      );
      const apps = res?.result || [];
      // Candidates suitable for interview (PENDING, REVIEWING, CONSIDERING, INTERVIEWING)
      const valid = apps.filter((a: ApplicationItem) => a.status !== 'WITHDRAWN' && a.status !== 'REJECTED');
      setCandidatesList(valid);
    } catch (err) {
      console.error('Lỗi khi tải danh sách ứng viên', err);
    } finally {
      setIsLoadingCandidates(false);
    }
  }, [accessToken, hasCompany]);

  const handleOpenScheduleModal = (prefillDate?: string, prefillTime?: string) => {
    if (prefillDate) setScheduleDate(prefillDate);
    if (prefillTime) {
      setStartTime(prefillTime);
      const [h, m] = prefillTime.split(':').map(Number);
      const endHour = (h + 1).toString().padStart(2, '0');
      setEndTime(`${endHour}:${m.toString().padStart(2, '0')}`);
    }
    setIsScheduleModalOpen(true);
    void fetchCandidates();
  };

  // Week navigation
  const handlePrevWeek = () => {
    const prev = new Date(currentDate);
    prev.setDate(currentDate.getDate() - 7);
    setCurrentDate(prev);
  };

  const handleNextWeek = () => {
    const next = new Date(currentDate);
    next.setDate(currentDate.getDate() + 7);
    setCurrentDate(next);
  };

  const handleToday = () => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    setCurrentDate(monday);
  };

  // Filtered rounds based on active/pending/completed toggle
  const filteredRounds = useMemo(() => {
    if (statusFilter === 'ACTIVE') {
      return rounds.filter(
        (r) => r.status === 'CONFIRMED' || r.status === 'IN_PROGRESS',
      );
    }
    if (statusFilter === 'PENDING') {
      return rounds.filter((r) => r.status === 'PENDING_CONFIRMATION');
    }
    if (statusFilter === 'COMPLETED') {
      return rounds.filter((r) => r.status === 'COMPLETED');
    }
    return rounds;
  }, [rounds, statusFilter]);

  // Group rounds by day index (0 = Monday, ..., 6 = Sunday)
  const roundsByDay = useMemo(() => {
    const map: { [dayIndex: number]: InterviewRoundItem[] } = {
      0: [],
      1: [],
      2: [],
      3: [],
      4: [],
      5: [],
      6: [],
    };

    filteredRounds.forEach((round) => {
      const scheduled = new Date(round.scheduledAt);

      // Check if within the selected week range
      const roundDateStr = scheduled.toDateString();
      const matchedIndex = weekDays.findIndex((w) => w.toDateString() === roundDateStr);
      if (matchedIndex !== -1) {
        map[matchedIndex].push(round);
      }
    });

    return map;
  }, [filteredRounds, weekDays]);

  // Submit new interview
  const handleCreateInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAppId) {
      info('Vui lòng chọn ứng viên');
      return;
    }
    if (!title.trim()) {
      info('Vui lòng nhập tiêu đề buổi phỏng vấn');
      return;
    }

    const start = new Date(`${scheduleDate}T${startTime}:00`);
    const end = new Date(`${scheduleDate}T${endTime}:00`);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      info('Thời gian phỏng vấn không hợp lệ');
      return;
    }

    const durationMs = end.getTime() - start.getTime();
    if (durationMs < 60 * 60 * 1000) {
      error('Thời lượng mỗi buổi phỏng vấn tối thiểu là 1 giờ (60 phút)');
      return;
    }

    setIsSubmitting(true);
    try {
      await employerApi.createInterviewRound(
        {
          applicationId: selectedAppId,
          title: title.trim(),
          roundType,
          scheduledAt: start.toISOString(),
          scheduledEndAt: end.toISOString(),
          isOnline,
          location: isOnline ? 'Trực tuyến qua TalentPulse Meeting' : location.trim(),
          notes: notes.trim() || undefined,
          sendEmailInvite,
        },
        accessToken,
      );

      success('Đã tạo lịch phỏng vấn và gửi thông báo xác nhận tới ứng viên');
      setIsScheduleModalOpen(false);
      // Reset form
      setTitle('');
      setSelectedAppId('');
      setNotes('');
      void fetchCalendar();
    } catch (err: any) {
      console.error('Lỗi khi tạo lịch phỏng vấn', err);
      error(err?.message || 'Không thể tạo lịch phỏng vấn');
    } finally {
      setIsSubmitting(false);
    }
  };

  // HR manually sends online invite when interview time arrives
  const handleSendOnlineInvite = async (round: InterviewRoundItem) => {
    setIsSendingInvite(true);
    try {
      await employerApi.sendOnlineInterviewInvite(
        round._id,
        'HR đã mở phòng phỏng vấn. Vui lòng tham gia ngay.',
        accessToken,
      );
      success('Đã gửi thông báo mời ứng viên tham gia phòng phỏng vấn trực tuyến');
      void fetchCalendar();
      if (selectedRound && selectedRound._id === round._id) {
        setSelectedRound((prev) => (prev ? { ...prev, status: 'IN_PROGRESS' } : null));
      }
    } catch (err: any) {
      error(err?.message || 'Không thể gửi lời mời trực tuyến');
    } finally {
      setIsSendingInvite(false);
    }
  };

  // Join meeting room
  const handleJoinMeeting = (roomId: string) => {
    navigate(`/interview-room/${roomId}`);
  };

  // Active statistics summary
  const activeCount = useMemo(
    () =>
      rounds.filter(
        (r) => r.status === 'CONFIRMED' || r.status === 'IN_PROGRESS',
      ).length,
    [rounds],
  );

  const pendingCount = useMemo(
    () => rounds.filter((r) => r.status === 'PENDING_CONFIRMATION').length,
    [rounds],
  );

  const completedCount = useMemo(
    () => rounds.filter((r) => r.status === 'COMPLETED').length,
    [rounds],
  );

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary dark:bg-primary/20">
              <CalendarIcon className="h-5 w-5 text-primary" />
            </span>
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">
              Lịch phỏng vấn tuyển dụng
            </h1>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Hiển thị ma trận tuần theo khung giờ 07:00 – 23:00. Lịch chỉ kích hoạt chính thức khi ứng viên xác nhận đồng ý.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Status filter buttons */}
          <div className="flex flex-wrap rounded-xl bg-slate-100 p-1 dark:bg-slate-800 gap-0.5">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                statusFilter === 'ALL'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Tất cả ({rounds.length})
            </button>
            <button
              onClick={() => setStatusFilter('ACTIVE')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                statusFilter === 'ACTIVE'
                  ? 'bg-primary text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Đã kích hoạt ({activeCount})
            </button>
            <button
              onClick={() => setStatusFilter('PENDING')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                statusFilter === 'PENDING'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Chờ xác nhận ({pendingCount})
            </button>
            <button
              onClick={() => setStatusFilter('COMPLETED')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                statusFilter === 'COMPLETED'
                  ? 'bg-slate-700 text-white shadow-xs dark:bg-slate-600'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Đã kết thúc ({completedCount})
            </button>
          </div>

          <button
            onClick={() => void fetchCalendar()}
            disabled={isLoading}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer"
            title="Tải lại lịch"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin text-primary' : ''}`} />
          </button>

          <button
            onClick={() => handleOpenScheduleModal()}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow-md shadow-primary/25 transition hover:bg-primary-dark cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Lên lịch phỏng vấn mới</span>
          </button>
        </div>
      </div>

      {/* Week Navigator Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-5 py-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevWeek}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
            title="Tuần trước"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={handleToday}
            className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-bold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
          >
            Hôm nay
          </button>
          <button
            onClick={handleNextWeek}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
            title="Tuần sau"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <span className="ml-3 text-xs font-extrabold text-slate-800 dark:text-slate-200">
            Tuần từ {weekDays[0].toLocaleDateString('vi-VN')} đến {weekDays[6].toLocaleDateString('vi-VN')}
          </span>
        </div>

        {/* Legend notes */}
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-xs border border-primary bg-blue-100 dark:bg-blue-900/60"></span>
            <span className="text-slate-600 dark:text-slate-400 font-medium">Đã kích hoạt (Active)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-xs border border-dashed border-amber-400 bg-amber-50 dark:bg-amber-950/40"></span>
            <span className="text-slate-600 dark:text-slate-400 font-medium">Chờ ứng viên xác nhận</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-xs bg-blue-600"></span>
            <span className="text-slate-600 dark:text-slate-400 font-medium">Đang diễn ra</span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* CALENDAR MATRIX TABLE                                                     */}
      {/* Layout strictly follows the reference image:                             */}
      {/* Columns: Days (Thứ 2 - Chủ Nhật), Rows: 07:00 - 23:00, Right/Left Hours  */}
      {/* ========================================================================= */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200/90 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="min-w-[1000px]">
          {/* Header Row: 7 Days */}
          <div className="grid grid-cols-[80px_repeat(7,1fr)_60px] border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/80 sticky top-0 z-10">
            {/* Top-left corner time label */}
            <div className="p-3 text-center text-xs font-extrabold text-slate-500 border-r border-slate-200 dark:border-slate-800 dark:text-slate-400">
              Giờ
            </div>

            {/* 7 Days Headers */}
            {weekDays.map((day, idx) => {
              const isToday = day.toDateString() === new Date().toDateString();
              const dateFormatted = `${day.getDate().toString().padStart(2, '0')}/${(
                day.getMonth() + 1
              )
                .toString()
                .padStart(2, '0')}`;

              return (
                <div
                  key={idx}
                  className={`p-3 text-center border-r border-slate-200 dark:border-slate-800 transition-colors ${
                    isToday
                      ? 'bg-blue-50/80 dark:bg-blue-950/30'
                      : ''
                  }`}
                >
                  <div
                    className={`text-xs font-extrabold ${
                      isToday
                        ? 'text-primary dark:text-primary-light'
                        : 'text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {DAY_NAMES[idx]}
                  </div>
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    ({dateFormatted})
                  </div>
                </div>
              );
            })}

            {/* Right-most indicator header */}
            <div className="p-3 text-center text-xs font-bold text-primary dark:text-primary-light border-l border-slate-200 dark:border-slate-800 bg-blue-50/40 dark:bg-blue-950/20">
              Giờ
            </div>
          </div>

          {/* Body: 17 Time Slots (07:00 to 23:00) */}
          <div className="relative divide-y divide-slate-100 dark:divide-slate-800/60">
            {TIME_SLOTS.map((timeSlot) => {
              const currentHour = parseInt(timeSlot.split(':')[0], 10);

              return (
                <div
                  key={timeSlot}
                  className="grid grid-cols-[80px_repeat(7,1fr)_60px] min-h-[72px]"
                >
                  {/* Left Hour Label */}
                  <div className="flex items-start justify-center p-2 text-xs font-mono font-bold text-slate-500 border-r border-slate-200/90 dark:border-slate-800 dark:text-slate-400 bg-slate-50/40 dark:bg-slate-900/40">
                    {timeSlot}
                  </div>

                  {/* 7 Columns for Days */}
                  {weekDays.map((day, dayIdx) => {
                    const dayRounds = roundsByDay[dayIdx] || [];
                    // Find rounds that start in this hour slot
                    const startingRounds = dayRounds.filter((r) => {
                      const rStart = new Date(r.scheduledAt);
                      return rStart.getHours() === currentHour;
                    });

                    const dateStr = day.toISOString().split('T')[0];

                    return (
                      <div
                        key={dayIdx}
                        onClick={(e) => {
                          // If clicking on empty cell, trigger quick schedule
                          if (e.target === e.currentTarget) {
                            handleOpenScheduleModal(dateStr, timeSlot);
                          }
                        }}
                        className="relative p-1.5 border-r border-slate-200/70 dark:border-slate-800/70 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group cursor-pointer"
                        title={`Nhấp để lên lịch lúc ${timeSlot} ${DAY_NAMES[dayIdx]}`}
                      >
                        {/* Render interview cards that start in this slot */}
                        {startingRounds.map((round) => {
                          const isCompleted = round.status === 'COMPLETED';
                          const isLive = round.status === 'IN_PROGRESS';
                          const isActive = round.status === 'CONFIRMED';
                          const isPending = round.status === 'PENDING_CONFIRMATION';

                          const startTimeFormatted = new Date(
                            round.scheduledAt,
                          ).toLocaleTimeString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          });
                          const endTimeFormatted = new Date(
                            round.scheduledEndAt,
                          ).toLocaleTimeString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          });

                          return (
                            <div
                              key={round._id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedRound(round);
                              }}
                              className={`mb-1.5 w-full rounded-xl p-2.5 transition-all duration-200 shadow-xs text-left cursor-pointer ${
                                isLive
                                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 border border-blue-500'
                                  : isCompleted
                                  ? 'bg-slate-100/90 text-slate-700 border-2 border-slate-300 dark:bg-slate-800/70 dark:text-slate-300 dark:border-slate-700 hover:border-slate-400'
                                  : isActive
                                  ? 'bg-blue-50/90 text-slate-800 border-2 border-primary/70 hover:border-primary hover:shadow-md dark:bg-blue-950/40 dark:text-slate-100 dark:border-blue-600'
                                  : isPending
                                  ? 'bg-amber-50/90 text-slate-800 border-2 border-dashed border-amber-400 hover:border-amber-500 dark:bg-amber-950/30 dark:text-slate-200 dark:border-amber-600'
                                  : 'bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400'
                              }`}
                            >
                              {/* Title & Status Badge */}
                              <div className="flex items-start justify-between gap-1">
                                <span
                                  className={`text-xs font-bold leading-tight line-clamp-1 ${
                                    isLive
                                      ? 'text-white'
                                      : isCompleted
                                      ? 'text-slate-600 dark:text-slate-300'
                                      : isActive
                                      ? 'text-primary-dark dark:text-blue-200 font-extrabold'
                                      : 'text-amber-800 dark:text-amber-300'
                                  }`}
                                >
                                  {round.title}
                                </span>
                                {isLive && (
                                  <span className="flex h-2 w-2 relative shrink-0">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                                  </span>
                                )}
                              </div>

                              {/* Candidate Name & Job */}
                              <div className="mt-1 flex items-center gap-1 text-[11px] font-medium opacity-90 truncate">
                                <User className="h-3 w-3 shrink-0" />
                                <span className="font-semibold">
                                  {round.application?.user?.name || 'Ứng viên'}
                                </span>
                                <span className="text-[10px] opacity-75 truncate">
                                  ({round.application?.job?.name || 'Vị trí'})
                                </span>
                              </div>

                              {/* Room & Interviewer (matching reference card info) */}
                              <div className="mt-1 flex items-center gap-1 text-[10px] opacity-85 truncate">
                                <MapPin className="h-3 w-3 shrink-0" />
                                <span className="truncate">
                                  {round.isOnline ? 'Online TalentPulse' : round.location || 'Tại văn phòng'}
                                </span>
                              </div>

                              {/* Time Range Badge (matches reference image: 🕒 07:00 -> 08:50) */}
                              <div className="mt-1.5 flex items-center justify-between pt-1 border-t border-current/15 text-[10px] font-mono">
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  <span>{startTimeFormatted} → {endTimeFormatted}</span>
                                </span>

                                <span
                                  className={`px-1.5 py-0.5 rounded-xs text-[9px] font-extrabold uppercase ${
                                    isLive
                                      ? 'bg-white text-blue-700'
                                      : isCompleted
                                      ? 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                                      : isActive
                                      ? 'bg-primary/10 text-primary dark:bg-blue-900 dark:text-blue-200'
                                      : 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
                                  }`}
                                >
                                  {isLive ? 'Trực tiếp' : isCompleted ? 'Đã kết thúc' : isActive ? 'Active' : 'Chờ xác nhận'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}

                  {/* Right-most Hour Badge (Synchronized with TalentPulse Blue Brand) */}
                  <div className="flex items-center justify-center p-2 text-xs font-mono font-bold text-white bg-primary dark:bg-blue-600 border-l border-primary-dark/20 transition-colors">
                    {timeSlot}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* DETAIL MODAL FOR SELECTED INTERVIEW ROUND                                 */}
      {/* ========================================================================= */}
      {selectedRound && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
              <div>
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase ${
                    selectedRound.status === 'CONFIRMED'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                      : selectedRound.status === 'PENDING_CONFIRMATION'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                      : selectedRound.status === 'IN_PROGRESS'
                      ? 'bg-blue-600 text-white animate-pulse'
                      : selectedRound.status === 'COMPLETED'
                      ? 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
                      : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {selectedRound.status === 'CONFIRMED'
                    ? 'Lịch đã kích hoạt'
                    : selectedRound.status === 'PENDING_CONFIRMATION'
                    ? 'Chờ ứng viên xác nhận'
                    : selectedRound.status === 'IN_PROGRESS'
                    ? 'Đang diễn ra trực tuyến'
                    : selectedRound.status === 'COMPLETED'
                    ? 'Đã kết thúc'
                    : selectedRound.status}
                </span>
                <h3 className="mt-1.5 text-base font-extrabold text-slate-900 dark:text-white">
                  {selectedRound.title}
                </h3>
              </div>
              <button
                onClick={() => setSelectedRound(null)}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
                <div>
                  <span className="text-[11px] text-slate-400 font-medium">Ứng viên:</span>
                  <p className="font-bold text-slate-800 dark:text-slate-200">
                    {selectedRound.application?.user?.name || 'Không rõ'}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {selectedRound.application?.user?.email}
                  </p>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 font-medium">Vị trí ứng tuyển:</span>
                  <p className="font-bold text-slate-800 dark:text-slate-200">
                    {selectedRound.application?.job?.name || 'Vị trí'}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Vòng {selectedRound.roundNumber} ({selectedRound.roundType})
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                <Clock className="h-4 w-4 text-primary shrink-0" />
                <span>
                  <strong>Thời gian:</strong>{' '}
                  {new Date(selectedRound.scheduledAt).toLocaleTimeString('vi-VN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  -{' '}
                  {new Date(selectedRound.scheduledEndAt).toLocaleTimeString('vi-VN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  ngày {new Date(selectedRound.scheduledAt).toLocaleDateString('vi-VN')} ({selectedRound.durationMinutes} phút)
                </span>
              </div>

              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                <MapPin className="h-4 w-4 text-primary shrink-0" />
                <span>
                  <strong>Hình thức:</strong>{' '}
                  {selectedRound.isOnline
                    ? 'Trực tuyến (Phòng video tích hợp TalentPulse)'
                    : selectedRound.location || 'Tại văn phòng'}
                </span>
              </div>

              {selectedRound.candidateFeedback && (
                <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <span className="font-bold text-slate-700 dark:text-slate-300">
                    Phản hồi từ ứng viên:
                  </span>
                  <p className="mt-1 text-slate-600 dark:text-slate-400">
                    {selectedRound.candidateFeedback}
                  </p>
                </div>
              )}

              {selectedRound.notes && (
                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/40">
                  <span className="font-bold text-slate-600 dark:text-slate-400">Ghi chú:</span>
                  <p className="mt-0.5 text-slate-600 dark:text-slate-300">{selectedRound.notes}</p>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              {selectedRound.status === 'COMPLETED' ? (
                <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium mr-auto">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>Phòng họp đã kết thúc và đóng lại</span>
                </div>
              ) : (
                <>
                  {/* If online interview, HR can manually send invitation when ready */}
                  {selectedRound.isOnline && (
                    <button
                      onClick={() => handleSendOnlineInvite(selectedRound)}
                      disabled={isSendingInvite}
                      className="flex items-center gap-1.5 rounded-xl border border-primary bg-primary/5 px-3.5 py-2 text-xs font-bold text-primary transition hover:bg-primary/15 disabled:opacity-50 cursor-pointer"
                    >
                      <Send className="h-3.5 w-3.5" />
                      <span>{isSendingInvite ? 'Đang gửi...' : 'Gửi lời mời trực tuyến ngay'}</span>
                    </button>
                  )}

                  {/* Enter online room button */}
                  {selectedRound.isOnline && (
                    <button
                      onClick={() => handleJoinMeeting(selectedRound.roomId)}
                      className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow-md shadow-primary/25 transition hover:bg-primary-dark cursor-pointer"
                    >
                      <Video className="h-3.5 w-3.5" />
                      <span>Vào phòng phỏng vấn</span>
                    </button>
                  )}
                </>
              )}

              <button
                onClick={() => setSelectedRound(null)}
                className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: SCHEDULE NEW INTERVIEW ROUND                                       */}
      {/* ========================================================================= */}
      {isScheduleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <CalendarIcon className="h-4 w-4" />
                </span>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  Lên lịch phỏng vấn mới
                </h3>
              </div>
              <button
                onClick={() => setIsScheduleModalOpen(false)}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateInterview} className="mt-4 space-y-4 text-xs">
              {/* Candidate Selection */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300">
                  Chọn ứng viên <span className="text-rose-500">*</span>
                </label>
                {isLoadingCandidates ? (
                  <div className="mt-1 flex items-center gap-2 text-slate-400 text-xs py-2">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Đang tải danh sách ứng viên...</span>
                  </div>
                ) : (
                  <select
                    value={selectedAppId}
                    onChange={(e) => {
                      setSelectedAppId(e.target.value);
                      const selected = candidatesList.find((c) => c._id === e.target.value);
                      if (selected && !title) {
                        setTitle(`Phỏng vấn chuyên môn - ${selected.userId?.name || 'Ứng viên'}`);
                      }
                    }}
                    required
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-800 shadow-xs focus:border-primary focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-white cursor-pointer"
                  >
                    <option value="">-- Chọn hồ sơ ứng tuyển --</option>
                    {candidatesList.map((app) => (
                      <option key={app._id} value={app._id}>
                        {app.userId?.name || 'Ứng viên'} - {app.jobId?.name || 'Vị trí'} (Trạng thái: {app.status})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Title & Round Type */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300">
                    Tiêu đề buổi phỏng vấn <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="VD: Phỏng vấn kỹ thuật Backend Vòng 1"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-800 focus:border-primary focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300">
                    Loại vòng phỏng vấn
                  </label>
                  <select
                    value={roundType}
                    onChange={(e: any) => setRoundType(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 focus:border-primary focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-white cursor-pointer"
                  >
                    <option value="TECHNICAL">Kỹ thuật / Chuyên môn</option>
                    <option value="HR">Phỏng vấn HR / Phù hợp</option>
                    <option value="CULTURE">Văn hóa doanh nghiệp</option>
                    <option value="FINAL">Vòng chung kết / Ban giám đốc</option>
                  </select>
                </div>
              </div>

              {/* Date & Time (duration minimum 1h) */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300">
                    Ngày phỏng vấn <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-primary focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300">
                    Bắt đầu <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="time"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-primary focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300">
                    Kết thúc (tối thiểu 1h) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="time"
                    required
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-primary focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              {/* Online toggle */}
              <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <label className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isOnline}
                    onChange={(e) => setIsOnline(e.target.checked)}
                    className="rounded text-primary focus:ring-primary h-4 w-4"
                  />
                  <span>Phỏng vấn trực tuyến qua phòng video TalentPulse</span>
                </label>

                {!isOnline && (
                  <div className="mt-2.5">
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400">
                      Địa điểm phỏng vấn trực tiếp
                    </label>
                    <input
                      type="text"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="VD: Phòng họp 405, Tầng 4, Tòa nhà Bitexco"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300">
                  Ghi chú nội bộ
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ghi chú thêm về nội dung cần phỏng vấn..."
                  className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-xs text-slate-800 focus:border-primary focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              {/* Email Notification Checkbox */}
              <label className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendEmailInvite}
                  onChange={(e) => setSendEmailInvite(e.target.checked)}
                  className="rounded text-primary focus:ring-primary h-4 w-4"
                />
                <span>Đồng thời gửi email thông báo chi tiết đến hòm thư ứng viên</span>
              </label>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsScheduleModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-xs font-bold text-white shadow-md shadow-primary/25 transition hover:bg-primary-dark disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Đang lưu lịch...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>Xác nhận tạo lịch</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
