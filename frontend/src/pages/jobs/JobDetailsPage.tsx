import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Briefcase, CalendarDays, Loader2, MapPin, Wallet } from 'lucide-react';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import { jobsApi, type PublicJob } from '../../lib/jobsApi';
import { useAuth } from '../../auth/AuthContext';
import { userCvApi } from '../../lib/cvApi';
import { applicationsApi } from '../../lib/applicationsApi';
import type { UserCV } from '../../lib/cvTypes';
import { ApiError } from '../../lib/api';

export default function JobDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<PublicJob | null>(null);
  const [error, setError] = useState('');
  const { user, accessToken } = useAuth();
  const navigate = useNavigate();
  const [uploadedCvs, setUploadedCvs] = useState<UserCV[]>([]);
  const [selectedCvId, setSelectedCvId] = useState('');
  const [coverLetter, setCoverLetter] = useState('');
  const [aiRankingConsent, setAiRankingConsent] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [applicationMessage, setApplicationMessage] = useState('');

  useEffect(() => {
    if (!id) return;
    void jobsApi.getById(id).then(setJob).catch((requestError: unknown) => {
      setError(requestError instanceof ApiError ? requestError.message : 'Không thể tải thông tin việc làm.');
    });
  }, [id]);

  useEffect(() => {
    if (!accessToken || user?.role !== 'USER') return;
    void userCvApi.findAll(accessToken).then((uploaded) => {
      setUploadedCvs(uploaded);
      setSelectedCvId(uploaded.find((cv) => cv.isPrimary)?._id || uploaded[0]?._id || '');
    }).catch(() => undefined);
  }, [accessToken, user?.role]);

  const apply = async () => {
    if (!accessToken || !job || !selectedCvId || !job.company?._id) return;
    setIsApplying(true);
    setApplicationMessage('');
    try {
      await applicationsApi.create({ cvId: selectedCvId, jobId: job._id, companyId: job.company._id, coverLetter: coverLetter.trim() || undefined, aiRankingConsent }, accessToken);
      setApplicationMessage('Đã gửi hồ sơ ứng tuyển.');
    } catch (requestError) {
      setApplicationMessage(requestError instanceof Error ? requestError.message : 'Không thể gửi hồ sơ ứng tuyển.');
    } finally {
      setIsApplying(false);
    }
  };

  return <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950"><Header /><main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-16 pt-28 sm:px-6"><Link to="/" className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-primary"><ArrowLeft className="h-4 w-4" /> Về trang chủ</Link>{error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-700">{error}</div>}{!job && !error && <div className="flex justify-center p-16"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>}{job && <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="bg-gradient-to-br from-primary/10 via-cyan-500/5 to-transparent p-6 sm:p-10"><div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"><div><p className="mb-2 text-sm font-bold text-primary">{job.company?.name || 'TalentPulse Jobs'}</p><h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">{job.name}</h1></div>{job.isHot && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-700">HOT</span>}</div><div className="mt-6 grid gap-3 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-3"><span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" />{job.location}</span><span className="inline-flex items-center gap-2"><Wallet className="h-4 w-4 text-primary" />{job.salary ? job.salary.toLocaleString() : 'Thoả thuận'}</span><span className="inline-flex items-center gap-2"><Briefcase className="h-4 w-4 text-primary" />{job.level}</span></div></div><div className="space-y-7 p-6 sm:p-10"><section><h2 className="mb-3 text-lg font-black text-slate-900 dark:text-white">Mô tả công việc</h2><div className="whitespace-pre-wrap text-sm leading-7 text-slate-600 dark:text-slate-300">{job.description}</div></section><section><h2 className="mb-3 text-lg font-black text-slate-900 dark:text-white">Kỹ năng</h2><div className="flex flex-wrap gap-2">{(job.skills || []).map((skill) => <span key={skill} className="rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">{skill}</span>)}</div></section><div className="flex items-center gap-2 border-t border-slate-100 pt-5 text-xs text-slate-500 dark:border-slate-800"><CalendarDays className="h-4 w-4" /> Hạn ứng tuyển: {new Date(job.endDate).toLocaleDateString()}</div>{user?.role === 'USER' && <section className="rounded-2xl border border-primary/20 bg-primary/5 p-4"><h2 className="mb-3 font-black text-slate-900 dark:text-white">Ứng tuyển</h2><select value={selectedCvId} onChange={(event) => setSelectedCvId(event.target.value)} className="mb-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"><option value="">Chọn CV</option>{uploadedCvs.map((cv) => <option key={cv._id} value={cv._id}>{cv.title || 'CV của tôi'}</option>)}</select><textarea value={coverLetter} onChange={(event) => setCoverLetter(event.target.value)} placeholder="Cover letter (tuỳ chọn)" className="mb-3 min-h-24 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" /><label className="mb-3 flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300"><input type="checkbox" checked={aiRankingConsent} onChange={(event) => setAiRankingConsent(event.target.checked)} className="mt-0.5" />Cho phép dùng hồ sơ này cho AI ranking của đơn ứng tuyển (không bắt buộc).</label><button type="button" onClick={() => void apply()} disabled={isApplying || !selectedCvId} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{isApplying ? 'Đang gửi…' : 'Ứng tuyển ngay'}</button>{applicationMessage && <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{applicationMessage}</p>}</section>}{!user && <button type="button" onClick={() => navigate('/login')} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white">Đăng nhập để ứng tuyển</button>}</div></article>}</main><Footer /></div>;
}
