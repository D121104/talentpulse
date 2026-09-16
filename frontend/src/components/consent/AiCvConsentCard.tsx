import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import {
  assistantApi,
  type AssistantConsent,
  type AssistantConsentMutation,
  type AssistantConsentPolicy,
} from '../../lib/assistantApi';

export default function AiCvConsentCard() {
  const { accessToken } = useAuth();
  const [consent, setConsent] = useState<AssistantConsent | null>(null);
  const [policy, setPolicy] = useState<AssistantConsentPolicy | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const granted = consent?.status === 'GRANTED';
  const policyConfigured = Boolean(
    policy &&
      policy.consentVersion &&
      /^[a-f0-9]{64}$/.test(policy.policyHash),
  );

  useEffect(() => {
    if (!accessToken) {
      setConsent(null);
      setPolicy(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError('');
    void Promise.all([
      assistantApi.consentPolicy(accessToken),
      assistantApi.currentConsent(accessToken),
    ])
      .then(([activePolicy, currentConsent]) => {
        setPolicy(activePolicy);
        setConsent(currentConsent);
      })
      .catch(() => {
        setPolicy(null);
        setConsent(null);
        setError(
          'Máy chủ chưa cung cấp policy metadata cho consent trợ lý AI. Tính năng cấp consent đang tạm khóa.',
        );
      })
      .finally(() => setIsLoading(false));
  }, [accessToken]);

  const updateConsent = async (nextGranted: boolean) => {
    if (!accessToken || !policy || !policyConfigured) return;
    setIsSaving(true);
    setError('');
    const input: AssistantConsentMutation = {
      consentVersion: policy.consentVersion,
      policyHash: policy.policyHash,
      source: 'web',
      sourceMetadata: { locale: document.documentElement.lang || 'vi' },
    };
    try {
      setConsent(nextGranted
        ? await assistantApi.grantConsent(input, accessToken)
        : await assistantApi.revokeConsent(input, accessToken));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Không thể cập nhật đồng ý AI.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-primary/10 p-2 text-primary"><ShieldCheck className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <h2 className="font-black text-slate-900 dark:text-white">Cho phép trợ lý AI xử lý CV</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Đồng ý này là tự nguyện. Bạn vẫn có thể tạo CV, ứng tuyển và sử dụng các chức năng không cần AI khi chưa đồng ý.</p>
          <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-xs leading-5 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">TalentPulse chỉ xử lý dữ liệu CV và việc làm đã chọn để cung cấp trợ lý ứng viên. Bạn có thể thu hồi bất cứ lúc nào.</div>
          {(!policyConfigured || error) && <p className="mt-3 flex items-start gap-1 text-xs text-amber-600"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error || 'Server chưa cung cấp policy metadata để cấp consent mới. Bạn vẫn có thể thu hồi consent hiện có.'}</p>}
          <button type="button" disabled={isLoading || isSaving || !policyConfigured} onClick={() => void updateConsent(!granted)} className={`mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold text-white transition disabled:opacity-50 ${granted ? 'bg-slate-600 hover:bg-slate-700' : 'bg-primary hover:bg-primary-dark'}`}>
            {isLoading || isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : granted ? <CheckCircle2 className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
            {granted ? 'Thu hồi đồng ý' : 'Đồng ý cho trợ lý AI'}
          </button>
        </div>
      </div>
    </section>
  );
}
