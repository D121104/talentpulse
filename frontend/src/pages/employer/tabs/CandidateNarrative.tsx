import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { ApiError } from '../../../lib/api';
import { employerApi, type MatchNarrative, type NarrativeStatement } from '../../../lib/employerApi';

export default function CandidateNarrative({ jobId, applicationId, version, locale, accessToken, onForbidden, onRefresh }: {
  jobId: string; applicationId: string; version: string; locale: 'vi' | 'en'; accessToken: string;
  onForbidden: () => void; onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const [result, setResult] = useState<MatchNarrative | null>(null);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<'refresh' | 'error' | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); }, []);

  const load = async () => {
    if (request.current || result) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setFailure(null);
    try {
      const data = await employerApi.getMatchNarrative(jobId, applicationId, { locale, analysisVersionKey: version }, accessToken, controller.signal);
      if (controller.signal.aborted) return;
      if (data.analysisVersionKey !== version || data.locale !== locale) { setFailure('refresh'); return; }
      setResult(data);
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof ApiError && err.status === 403) { setResult(null); onForbidden(); return; }
      setFailure(err instanceof ApiError && err.status === 409 ? 'refresh' : 'error');
    } finally {
      if (!controller.signal.aborted) { request.current = null; setLoading(false); }
    }
  };
  const statement = (item: NarrativeStatement) => <div className="space-y-2">
    <p className="whitespace-pre-wrap break-words">{item.text}</p>
    <div className="flex flex-wrap gap-1">{item.evidence.filter(key => Object.prototype.hasOwnProperty.call(result?.evidenceLabels ?? {}, key)).map((key, index) =>
      <span key={`${key}-${index}`} className="rounded-md bg-primary/10 px-2 py-1 text-xs text-primary">{result?.evidenceLabels[key]}</span>)}</div>
  </div>;
  return <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
    <button type="button" aria-expanded={expanded} aria-controls={id}
      className="inline-flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-semibold text-primary focus-visible:outline-2 focus-visible:outline-primary"
      onClick={() => { setExpanded(!expanded); if (!expanded && !failure) void load(); }}>
      {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      {t(`employer.candidatesTab.narrative.${expanded ? 'hide' : 'show'}`)}
    </button>
    <div id={id} hidden={!expanded} className="space-y-4 pt-3 text-sm text-slate-700 dark:text-slate-300" aria-busy={loading}>
      {loading && <p role="status" className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{t('employer.candidatesTab.narrative.loading')}</p>}
      {failure && <div role="alert"><p>{t(`employer.candidatesTab.narrative.${failure}`)}</p><button type="button" className="mt-2 rounded-lg px-2 py-2 font-semibold text-primary underline" onClick={() => failure === 'refresh' ? onRefresh() : void load()}>{t(`employer.candidatesTab.narrative.${failure === 'refresh' ? 'refreshButton' : 'retry'}`)}</button></div>}
      {result && <>
        <p className="rounded-lg bg-slate-100 p-3 text-xs dark:bg-slate-800">{t(`employer.candidatesTab.narrative.${result.source}`)}</p>
        {statement(result.analysis.summary)}
        {(['strengths', 'pointsToVerify'] as const).map(section => result.analysis[section].length > 0 && <section key={section} className="space-y-2"><h5 className="font-bold">{t(`employer.candidatesTab.narrative.${section}`)}</h5><ul className="list-disc space-y-3 pl-5">{result.analysis[section].map((item, index) => <li key={index}>{statement(item)}</li>)}</ul></section>)}
      </>}
    </div>
  </div>;
}
