import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('./candidateSearch.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { candidateSearchQuery, emptyCandidateSearch, optionalCandidateNumber } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('job context is available on free and premium searches without enabling advanced filters', () => {
  for (const advanced of [false, true]) assert.equal(candidateSearchQuery({ ...emptyCandidateSearch, jobId: 'job-id' }, advanced).jobId, 'job-id');
  assert.equal(candidateSearchQuery(emptyCandidateSearch, false).jobId, undefined);
  assert.equal(candidateSearchQuery({ ...emptyCandidateSearch, jobId: 'job-id', skills: 'React' }, false).skills, undefined);
});

test('preserves zero, decimal experience and inclusive maximum salary', () => {
  const query = candidateSearchQuery({ ...emptyCandidateSearch, minExperienceYears: '0', maxExperienceYears: '0.5', minExpectedSalary: '0', maxExpectedSalary: '2147483647', education: '  Bachelor  ' }, true);
  assert.equal(query.minExperienceYears, 0);
  assert.equal(query.maxExperienceYears, 0.5);
  assert.equal(query.minExpectedSalary, 0);
  assert.equal(query.maxExpectedSalary, 2147483647);
  assert.equal(query.education, 'Bachelor');
});

test('empty/reset filters omit numeric bounds; blank candidate salary clears with null', () => {
  const query = candidateSearchQuery(emptyCandidateSearch, true);
  assert.equal(query.minExperienceYears, undefined);
  assert.equal(query.minExpectedSalary, undefined);
  assert.equal(optionalCandidateNumber(' ', 2147483647, true) ?? null, null);
  assert.equal(optionalCandidateNumber('0', 2147483647, true) ?? null, 0);
});

test('rejects invalid numbers and reversed ranges before a request', () => {
  for (const value of ['-1', '101', 'Infinity', 'NaN', 'abc']) {
    assert.throws(() => candidateSearchQuery({ ...emptyCandidateSearch, minExperienceYears: value }, true));
  }
  for (const value of ['-1', '1.5', '2147483648', 'Infinity']) {
    assert.throws(() => optionalCandidateNumber(value, 2147483647, true));
  }
  for (const [min, max] of [['minExperienceYears', 'maxExperienceYears'], ['minExpectedSalary', 'maxExpectedSalary']]) {
    assert.throws(() => candidateSearchQuery({ ...emptyCandidateSearch, [min]: '2', [max]: '0' }, true));
  }
});

test('free or unresolved access omits all advanced filters, including numeric zero', () => {
  assert.deepEqual(candidateSearchQuery({ ...emptyCandidateSearch, keyword: ' dev ', education: 'degree', skills: 'React', location: 'Hanoi', minExpectedSalary: '0', maxExperienceYears: 'invalid' }, false), { keyword: 'dev' });
});

test('editor retains structured salary, explicit consent and optimistic update contract', async () => {
  const editor = await readFile(new URL('../pages/cv/CVEditorPage.tsx', import.meta.url), 'utf8');
  assert.match(editor, /useState\(false\)/);
  assert.match(editor, /setShareExpectedSalary\(cv.shareExpectedSalary === true\)/);
  assert.match(editor, /expectedSalaryVndMonthly: salaryValue/);
  assert.match(editor, /expectedContentVersion: contentVersionRef.current/);
  assert.match(editor, /latestPayloadRef.current = !salaryValid \? null/);
});
