import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { aiCvConsentApi } from '../../lib/cvApi';
import type {
  AiCvGenerationConsent,
  AiCvGenerationConsentPolicy,
} from '../../lib/cvTypes';

export default function AiCvGenerationConsentCard() {
  const { accessToken } = useAuth();
  const [policy, setPolicy] = useState<AiCvGenerationConsentPolicy | null>(null);
  const [consent, setConsent] = useState<AiCvGenerationConsent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const granted = consent?.status === 'GRANTED';
  const policyConfigured = Boolean(
    policy?.consentVersion && /^[a-f0-9]{64}$/.test(policy.policyHash),
  );

  useEffect(() => {
    if (!accessToken) {
      setPolicy(null);
      setConsent(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError('');
    void Promise.all([
      aiCvConsentApi.policy(accessToken),
      aiCvConsentApi.current(accessToken),
    ])
      .then(([activePolicy, currentConsent]) => {
        setPolicy(activePolicy);
        setConsent(currentConsent);
      })
      .catch((requestError: unknown) => {
        setPolicy(null);
        setConsent(null);
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Không thể tải trạng thái cấp quyền tạo CV bằng AI.',
        );
      })
      .finally(() => setIsLoading(false));
  }, [accessToken]);

  const updateConsent = async () => {
    if (!accessToken || !policy || !policyConfigured) return;
    setIsSaving(true);
    setError('');
    try {
      setConsent(
        granted
          ? await aiCvConsentApi.revoke(policy, accessToken)
          : await aiCvConsentApi.grant(policy, accessToken),
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Không thể cập nhật quyền tạo CV bằng AI.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="rounded-3xl border border-amber-200 bg-amber-50/70 p-5 shadow-xs dark:border-amber-900/60 dark:bg-amber-950/20">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-amber-500/15 p-2 text-amber-600 dark:text-amber-300">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-black text-slate-900 dark:text-white">
            Quyền tạo CV bằng AI
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
            Cho phép TalentPulse dùng dữ liệu CV của bạn để tạo bản nháp có thể chỉnh sửa.
            Bạn có thể thu hồi quyền này bất cứ lúc nào.
          </p>
          {error && (
            <p className="mt-3 flex items-start gap-1 text-xs text-rose-600 dark:text-rose-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </p>
          )}
          <button
            type="button"
            disabled={isLoading || isSaving || !policyConfigured}
            onClick={() => void updateConsent()}
            className={`mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold text-white transition disabled:opacity-50 ${
              granted
                ? 'bg-slate-600 hover:bg-slate-700'
                : 'bg-amber-500 hover:bg-amber-600'
            }`}
          >
            {isLoading || isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : granted ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            {granted ? 'Thu hồi quyền tạo CV AI' : 'Cấp quyền tạo CV AI'}
          </button>
        </div>
      </div>
    </section>
  );
}
