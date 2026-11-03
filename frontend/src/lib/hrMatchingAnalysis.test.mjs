import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('./hrMatchingAnalysis.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { analysisPercent, analysisComponent, analysisTexts, storedCandidateScore } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('search scores use application rounding and require job context and completed stored scores', () => {
  for (const value of [0, 0.876, 1]) assert.equal(storedCandidateScore('job', { status: 'COMPLETED', overallScore: value }), analysisPercent(value));
  assert.equal(storedCandidateScore(null, { status: 'COMPLETED', overallScore: 0.95 }), null);
  assert.equal(storedCandidateScore('job', { status: 'COMPLETED', overallScore: null }), null);
  for (const status of ['STALE', 'MISSING', 'UNAVAILABLE', 'PENDING', 'PROCESSING', 'FAILED']) assert.equal(storedCandidateScore('job', { status, overallScore: 0.95 }), null);
});

test('search suppresses legacy company heuristics and analysis respects unavailable skills', async () => {
  const search = await readFile(new URL('../pages/employer/tabs/CVSearchTab.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(search, /candidate\.(recommendationReason|companyMatchScore|isRecommendedForCompany)/);
  assert.match(search, /resultJob\.jobId &&/);
  assert.match(search, /jobId: searchCriteria\.jobId/);
  const analysis = await readFile(new URL('../pages/employer/tabs/MatchingAnalysis.tsx', import.meta.url), 'utf8');
  assert.match(analysis, /skills\?\.available === true/);
  assert.match(analysis, /cv-job-match-v3/);
  const sidebar = await readFile(new URL('../components/jobs/JobSidebarWidgets.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(sidebar, /95%/);
});

test('unit scores preserve zero and reject invalid or missing values', () => {
  assert.equal(analysisPercent(0), '0%');
  assert.equal(analysisPercent(1), '100%');
  assert.equal(analysisPercent(0.876), '88%');
  for (const value of [null, undefined, NaN, Infinity, -1, 1.1, '0.5']) assert.equal(analysisPercent(value), null);
});

test('missing legacy components are unavailable, not zero scores', () => {
  assert.deepEqual(analysisComponent(), { score: null, weight: null, available: false, evidence: [] });
  assert.equal(analysisComponent({ score: 0, weight: 0, available: true, evidence: [] }).score, '0%');
  assert.equal(analysisComponent({ score: 0.9, weight: 0.4, available: false }).score, null);
  assert.equal(analysisComponent({ score: 0.9, weight: NaN, available: true }).available, false);
});

test('compatibility never claims a contribution to overall scoring', () => {
  const value = analysisComponent({ score: 1, weight: 0, available: true, evidence: ['Remote'] }, true);
  assert.equal(value.weight, '0%');
  assert.equal(value.score, '100%');
  assert.equal(analysisComponent(undefined, true).weight, '0%');
});

test('evidence and skill arrays tolerate absent and malformed legacy data', () => {
  assert.deepEqual(analysisTexts(undefined), []);
  assert.deepEqual(analysisTexts('React'), []);
  assert.deepEqual(analysisTexts(['React', null, 1, '', ' ', 'English evidence']), ['React', 'English evidence']);
});
