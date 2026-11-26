import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { aiCvMatchingConsentApi } from '../../lib/cvApi';
import type { AiCvMatchingConsent, AiCvMatchingConsentPolicy } from '../../lib/cvTypes';

export default function AiCvMatchingConsentCard() {
  const { accessToken } = useAuth();
  const [state, setState] = useState<{
    token: string;
    policy: AiCvMatchingConsentPolicy;
    consent: AiCvMatchingConsent | null;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const current = state?.token === accessToken ? state : null;
  const granted = current?.consent?.status === 'GRANTED';
  const valid = granted && current.consent?.consentVersion === current.policy.consentVersion &&
    current.consent?.policyHash === current.policy.policyHash &&
    Boolean(current.consent?.grantedAt) && !current.consent?.revokedAt;

  useEffect(() => {
    let active = true;
    setState(null);
    setError('');
    setIsLoading(Boolean(accessToken));
    setIsSaving(false);
    if (accessToken) {
      void Promise.all([
        aiCvMatchingConsentApi.policy(accessToken),
        aiCvMatchingConsentApi.current(accessToken),
      ]).then(([policy, consent]) => {
        if (active) setState({ token: accessToken, policy, consent });
      }).catch(() => {
        if (active) setError('Không thể tải quyền. Vui lòng tải lại trang.');
      }).finally(() => {
        if (active) setIsLoading(false);
      });
    }
    return () => { active = false; };
  }, [accessToken]);

  const updateConsent = async () => {
    if (!current || !accessToken || isSaving) return;
    setIsSaving(true);
    setError('');
    try {
      const consent = await (granted ? aiCvMatchingConsentApi.revoke : aiCvMatchingConsentApi.grant)(current.policy, accessToken);
      setState(previous => previous?.token === accessToken ? { ...previous, consent } : previous);
    } catch {
      setError(granted ? 'Không thể thu hồi. Vui lòng thử lại.' : 'Không thể cấp quyền. Vui lòng thử lại.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section aria-label="Quyền đối chiếu CV bằng AI" className="rounded-3xl border border-amber-200 bg-amber-50/70 p-5 shadow-xs dark:border-amber-900/60 dark:bg-amber-950/20">
      <div className="flex items-start gap-3">
        <ShieldCheck aria-hidden="true" className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-300" />
        <div className="min-w-0 flex-1">
          <h2 className="font-black text-slate-900 dark:text-white">Quyền đối chiếu CV bằng AI</h2>
          <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300" lang="en">
            TalentPulse may process the candidate CV for the explicitly selected AI CV matching purpose.
          </p>
          {current && <p className="mt-2 break-all text-xs text-slate-600 dark:text-slate-300">Phiên bản: {current.policy.consentVersion}</p>}
          <p role="status" className="mt-2 text-xs text-slate-600 dark:text-slate-300">
            {isLoading ? 'Đang tải quyền đối chiếu CV…' : valid ? 'Đã cấp quyền theo chính sách hiện tại.' : 'Chưa cấp quyền theo chính sách hiện tại.'}
          </p>
          {error && <p role="alert" className="mt-3 text-xs text-rose-600 dark:text-rose-300">{error}</p>}
          <button type="button" disabled={isLoading || isSaving || !current} onClick={() => void updateConsent()}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 disabled:cursor-not-allowed disabled:opacity-50">
            {(isLoading || isSaving) && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
            {granted ? 'Thu hồi quyền đối chiếu CV AI' : 'Cấp quyền đối chiếu CV AI'}
          </button>
        </div>
      </div>
    </section>
  );
}
