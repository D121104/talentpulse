import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import { Buffer } from 'node:buffer';
import ts from 'typescript';

const source = await readFile(new URL('./candidateNarrative.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { narrativeEvidence } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const analysis = { components: { skills: { available: true } }, matchedSkills: ['TypeScript', 'React'], missingRequiredSkills: ['SQL'] };

test('specific m/g references resolve authorized response labels or available analysis arrays', () => {
  assert.deepEqual(narrativeEvidence(['m0', 'm1', 'g0'], { m0: 'TypeScript' }, analysis), [
    { label: 'TypeScript', kind: 'matched' }, { label: 'React', kind: 'matched' }, { label: 'SQL', kind: 'verify' },
  ]);
});

test('unknown or unavailable references invent no labels', () => {
  assert.deepEqual(narrativeEvidence(['m99', 'g4', 'm01', 'toString'], {}, analysis), []);
  assert.deepEqual(narrativeEvidence(['m0', 'g0'], {}), []);
  assert.deepEqual(narrativeEvidence(['m0', 'g0'], {}, { ...analysis, components: { skills: { available: false } } }), []);
});

test('deduplicate display labels per statement and generic chips across statements', () => {
  const seen = new Set();
  const labels = { m0: 'React', m1: 'React', skills: 'Skills', semantic: 'Relevance', overall: 'Relevance' };
  assert.deepEqual(narrativeEvidence(['m0', 'm1', 'm0', 'skills', 'semantic', 'overall'], labels, undefined, seen), [
    { label: 'React', kind: 'matched' }, { label: 'Relevance', kind: 'context' },
  ]);
  assert.deepEqual(narrativeEvidence(['semantic', 'overall'], labels, undefined, seen), []);
});

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
  assert.match(ui, /narrativeEvidence\(item.evidence, result\?\.evidenceLabels/);
  assert.match(parent, /!candidate.analysisAvailable \?[\s\S]*?\) : candidate.analysisVersionKey && accessToken \? <CandidateNarrative/);
  assert.match(parent, /aiAnalysis=\{candidate.aiAnalysis\}/);
  assert.match(ui, /\{result && <>/);
  assert.match(ui, /aiAnalysis\[field\]\.length/);
  assert.match(ui, /!aiAnalysis.components.experience.available/);
  assert.doesNotMatch(ui, /dangerouslySetInnerHTML/);
  assert.match(ui, /err.status === 403/);
  assert.match(ui, /err.status === 409/);
  assert.match(client, /ai-analysis\/\$\{applicationId\}/);
  for (const language of ['vi', 'en']) {
    const copy = await readFile(new URL(`../i18n/${language}.ts`, import.meta.url), 'utf8');
    assert.match(copy, /deterministic_fallback:/);
  }
});
