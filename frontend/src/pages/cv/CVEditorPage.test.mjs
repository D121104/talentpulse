import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import { Buffer } from 'node:buffer';
import ts from 'typescript';

const source = await readFile(new URL('./CVEditorPage.tsx', import.meta.url), 'utf8');
const banner = source.slice(source.indexOf('{generationMode === "EDITOR_ONLY" && ('), source.indexOf('{/* ================= IN-PLACE A4 PAPER CANVAS'));

test('source contract: review details start collapsed with an accessible, non-submitting toggle', () => {
  assert.match(source, /\[showGenerationWarnings, setShowGenerationWarnings\] = useState\(false\)/);
  assert.match(banner, /type="button"/);
  assert.match(banner, /aria-expanded=\{showGenerationWarnings\}/);
  assert.match(banner, /aria-controls="cv-generation-warning-details"/);
  assert.match(banner, /id="cv-generation-warning-details" hidden=\{!showGenerationWarnings\}/);
  assert.match(banner, /setShowGenerationWarnings\(\(shown\) => !shown\)/);
  assert.match(banner, /visibleGenerationWarnings\.map/);
  assert.doesNotMatch(banner, /aria-live|role="status"/);
});

test('source contract: fallback summary stays outside collapsed details and degraded drafts stay warnings', () => {
  const summary = banner.split('{hasActionableGenerationWarnings && (')[0];
  assert.match(summary, /generationProvenance === "mixed"/);
  assert.match(summary, /generationProvenance === "fallback"/);
  assert.match(summary, /nội dung dự phòng từ hồ sơ/);
  assert.match(summary, /CV draft needs review/);
  assert.match(source, /const hasGenerationBannerWarning =[\s\S]*?generationStatus === "DEGRADED"/);
});

const normalizationSource = await readFile(new URL('../../lib/cvWarningNormalization.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(normalizationSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { normalizeCvGenerationWarnings } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('mixed provenance retains unique review actions without exposing diagnostic payloads', () => {
  const result = normalizeCvGenerationWarnings([
    'cv_generation.provenance=provider',
    'cv_generation.provenance=fallback',
    'insufficient source evidence',
    'insufficient source evidence',
    'review contact information',
    'cv_generation.diagnostic=private_internal_reason',
  ], 'DEGRADED', 'vi-VN');
  assert.equal(result.provenance, 'mixed');
  assert.equal(result.messages.length, 2);
  assert.match(result.messages[0], /Chưa đủ dữ kiện/);
  assert.match(result.messages[1], /thông tin liên hệ/);
  assert.doesNotMatch(result.messages.join(' '), /cv_generation|private_internal_reason/);
  assert.deepEqual(normalizeCvGenerationWarnings([], 'COMPLETE', 'en-US'), { provenance: 'ai', messages: [] });
});

