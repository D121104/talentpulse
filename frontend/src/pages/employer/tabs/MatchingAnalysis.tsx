import { useTranslation } from 'react-i18next';
import type { AIRankedCandidate } from '../../../lib/employerApi';
import { analysisComponent, analysisTexts } from '../../../lib/hrMatchingAnalysis';

export default function MatchingAnalysis({ candidate }: { candidate: AIRankedCandidate }) {
  const { t } = useTranslation();
  const label = (key: string) => t(`employer.candidatesTab.analysis.${key}`);
  if (!candidate.analysisAvailable) return null;
  const analysis = candidate.aiAnalysis;
  const list = (key: string, value: unknown) => {
    const items = analysisTexts(value);
    return <section><h5 className="font-semibold">{label(key)}</h5>{items.length ? <ul lang={analysis?.textLocale === 'en' ? 'en' : undefined} className="list-disc pl-4 break-words">{items.map((text, index) => <li key={index}>{text}</li>)}</ul> : <p>{label('noRecordedEvidence')}</p>}</section>;
  };
  return <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
    <p>{label(analysis?.textLocale === 'en' ? 'englishText' : 'unknownLanguage')}</p>
    {!analysis && <p>{label('legacy')}</p>}
    {analysis?.degraded === true && <p role="status" className="rounded-lg bg-amber-50 p-3 text-amber-800 dark:bg-amber-950 dark:text-amber-200">{label('degraded')}</p>}
    {analysis && <>
      <p>{label('persisted')}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {(['semantic', 'skills', 'experience', 'location', 'workMode'] as const).map(key => {
          const compatibility = key === 'location' || key === 'workMode';
          const value = analysisComponent(compatibility ? analysis.compatibility?.[key] : analysis.components?.[key], compatibility);
          return <section key={key} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <h5 className="font-semibold">{label(key)}</h5>
            <p>{label('score')}: {value.score ?? label('unavailable')}</p>
            <p>{label('availability')}: {label(value.available ? 'available' : 'unavailable')}</p>
            <p>{label('weight')}: {value.weight ?? label('unavailable')}</p>
            {compatibility && <p>{label('noImpact')}</p>}
            {value.evidence.length > 0 && <ul lang={analysis.textLocale === 'en' ? 'en' : undefined} className="list-disc pl-4 break-words">{value.evidence.map((text, index) => <li key={index}>{text}</li>)}</ul>}
          </section>;
        })}
      </div>
    </>}
    <div className="grid gap-3 sm:grid-cols-2">
      {list('matchedSkills', analysis ? analysis.matchedSkills : candidate.matchedSkills)}
      {list('missingRequiredSkills', analysis ? analysis.missingRequiredSkills : candidate.missingSkills)}
      {list('strengths', analysis?.strengths)}
      {list('gaps', analysis?.gaps)}
    </div>
    <section>
      <h5 className="font-semibold">{label('explanation')}</h5>
      <p>{label(analysis?.explanation?.source ?? 'stored_unknown')}</p>
      <p>{label(analysis?.explanation?.locale === 'en' ? 'englishText' : 'unknownLanguage')}</p>
      <p lang={analysis?.explanation?.locale === 'en' ? 'en' : undefined} className="whitespace-pre-line break-words">{analysis ? analysis.explanation?.text || label('unavailable') : candidate.shortExplanation || label('unavailable')}</p>
    </section>
    {analysis && <dl className="break-words">{(['scoring', 'model', 'normalization'] as const).map(key => <div key={key}><dt className="inline font-semibold">{label(key)}: </dt><dd className="inline">{analysis.versions?.[key] || label('unavailable')}</dd></div>)}</dl>}
  </div>;
}
