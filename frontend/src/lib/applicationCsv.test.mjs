import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

// Node 18 cannot import TypeScript directly; use the existing compiler without emitting files.
const source = await readFile(new URL('./applicationCsv.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { applicationCsv, csvCell } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const translate = (key) => key.split('.').at(-1);
const row = (aiScore) => ({
  userId: { name: 'Candidate', email: 'test@example.invalid' },
  jobId: { name: 'Engineer' }, status: 'PENDING', createdAt: '2026-11-02',
  cvId: { url: 'https://example.invalid/cv#file' }, aiScore,
});

test('quotes commas, quotes, line breaks, and neutralizes spreadsheet formulas', () => {
  assert.equal(csvCell('A,"B"\nC'), '"A,""B""\nC"');
  for (const value of ['=1+1', '+1', '-1', '@SUM(A1)', '  =1', '\t+1', '\r\n@x', '\u00a0-1']) {
    assert.equal(csvCell(value), `"'${value}"`);
  }
  assert.equal(csvCell('Normal name'), '"Normal name"');
});

test('uses each application score, preserves zero and leaves non-completed scores blank', () => {
  const applications = [row({ status: 'COMPLETED', overallScore: 0 }), row({ status: 'COMPLETED', overallScore: 0.876 })];
  for (const status of ['PENDING', 'PROCESSING', 'FAILED', 'MISSING', 'STALE', 'UNAVAILABLE']) {
    applications.push(row({ status, overallScore: 0.9 }));
  }
  applications.push(row(null), row(undefined), row({ status: 'COMPLETED', overallScore: null }));
  const lines = applicationCsv(applications, translate, (date) => date).split('\r\n');
  assert.ok(lines[0].startsWith('\uFEFF'));
  assert.ok(lines[1].endsWith('"0%","COMPLETED"'));
  assert.ok(lines[2].endsWith('"88%","COMPLETED"'));
  for (let i = 3; i < lines.length; i++) assert.match(lines[i], /,"","[A-Z]+"$/);
  assert.ok(lines[3].includes('https://example.invalid/cv#file'));
});

test('localizes AI statuses and headers, and sanitizes all user string columns', () => {
  const app = row({ status: 'STALE', overallScore: null });
  app.userId.name = ' =1';
  app.userId.email = '+email';
  app.jobId.name = '@job';
  app.cvId.url = '-url';
  const csv = applicationCsv([app], (key) => `vi:${translate(key)}`, (date) => date);
  assert.ok(csv.includes('"vi:aiScore"'));
  assert.ok(csv.endsWith('"vi:STALE"'));
  for (const value of [' =1', '+email', '@job', '-url']) assert.ok(csv.includes(`"'${value}"`));
});