test('UI locale controls banner, modal and status independently of CV content locale', () => {
  assert.match(source, /useTranslation\(\)/);
  assert.match(source, /i18n\.resolvedLanguage \|\| i18n\.language/);
  assert.match(source, /normalizeCvGenerationWarnings\(\s*generationWarnings,\s*generationStatus,\s*uiLocale/);
  assert.doesNotMatch(banner, /cvLanguage|cvLocale/);
  const modal = source.slice(source.indexOf('{showAiModal && ('));
  assert.match(modal, /uiVi \? "Tạo CV bằng AI" : "Create a CV with AI"/);
  assert.doesNotMatch(modal, /cvLanguage|cvLocale/);
  assert.match(source, /locale=\{cvLocale\}/);
  assert.match(source, /const localeLabels = CV_TEMPLATE_LABELS\[cvLocale\]/);
  // Errors are retained as codes, so an existing failure re-translates on a UI locale switch.
  assert.match(source, /localizedGenerationStatus\(generationErrorStatus, uiLocale\)/);
  assert.doesNotMatch(source, /setGenerationError\(localizedGenerationStatus/);
});

test('both UI languages localize warnings and omissions without rendering provider payloads', () => {
  const warnings = ['insufficient source evidence', 'cv_generation.localization_omission=private_field', 'unexpected provider text'];
  for (const status of ['COMPLETE', 'DEGRADED', 'NO_EVIDENCE']) {
    const vi = normalizeCvGenerationWarnings(warnings, status, 'vi-VN');
    const en = normalizeCvGenerationWarnings(warnings, status, 'en-US');
    assert.match(vi.messages.join(' '), /Chưa đủ dữ kiện.*bỏ qua.*rà soát/);
    assert.match(en.messages.join(' '), /source evidence.*omitted.*Review the CV/);
    assert.doesNotMatch([...vi.messages, ...en.messages].join(' '), /private_field|unexpected provider text|cv_generation/);
  }
});

const statusSource = source.slice(source.indexOf('const localizedGenerationStatus ='), source.indexOf('const normalizeGenerationMode ='));
const statusModule = ts.transpileModule(`${statusSource}\nexport { localizedGenerationStatus };`, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { localizedGenerationStatus } = await import(`data:text/javascript;base64,${Buffer.from(statusModule).toString('base64')}`);

test('generation statuses retranslate from retained status codes in both directions', () => {
  for (const status of ['QUEUED', 'PROCESSING', 'CANCEL_REQUESTED', 'COMPLETE', 'DEGRADED', 'STALE', 'FAILED', 'CANCELLED']) {
    const vi = localizedGenerationStatus(status, 'vi-VN');
    const en = localizedGenerationStatus(status, 'en-US');
    assert.notEqual(vi, en);
    assert.match(vi, /[à-ỹ]/);
    assert.doesNotMatch(en, /[à-ỹ]/);
    assert.equal(localizedGenerationStatus(status, 'vi-VN'), vi);
  }
  assert.equal(localizedGenerationStatus('UNKNOWN', 'en-US'), localizedGenerationStatus('FAILED', 'en-US'));
  assert.doesNotMatch(localizedGenerationStatus('FAILED', 'en-US'), /ready/);
});

test('career profile generation request keeps selected CV locale and notifications read current UI locale', async () => {
  const career = await readFile(new URL('./CareerProfilePage.tsx', import.meta.url), 'utf8');
  assert.match(career, /locale: generationLocale/);
  assert.match(career, /toast.success\(generationCopy\('Đã tiếp nhận yêu cầu tạo CV AI', 'AI CV request accepted'\)\)/);
  assert.match(career, /generationCopy\('Không thể tạo CV AI', 'Could not create AI CV'\)/);
  assert.match(career, /const generationCopy =[\s\S]*?i18n.resolvedLanguage \|\| i18n.language/);
});

test('pending saves read current UI locale for failures and delayed success, including save-before-generation', async () => {
  const copy = source.slice(source.indexOf('const saveCopy ='), source.indexOf('const localeLabels ='));
  const persist = source.slice(source.indexOf('const persistCv ='), source.indexOf('const handleSaveCV ='));
  const compiled = ts.transpileModule(`${copy}\n${persist}\nreturn persistCv;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  for (const [initial, target] of [['vi', 'en'], ['en', 'vi']]) {
    for (const outcome of ['failure', 'success']) {
      for (const redirect of [false, true]) {
        const i18n = { language: initial, resolvedLanguage: initial };
        let settle;
        const saved = new Promise((resolve, reject) => { settle = outcome === 'success' ? resolve : reject; });
        const events = [];
        const timers = [];
        const noop = () => {};
        const env = {
          i18n, uiVi: initial === 'vi', salaryValid: true, fullName: 'Test', title: 'Draft',
          generationMode: 'MANUAL', editorCvId: 'cv', isNew: false, id: 'cv', accessToken: 'fixture',
          contentVersionRef: { current: 1 }, buildCvPayload: () => ({ locale: 'en-US' }),
          onlineCvApi: { update: () => saved }, generationRequestContextIsCurrent: () => true,
          setIsSaving: noop, setEditorCvId: noop, setContentVersion: noop, setGenerationMode: noop, setIsDirty: noop,
          toast: { error: (...args) => events.push(args.join(' ')) },
          setTimeout: (fn) => timers.push(fn), navigate: (_path, options) => events.push(JSON.stringify(options.state.toast)),
        };
        const run = new Function(...Object.keys(env), compiled)(...Object.values(env));
        const pending = run(redirect);
        i18n.language = i18n.resolvedLanguage = target;
        settle(outcome === 'success' ? { _id: 'cv', contentVersion: 2 } : new Error('fixture failure'));
        await pending;
        timers.forEach((fn) => fn());
        if (outcome === 'failure' || redirect) {
          assert.equal(events.length, 1);
          assert.match(events[0], target === 'en' ? /Could not save CV|CV updated/ : /Lỗi khi lưu CV|Đã cập nhật CV/);
        } else assert.deepEqual(events, []);
      }
    }
  }
});

test('career generation pending and retained save errors use reactive locale and stable codes', async () => {
  const career = await readFile(new URL('./CareerProfilePage.tsx', import.meta.url), 'utf8');
  assert.match(career, /useState<GenerationSaveErrorCode \| null>\(null\)/);
  assert.match(career, /GENERATION_SAVE_ERRORS\[generationSaveError\]\[uiVi \? 0 : 1\]/);
  assert.match(career, /isGenerating \? \(isSaving \?/);
  assert.match(career, /'Creating CV…'/);
  assert.match(career, /generationSaveErrorText \|\| \(isGenerating/);
  assert.doesNotMatch(career, /setSaveError\(error.message\)/);
});
