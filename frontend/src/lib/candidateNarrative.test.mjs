import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';

const ui = await readFile(new URL('../pages/employer/tabs/CandidateNarrative.tsx', import.meta.url), 'utf8');
const parent = await readFile(new URL('../pages/employer/tabs/CandidateManagementTab.tsx', import.meta.url), 'utf8');
const client = await readFile(new URL('./employerApi.ts', import.meta.url), 'utf8');

test('source contract: collapsed initially, accessible toggle and click-only generation', () => {
  assert.match(ui, /useState\(false\)/);
  assert.match(ui, /aria-expanded=\{expanded\} aria-controls=\{id\}/);
  assert.match(ui, /hidden=\{!expanded\}/);
  assert.match(ui, /if \(!expanded && !failure\) void load\(\)/);
  assert.doesNotMatch(ui, /useEffect\([^;]*\bload\(/s);
});

test('source contract: cached result and in-flight request survive collapse; stale requests are ignored', () => {
  assert.match(ui, /if \(request.current \|\| result\) return/);
  assert.match(ui, /request.current = controller/);
  assert.match(ui, /controller.signal.aborted/);
  assert.match(ui, /data.analysisVersionKey !== version \|\| data.locale !== locale/);
  assert.match(parent, /key=\{`\$\{aiRankingData.jobId\}\/\$\{candidate.applicationId\}\/\$\{candidate.analysisVersionKey\}\/\$\{locale\}`\}/);
  assert.match(parent, /\[accessToken, company\?\._id, hasCompany, locale\]/);
});

test('source contract: locked branch has no narrative; fallback source is explicit and evidence is plain React text', async () => {
  assert.match(parent, /!candidate.analysisAvailable \?/);
  assert.doesNotMatch(parent, /<MatchingAnalysis/);
  assert.match(ui, /result.source/);
  assert.match(ui, /result\?\.evidenceLabels\[key\]/);
  assert.doesNotMatch(ui, /dangerouslySetInnerHTML/);
  assert.match(ui, /err.status === 403/);
  assert.match(ui, /err.status === 409/);
  assert.match(client, /ai-analysis\/\$\{applicationId\}/);
  for (const language of ['vi', 'en']) {
    const copy = await readFile(new URL(`../i18n/${language}.ts`, import.meta.url), 'utf8');
    assert.match(copy, /deterministic_fallback:/);
  }
});
