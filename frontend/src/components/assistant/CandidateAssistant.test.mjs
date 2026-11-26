import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import test from 'node:test';
import ts from 'typescript';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const source = await readFile(new URL('./CandidateAssistant.tsx', import.meta.url), 'utf8');
test('CV selection is reconciled on refresh and invalid selections are rejected before sending', () => {
  assert.match(source, /options.some\(\(cv\) => cv.key === current && !cv.disabled\)/);
  assert.match(source, /if \(cvAllowed && selectedCvId && !selectedCv\)\s*\{[\s\S]*?return;/);
  assert.match(source, /cvId: selectedCv.id, cvSource: selectedCv.source/);
  assert.match(source, /value=\{cv.key\} disabled=\{cv.disabled\}/);
  assert.match(source, /CV trống không thể phân tích/);
  assert.match(source, /if \(errorCode === "AI_CONSENT_REQUIRED"\) setHasConsent\(false\)/);
});
const ast = ts.createSourceFile('CandidateAssistant.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
test('CV options show names without type suffixes and preserve keys and status indications', () => {
  let option;
  function visit(node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === 'option' && node.openingElement.getText(ast).includes('value={cv.key}')) option = node;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(option);
  const optionContext = vm.createContext({ React });
  vm.runInContext(ts.transpileModule(`function renderOption(cv) { return (${option.getText(ast)}); }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText, optionContext);
  for (const source of ['online', 'profile']) {
    for (const status of [null, 'Đang xử lý', 'Lỗi xử lý']) {
      const cv = { key: `${source}:same-id`, title: 'My CV', source, status, disabled: Boolean(status) };
      const element = optionContext.renderOption(cv);
      assert.equal(element.key, cv.key);
      assert.equal(element.props.value, cv.key);
      assert.equal(element.props.disabled, cv.disabled);
      const markup = renderToStaticMarkup(element);
      assert.ok(markup.endsWith(`>${cv.title}${status ? ` · ${status}` : ''}</option>`));
      assert.doesNotMatch(markup, /· Online|· Hồ sơ CV/);
    }
  }
});
const helpers = ast.statements.filter((node) =>
  (ts.isFunctionDeclaration(node) && ['formatSalaryText', 'assistantInlineParts', 'assistantContentBlocks'].includes(node.name?.text)) ||
  (ts.isVariableStatement(node) && /^(const JOB_METADATA_PATTERN|const METADATA_ONLY_PATTERN)/.test(node.getText(ast)))
).map((node) => node.getText(ast)).join('\n');
const context = vm.createContext({ Intl });
vm.runInContext(ts.transpileModule(helpers, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);

test('salary scientific notation is readable without rewriting unrelated numbers', () => {
  assert.equal(context.formatSalaryText('Mức lương: 2.5e+07 - 3e7 VND', 'vi'), 'Mức lương: 25.000.000 - 30.000.000 VND');
  assert.equal(context.formatSalaryText('Salary: 2.5E7 USD', 'en'), 'Salary: 25,000,000 USD');
  assert.equal(context.formatSalaryText('Score: 2e3; samples: 4e5', 'en'), 'Score: 2e3; samples: 4e5');
});

test('fallback job titles link to their canonical IDs, independently of citation order', () => {
  const jobs = [{ sourceType: 'JOB', sourceId: 'b', label: 'Backend Engineer' }, { sourceType: 'JOB', sourceId: 'a', label: 'Frontend Engineer' }];
  const blocks = context.assistantContentBlocks('Matching jobs:\n- Frontend Engineer\n  Salary: 25,000,000 VND\n- Backend Engineer');
  const links = blocks.flatMap((block) => (block.items ?? [block.text]).flatMap((text) => context.assistantInlineParts(text, jobs))).filter((part) => part.sourceId);
  assert.equal(JSON.stringify(links), JSON.stringify([{ text: 'Frontend Engineer', sourceId: 'a' }, { text: 'Backend Engineer', sourceId: 'b' }]));
  assert.doesNotMatch(source, /item\.citations\s*\?\.filter/);
});

test('ambiguous, overlapping, missing and partial titles do not get guessed links', () => {
  const jobs = [{ sourceType: 'JOB', sourceId: 'a', label: 'Engineer' }, { sourceType: 'JOB', sourceId: 'b', label: 'Engineer' }];
  assert.equal(context.assistantInlineParts('Engineer', jobs).some((part) => part.sourceId), false);
  assert.equal(context.assistantInlineParts('Engineers', jobs.slice(0, 1)).some((part) => part.sourceId), false);
  assert.equal(context.assistantInlineParts('Other job', jobs).some((part) => part.sourceId), false);
  assert.equal(context.assistantInlineParts('Frontend Engineer', [jobs[0], { sourceType: 'JOB', sourceId: 'c', label: 'Frontend Engineer' }]).some((part) => part.sourceId), false);
});

test('explicit job metadata disambiguates identical titles and is hidden', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const parts = context.assistantInlineParts(`Engineer (job_id: ${id}; citation: [job:${id}])`, [{ sourceType: 'JOB', sourceId: id, label: 'Engineer' }, { sourceType: 'JOB', sourceId: 'other', label: 'Engineer' }]);
  assert.equal(parts.find((part) => part.sourceId)?.sourceId, id);
  assert.equal(parts.map((part) => part.text).join(''), 'Engineer');
});

function attributes(tag) {
  const matches = [];
  function visit(node) {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(ast) === tag) {
      matches.push(Object.fromEntries(node.attributes.properties.filter(ts.isJsxAttribute).map((attribute) => [attribute.name.getText(ast), attribute.initializer?.getText(ast)])));
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return matches;
}

test('composer supports multiline input without submitting during IME composition', () => {
  const [composer] = attributes('textarea');
  assert.equal(composer.id, '"assistant-question"');
  assert.match(composer.onKeyDown, /event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing/);
  assert.match(composer.onKeyDown, /event.preventDefault\(\)/);
  assert.match(composer.disabled, /isLoading.*hasConsent.*session/);
});

test('launcher, disclosure and conversation expose accessible relationships', () => {
  const buttons = attributes('button');
  assert.ok(buttons.some((button) => button['aria-controls'] === '"candidate-assistant"' && button['aria-expanded'] === '{isOpen}'));
  assert.ok(buttons.some((button) => button['aria-controls'] === '"assistant-context"' && button['aria-expanded'] === '{showContext}'));
  assert.ok(attributes('div').some((element) => element.role === '"log"' && element['aria-label']));
  assert.ok(attributes('div').some((element) => element.role === '"alert"'));
  assert.match(source, /launcherRef.current\?\.focus\(\)/);
  assert.match(source, /event.key === "Escape"/);
});

test('settled requests restore focus only in the open panel when document focus is unclaimed (structural)', () => {
  const effects = [];
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect') {
      effects.push(node.getText(ast));
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  const effect = effects.find((text) => text.includes('const requestSettled'));
  assert.ok(effect);
  assert.match(effect, /wasLoadingRef.current && !isLoading/);
  assert.match(effect, /wasLoadingRef.current = isLoading/);
  assert.match(effect, /requestSettled &&\s*isOpen &&\s*document.hasFocus\(\) &&\s*\(!document.activeElement \|\| document.activeElement === document.body\)/);
  assert.match(effect, /inputRef.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(effect, /\[isLoading, isOpen\]/);
  assert.match(source, /finally\s*\{\s*if \(identityRef.current === requestIdentity\) setIsLoading\(false\)/);
});

const provenanceSource = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'AssistantMessageProvenance').getText(ast);
const provenanceContext = vm.createContext({ React });
vm.runInContext(ts.transpileModule(provenanceSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText, provenanceContext);
const renderProvenance = (message) => renderToStaticMarkup(React.createElement(provenanceContext.AssistantMessageProvenance, { metadata: message.generationMetadata }));

test('successful and repaired LLM messages use authoritative provenance without a degraded warning', () => {
  const markup = renderProvenance({ generationMetadata: { source: 'llm', fallbackReason: null }, degraded: true });
  assert.match(markup, /Nội dung do AI tạo/);
  assert.doesNotMatch(markup, /Phản hồi dự phòng|degraded|details/);
  assert.doesNotMatch(source, /setDegraded|Chế độ degraded/);
  assert.match(source, /generationMetadata: assistant.generationMetadata \?\? null/);
  assert.match(source, /item.role === "ASSISTANT" && <AssistantMessageProvenance metadata=\{item.generationMetadata\}/);
});

test('fallback history metadata has safe readable reasons in a keyboard-accessible disclosure', () => {
  const reasons = ['provider_error', 'validation_error', 'locale_mismatch', 'insufficient_evidence', 'empty_answer', null];
  for (const fallbackReason of reasons) {
    const historyItem = { role: 'ASSISTANT', generationMetadata: { source: 'deterministic_fallback', fallbackReason } };
    const markup = renderProvenance(historyItem);
    assert.match(markup, /<details/);
    assert.match(markup, /<summary[^>]*>Phản hồi dự phòng<\/summary>/);
    assert.match(markup, /<p>[^<]+<\/p>/);
    assert.doesNotMatch(markup, /Nội dung do AI tạo|provider_error|validation_error|locale_mismatch|insufficient_evidence|empty_answer/);
  }
});

test('legacy history with null or absent metadata stays unknown', () => {
  assert.equal(renderProvenance({ generationMetadata: null }), '');
  assert.equal(renderProvenance({}), '');
});
