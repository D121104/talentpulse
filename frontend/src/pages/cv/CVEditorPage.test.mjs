import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";
import { Buffer } from "node:buffer";
import ts from "typescript";

const source = await readFile(
  new URL("./CVEditorPage.tsx", import.meta.url),
  "utf8",
);
const banner = source.slice(
  source.indexOf('{generationMode === "EDITOR_ONLY" && ('),
  source.indexOf("{/* ================= IN-PLACE A4 PAPER CANVAS"),
);

test("source contract: review details start collapsed with an accessible, non-submitting toggle", () => {
  assert.match(
    source,
    /\[showGenerationWarnings, setShowGenerationWarnings\] = useState\(false\)/,
  );
  assert.match(banner, /type="button"/);
  assert.match(banner, /aria-expanded=\{showGenerationWarnings\}/);
  assert.match(banner, /aria-controls="cv-generation-warning-details"/);
  assert.match(
    banner,
    /id="cv-generation-warning-details"\s+hidden=\{!showGenerationWarnings\}/,
  );
  assert.match(banner, /setShowGenerationWarnings\(\(shown\) => !shown\)/);
  assert.match(banner, /visibleGenerationWarnings\.map/);
  assert.doesNotMatch(banner, /aria-live|role="status"/);
});

test("source contract: fallback summary stays outside collapsed details and degraded drafts stay warnings", () => {
  const summary = banner.split("{hasActionableGenerationWarnings && (")[0];
  assert.match(summary, /generationProvenance === "mixed"/);
  assert.match(summary, /generationProvenance === "fallback"/);
  assert.match(summary, /nội dung dự phòng từ hồ sơ/);
  assert.match(summary, /CV draft needs review/);
  assert.match(
    source,
    /const hasGenerationBannerWarning =[\s\S]*?generationStatus === "DEGRADED"/,
  );
});

const normalizationSource = await readFile(
  new URL("../../lib/cvWarningNormalization.ts", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(normalizationSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
});
const { normalizeCvGenerationWarnings } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

test("mixed provenance retains unique review actions without exposing diagnostic payloads", () => {
  const result = normalizeCvGenerationWarnings(
    [
      "cv_generation.provenance=provider",
      "cv_generation.provenance=fallback",
      "insufficient source evidence",
      "insufficient source evidence",
      "review contact information",
      "cv_generation.diagnostic=private_internal_reason",
    ],
    "DEGRADED",
    "vi-VN",
  );
  assert.equal(result.provenance, "mixed");
  assert.equal(result.messages.length, 2);
  assert.match(result.messages[0], /Chưa đủ dữ kiện/);
  assert.match(result.messages[1], /thông tin liên hệ/);
  assert.doesNotMatch(
    result.messages.join(" "),
    /cv_generation|private_internal_reason/,
  );
  assert.deepEqual(normalizeCvGenerationWarnings([], "COMPLETE", "en-US"), {
    provenance: "ai",
    messages: [],
  });
});

test("UI locale controls banner, modal and status independently of CV content locale", () => {
  assert.match(source, /useTranslation\(\)/);
  assert.match(source, /i18n\.resolvedLanguage \|\| i18n\.language/);
  assert.match(
    source,
    /normalizeCvGenerationWarnings\(\s*generationWarnings,\s*generationStatus,\s*uiLocale/,
  );
  assert.doesNotMatch(banner, /cvLanguage|cvLocale/);
  const modal = source.slice(source.indexOf("{showAiModal && ("));
  assert.match(modal, /uiVi \? "Tạo CV bằng AI" : "Create a CV with AI"/);
  assert.doesNotMatch(modal, /cvLanguage|cvLocale/);
  assert.match(source, /locale=\{cvLocale\}/);
  assert.match(source, /const localeLabels = CV_TEMPLATE_LABELS\[cvLocale\]/);
  // Errors are retained as codes, so an existing failure re-translates on a UI locale switch.
  assert.match(
    source,
    /localizedGenerationStatus\(generationErrorStatus, uiLocale\)/,
  );
  assert.doesNotMatch(source, /setGenerationError\(localizedGenerationStatus/);
});

test("both UI languages localize warnings and omissions without rendering provider payloads", () => {
  const warnings = [
    "insufficient source evidence",
    "cv_generation.localization_omission=private_field",
    "unexpected provider text",
  ];
  for (const status of ["COMPLETE", "DEGRADED", "NO_EVIDENCE"]) {
    const vi = normalizeCvGenerationWarnings(warnings, status, "vi-VN");
    const en = normalizeCvGenerationWarnings(warnings, status, "en-US");
    assert.match(vi.messages.join(" "), /Chưa đủ dữ kiện.*bỏ qua.*rà soát/);
    assert.match(
      en.messages.join(" "),
      /source evidence.*omitted.*Review the CV/,
    );
    assert.doesNotMatch(
      [...vi.messages, ...en.messages].join(" "),
      /private_field|unexpected provider text|cv_generation/,
    );
  }
});

async function existingCvRegenerationFixture() {
  const types = await readFile(
    new URL("../../lib/cvTypes.ts", import.meta.url),
    "utf8",
  );
  const typesModule = ts.transpileModule(types, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const { filterMeaningfulCvEntries } = await import(
    `data:text/javascript;base64,${Buffer.from(typesModule).toString("base64")}`
  );
  const helpers = source.slice(
    source.indexOf("const asRecord ="),
    source.indexOf("export default function CVEditorPage"),
  );
  const apply = source.slice(
    source.indexOf("  const applyGeneratedDraft ="),
    source.indexOf("  const clearGenerationTimer ="),
  );
  const terminal = source.slice(
    source.indexOf("  const applyTerminalGenerationResult ="),
    source.indexOf("  const scheduleGenerationPoll ="),
  );
  const persist = source.slice(
    source.indexOf("  const persistCv ="),
    source.indexOf("  const handleSaveCV ="),
  );
  const copy = source.slice(
    source.indexOf("const saveCopy ="),
    source.indexOf("const localeLabels ="),
  );
  const compiled = ts.transpileModule(
    `${helpers}\n${copy}\n${apply}\n${terminal}\n${persist}\nreturn { applyGeneratedDraft, applyTerminalGenerationResult, persistCv };`,
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.None,
      },
    },
  ).outputText;
  const canonical = {
    _id: "existing-cv",
    title: "Saved source CV",
    fullName: "Synthetic Candidate",
    careerObjective: "Original saved objective",
    contentVersion: 8,
    isPrimary: true,
    isSearchable: false,
  };
  const before = globalThis.structuredClone(canonical);
  const writes = [];
  const notifications = [];
  const state = {
    ...canonical,
    editorCvId: canonical._id,
    id: canonical._id,
    isNew: false,
    isTitleManual: true,
    generationMode: "MANUAL",
    hasPendingGeneration: false,
    pendingApproval: null,
    visibleSections: {},
    draftRevision: 0,
    salaryValid: true,
    accessToken: "synthetic-token",
    uiVi: false,
    i18n: { language: "en", resolvedLanguage: "en" },
    contentVersionRef: { current: 8 },
    pollingStoppedRef: { current: false },
    pollingOperationRef: { current: "regeneration-operation" },
    generationAbortRef: { current: null },
    generationContextIsCurrent: () => true,
    generationRequestContextIsCurrent: () => true,
    filterMeaningfulCvEntries,
    markDirty: () =>
      assert.fail(
        "Agent regeneration must not take the legacy dirty/save path",
      ),
    toast: { error: (...args) => notifications.push(args) },
    setTimeout: () => {},
    navigate: () => {},
  };
  for (const name of [
    "HasPendingGeneration",
    "PendingApproval",
    "PendingReviewMetadata",
    "IsDiscardingDraft",
    "GenerationError",
    "CvLanguage",
    "Title",
    "FullName",
    "Position",
    "Phone",
    "Email",
    "Link",
    "Address",
    "CareerObjective",
    "Education",
    "WorkExperience",
    "Skills",
    "Activities",
    "Projects",
    "Certificates",
    "Awards",
    "SectionOrder",
    "FontFamilyId",
    "ThemeColorId",
    "FontSize",
    "LineSpacing",
    "VisibleSections",
    "GenerationMode",
    "ContentVersion",
    "GenerationWarnings",
    "ShowGenerationWarnings",
    "GenerationStatus",
    "IsDirty",
    "DraftRevision",
    "IsSaving",
    "EditorCvId",
  ]) {
    const key = name[0].toLowerCase() + name.slice(1);
    state[`set${name}`] = (value) => {
      state[key] = typeof value === "function" ? value(state[key]) : value;
    };
  }
  state.buildCvPayload = () => ({
    fullName: state.fullName,
    title: state.title,
    careerObjective: state.careerObjective,
  });
  state.onlineCvApi = {
    findOne: async () => globalThis.structuredClone(canonical),
    create: () =>
      assert.fail("Regeneration must retain the existing destination CV"),
    update: async (id, payload, token) => {
      writes.push({ id, payload: globalThis.structuredClone(payload), token });
      assert.deepEqual(payload.generationApproval, {
        operationId: "regeneration-operation",
        draftHash: "b".repeat(64),
      });
      assert.equal(payload.expectedContentVersion, before.contentVersion);
      const content = { ...payload };
      delete content.generationApproval;
      delete content.expectedContentVersion;
      Object.assign(canonical, content, {
        contentVersion: before.contentVersion + 1,
      });
      return globalThis.structuredClone(canonical);
    },
  };
  const handlers = new Function("state", `with (state) { ${compiled} }`)(state);
  return { canonical, before, state, handlers, writes, notifications };
}

for (const delivery of ["sync", "async"]) {
  test(`existing-CV ${delivery} regeneration keeps current source separate until explicit T012 approval`, async () => {
    const { canonical, before, state, handlers, writes, notifications } =
      await existingCvRegenerationFixture();
    const response = {
      operationId: "regeneration-operation",
      reviewStatus: "PENDING",
      draftHash: "b".repeat(64),
      status: "COMPLETE",
      contentVersion: 8,
      current: globalThis.structuredClone(canonical),
      draft: {
        title: "Agent pending CV",
        full_name: "Synthetic Candidate",
        career_objective: "New pending objective",
      },
      warnings: [],
      locale: "en-US",
    };
    if (delivery === "sync") handlers.applyGeneratedDraft(response);
    else await handlers.applyTerminalGenerationResult(response, canonical._id);
    assert.equal(state.title, "Agent pending CV");
    assert.equal(state.careerObjective, "New pending objective");
    assert.equal(state.hasPendingGeneration, true);
    assert.equal(state.generationMode, "EDITOR_ONLY");
    assert.equal(state.isDirty, true);
    assert.equal(state.showGenerationWarnings, true);
    assert.match(
      banner,
      /hasPendingGeneration &&[\s\S]*This draft is not saved/,
    );
    assert.deepEqual(
      response.current,
      before,
      "The current response is source content, not the generated draft",
    );
    assert.deepEqual(canonical, before);
    assert.deepEqual(writes, []);
    assert.deepEqual(
      notifications,
      [],
      "Receiving source/current must not announce a new save",
    );
    const approval = state.pendingApproval;
    state.pendingApproval = null;
    assert.equal(await handlers.persistCv(true), null);
    state.pendingApproval = approval;
    assert.equal(
      await handlers.persistCv(false),
      null,
      "Autosave/save-before-generation cannot approve",
    );
    assert.deepEqual(writes, []);
    assert.deepEqual(canonical, before);
    assert.equal(await handlers.persistCv(true), before._id);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].id, before._id);
    assert.equal(writes[0].payload.title, "Agent pending CV");
    assert.equal(writes[0].payload.careerObjective, "New pending objective");
    assert.equal(canonical.contentVersion, 9);
    assert.equal(canonical.isPrimary, before.isPrimary);
    assert.equal(canonical.isSearchable, before.isSearchable);
    assert.equal(state.hasPendingGeneration, false);
    assert.equal(state.pendingApproval, null);
  });
}

test("existing-CV terminal result without pending draft cannot relabel current source as generated content", async () => {
  const { canonical, before, state, handlers, writes, notifications } =
    await existingCvRegenerationFixture();
  state.pendingApproval = {
    operationId: "stale-operation",
    draftHash: "a".repeat(64),
  };
  await handlers.applyTerminalGenerationResult(
    {
      operationId: "regeneration-operation",
      status: "COMPLETE",
      reviewStatus: "PENDING",
      draftHash: "b".repeat(64),
      contentVersion: 8,
      current: globalThis.structuredClone(canonical),
    },
    canonical._id,
  );
  assert.equal(state.title, before.title);
  assert.equal(state.careerObjective, before.careerObjective);
  assert.equal(
    state.generationError,
    "FAILED",
    "Missing Agent draft must remain an actionable failure, not a completed generated CV",
  );
  assert.equal(state.pendingApproval, null);
  assert.equal(await handlers.persistCv(true), null);
  assert.deepEqual(canonical, before);
  assert.deepEqual(writes, []);
  assert.deepEqual(notifications, []);
});

const statusSource = source.slice(
  source.indexOf("const localizedGenerationStatus ="),
  source.indexOf("const normalizeGenerationMode ="),
);
const statusModule = ts.transpileModule(
  `${statusSource}\nexport { localizedGenerationStatus };`,
  {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const { localizedGenerationStatus } = await import(
  `data:text/javascript;base64,${Buffer.from(statusModule).toString("base64")}`
);

test("generation statuses retranslate from retained status codes in both directions", () => {
  for (const status of [
    "QUEUED",
    "PROCESSING",
    "CANCEL_REQUESTED",
    "COMPLETE",
    "DEGRADED",
    "STALE",
    "FAILED",
    "CANCELLED",
  ]) {
    const vi = localizedGenerationStatus(status, "vi-VN");
    const en = localizedGenerationStatus(status, "en-US");
    assert.notEqual(vi, en);
    assert.match(vi, /[à-ỹ]/);
    assert.doesNotMatch(en, /[à-ỹ]/);
    assert.equal(localizedGenerationStatus(status, "vi-VN"), vi);
  }
  assert.equal(
    localizedGenerationStatus("UNKNOWN", "en-US"),
    localizedGenerationStatus("FAILED", "en-US"),
  );
  assert.doesNotMatch(localizedGenerationStatus("FAILED", "en-US"), /ready/);
});

test("career profile generation request keeps selected CV locale and notifications read current UI locale", async () => {
  const career = await readFile(
    new URL("./CareerProfilePage.tsx", import.meta.url),
    "utf8",
  );
  assert.match(career, /locale: generationLocale/);
  assert.match(
    career,
    /toast.success\(generationCopy\('Đã tiếp nhận yêu cầu tạo CV AI', 'AI CV request accepted'\)\)/,
  );
  assert.match(
    career,
    /generationCopy\('Không thể tạo CV AI', 'Could not create AI CV'\)/,
  );
  assert.match(
    career,
    /const generationCopy =[\s\S]*?i18n.resolvedLanguage \|\| i18n.language/,
  );
});

test("pending saves read current UI locale for failures and delayed success, including save-before-generation", async () => {
  const copy = source.slice(
    source.indexOf("const saveCopy ="),
    source.indexOf("const localeLabels ="),
  );
  const autosave = source.slice(
    source.lastIndexOf(
      "  useEffect(",
      source.indexOf("      hasPendingGeneration ||"),
    ),
    source.indexOf("  const applyGeneratedDraft ="),
  );
  assert.match(
    autosave,
    /hasPendingGeneration \|\|[\s\S]*?return;/,
    "Pending local edits must bypass the autosave API path",
  );
  const persist = source.slice(
    source.indexOf("const persistCv ="),
    source.indexOf("const handleSaveCV ="),
  );
  const compiled = ts.transpileModule(
    `${copy}\n${persist}\nreturn persistCv;`,
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.None,
      },
    },
  ).outputText;
  for (const [initial, target] of [
    ["vi", "en"],
    ["en", "vi"],
  ]) {
    for (const outcome of ["failure", "success"]) {
      for (const redirect of [false, true]) {
        const i18n = { language: initial, resolvedLanguage: initial };
        let settle;
        const saved = new Promise((resolve, reject) => {
          settle = outcome === "success" ? resolve : reject;
        });
        const events = [];
        const timers = [];
        const noop = () => {};
        const env = {
          i18n,
          uiVi: initial === "vi",
          salaryValid: true,
          fullName: "Test",
          title: "Draft",
          generationMode: "MANUAL",
          editorCvId: "cv",
          isNew: false,
          id: "cv",
          accessToken: "fixture",
          hasPendingGeneration: false,
          pendingApproval: null,
          contentVersionRef: { current: 1 },
          buildCvPayload: () => ({ locale: "en-US" }),
          onlineCvApi: { update: () => saved },
          generationRequestContextIsCurrent: () => true,
          setIsSaving: noop,
          setEditorCvId: noop,
          setContentVersion: noop,
          setGenerationMode: noop,
          setIsDirty: noop,
          setPendingApproval: noop,
          setHasPendingGeneration: noop,
          toast: { error: (...args) => events.push(args.join(" ")) },
          setTimeout: (fn) => timers.push(fn),
          navigate: (_path, options) =>
            events.push(JSON.stringify(options.state.toast)),
        };
        const run = new Function(...Object.keys(env), compiled)(
          ...Object.values(env),
        );
        const pending = run(redirect);
        i18n.language = i18n.resolvedLanguage = target;
        settle(
          outcome === "success"
            ? { _id: "cv", contentVersion: 2 }
            : new Error("fixture failure"),
        );
        await pending;
        timers.forEach((fn) => fn());
        if (outcome === "failure" || redirect) {
          assert.equal(events.length, 1);
          assert.match(
            events[0],
            target === "en"
              ? /Could not save CV|CV updated/
              : /Lỗi khi lưu CV|Đã cập nhật CV/,
          );
        } else assert.deepEqual(events, []);
      }
    }
  }
});

const reviewFixture = (overrides = {}) => ({
  operationId: "regeneration-operation",
  reviewStatus: "PENDING",
  draftHash: "b".repeat(64),
  status: "DEGRADED",
  contentVersion: 8,
  locale: "en-US",
  warnings: [],
  draft: {
    title: "Review CV",
    full_name: "Synthetic Candidate",
    career_objective: "Validated objective",
    skills: ["TypeScript"],
  },
  reviewMetadata: {
    fieldOriginsByPath: {
      "/full_name": "SOURCE",
      "/position": "LOCALIZED",
      "/career_objective": "AI_SUGGESTED",
      "/skills/0/name": "FALLBACK",
    },
    omissionsByPath: [
      { path: "/projects/1/bullets", reasonCode: "INSUFFICIENT_EVIDENCE" },
    ],
  },
  ...overrides,
});

test("T032: conflicting Save preserves local review and never retries with force", async () => {
  const { state, handlers, canonical, before } =
    await existingCvRegenerationFixture();
  handlers.applyGeneratedDraft(reviewFixture());
  state.setCareerObjective("Unsaved human review");
  const proof = JSON.parse(JSON.stringify(state.pendingApproval));
  const calls = [];
  state.onlineCvApi.update = async (...args) => {
    calls.push(args);
    throw Object.assign(new Error("Synthetic review conflict"), {
      status: 409,
    });
  };
  assert.equal(await handlers.persistCv(true), null);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][1].generationApproval, proof);
  assert.equal(calls[0][1].expectedContentVersion, 8);
  assert.equal(calls[0][1].force, undefined);
  assert.equal(state.careerObjective, "Unsaved human review");
  assert.equal(state.hasPendingGeneration, true);
  assert.deepEqual(state.pendingApproval, proof);
  assert.deepEqual(canonical, before);
});

test("T032: Reject calls discard with original review ID, clears review only after success, and never saves", async () => {
  const { state, handlers, writes, canonical, before } =
    await existingCvRegenerationFixture();
  handlers.applyGeneratedDraft(reviewFixture());
  const calls = [];
  let reject = true;
  state.isDiscardingDraft = false;
  state.onlineCvApi.discardGenerationDraft = async (...args) => {
    calls.push(args);
    if (reject) throw new Error("Synthetic discard conflict");
  };
  state.toast.success = () => {};
  let reloads = 0;
  state.window = {
    location: {
      reload: () => {
        reloads += 1;
      },
    },
  };
  const discardSource = source.slice(
    source.indexOf("  const handleDiscardPendingDraft ="),
    source.indexOf("  const scheduleGenerationPoll ="),
  );
  const compiled = ts.transpileModule(
    `${discardSource}\nreturn handleDiscardPendingDraft;`,
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.None,
      },
    },
  ).outputText;
  const discard = new Function("state", `with (state) { ${compiled} }`)(state);
  const proof = JSON.parse(JSON.stringify(state.pendingApproval));
  await discard();
  assert.deepEqual(state.pendingApproval, proof);
  assert.equal(state.hasPendingGeneration, true);
  assert.equal(reloads, 0);
  reject = false;
  await discard();
  assert.deepEqual(
    calls,
    Array(2).fill(["existing-cv", "regeneration-operation", "synthetic-token"]),
  );
  assert.equal(state.pendingApproval, null);
  assert.equal(state.pendingReviewMetadata, null);
  assert.equal(state.hasPendingGeneration, false);
  assert.equal(reloads, 1);
  assert.deepEqual(writes, []);
  assert.deepEqual(canonical, before);
});

test("T028: pending local edits remain local and explicit Save carries the original review proof", async () => {
  const { state, handlers, canonical, before, writes } =
    await existingCvRegenerationFixture();
  handlers.applyGeneratedDraft(reviewFixture());
  const proof = globalThis.structuredClone(state.pendingApproval);
  state.setCareerObjective("Locally reviewed objective");
  state.setTitle("Locally reviewed title");
  assert.equal(await handlers.persistCv(false), null);
  assert.deepEqual(writes, []);
  assert.deepEqual(canonical, before);
  assert.deepEqual(state.pendingApproval, proof);
  assert.equal(state.hasPendingGeneration, true);
  await handlers.persistCv(true);
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].payload.generationApproval, proof);
  assert.equal(writes[0].payload.expectedContentVersion, 8);
  assert.equal(writes[0].payload.careerObjective, "Locally reviewed objective");
  assert.equal(writes[0].payload.title, "Locally reviewed title");
});

test("T028 source contract: review banner omits per-field regeneration controls", () => {
  const banner = source.slice(
    source.indexOf('{generationMode === "EDITOR_ONLY" && ('),
    source.indexOf("{/* ================= IN-PLACE A4 PAPER CANVAS"),
  );
  assert.doesNotMatch(banner, /fieldOriginsByPath/);
  assert.doesNotMatch(banner, /Tạo lại mục này|Regenerate this item/);
  assert.match(banner, /omissionsByPath/);
  assert.match(banner, /handleDiscardPendingDraft/);
});

test("T028 source contract: omission details expose localized paths and safe reasons in both UI languages", () => {
  assert.match(source, /omissionsByPath/, "Display precise omitted fields");
  for (const code of [
    "SOURCE_UNAVAILABLE",
    "INSUFFICIENT_EVIDENCE",
    "STRUCTURE_INVALID",
    "LOCALIZATION_FAILED",
  ]) {
    assert.match(
      source,
      new RegExp(`${code}[\\s\\S]{0,400}?[à-ỹ]`),
      `Vietnamese ${code} explanation`,
    );
    assert.match(
      source,
      new RegExp(`${code}[\\s\\S]{0,400}?[A-Za-z]{3}`),
      `English ${code} explanation`,
    );
  }
  assert.match(
    source,
    /omissionsByPath[\s\S]*?\.path/,
    "Show which field was omitted",
  );
  assert.match(
    source,
    /omissionsByPath[\s\S]*?reasonCode/,
    "Translate safe reason code",
  );
});

test("T028 source contract: reject/discard is a distinct explicit action, not Save or cancellation", () => {
  assert.match(
    source,
    /onlineCvApi\.discardGenerationDraft\(/,
    "Call owner-authorized discard endpoint",
  );
  assert.match(
    source,
    /<(?:button|Button)\b[^>]*onClick=\{[^}]*(?:[Dd]iscard|[Rr]eject)/,
    "Expose an explicit discard action",
  );
  assert.match(source, /(?:Bỏ bản nháp|Từ chối)/);
  assert.match(source, /(?:Discard draft|Reject draft)/);
});

test("T028 source contract: selected regeneration is not exposed in the editor UI", () => {
  assert.doesNotMatch(source, /regenerateSelectedItem/);
  assert.doesNotMatch(source, /Tạo lại mục này|Regenerate this item/);
});

test("T028: safe partial draft displays only retained content, never resurrecting omitted saved content", async () => {
  const { state, handlers, canonical, before, writes } =
    await existingCvRegenerationFixture();
  state.projects = [
    { name: "Old saved project", description: "Must not reappear" },
  ];
  handlers.applyGeneratedDraft(reviewFixture());
  assert.equal(state.careerObjective, "Validated objective");
  assert.deepEqual(state.skills, [{ name: "TypeScript" }]);
  assert.deepEqual(state.projects, []);
  assert.equal(state.generationStatus, "DEGRADED");
  assert.equal(state.showGenerationWarnings, true);
  assert.equal(state.hasPendingGeneration, true);
  assert.deepEqual(writes, []);
  assert.deepEqual(canonical, before);
});

test("T028: selected-item result preserves unselected locally edited content", async () => {
  const { state, handlers, canonical, before, writes } =
    await existingCvRegenerationFixture();
  handlers.applyGeneratedDraft(reviewFixture());
  state.setCareerObjective("Unselected local objective");
  state.setSkills([{ name: "Unselected local skill" }]);
  state.setProjects([{ name: "Unselected local project" }]);
  await handlers.applyTerminalGenerationResult(
    reviewFixture({
      draftHash: "c".repeat(64),
      regenerationTarget: {
        reviewOperationId: "regeneration-operation",
        expectedDraftHash: "b".repeat(64),
        targetPath: "/position",
      },
      draft: { ...reviewFixture().draft, position: "Regenerated position" },
    }),
    canonical._id,
  );
  assert.equal(state.position, "Regenerated position");
  assert.equal(state.careerObjective, "Unselected local objective");
  assert.deepEqual(state.skills, [{ name: "Unselected local skill" }]);
  assert.deepEqual(state.projects, [{ name: "Unselected local project" }]);
  assert.equal(state.pendingApproval.draftHash, "c".repeat(64));
  assert.deepEqual(canonical, before);
  assert.deepEqual(writes, []);
});

for (const status of ["STALE", "FAILED"]) {
  test(`T028: ${status} selected regeneration retains pending draft and approval metadata`, async () => {
    const { state, handlers, canonical, before, writes } =
      await existingCvRegenerationFixture();
    handlers.applyGeneratedDraft(reviewFixture());
    state.setCareerObjective("Pending local edit");
    const approval = globalThis.structuredClone(state.pendingApproval);
    // A terminal failure is handled by the poller, not applied as a draft.
    const poll = source.slice(
      source.indexOf("  const pollGenerationJob ="),
      source.indexOf("  const resumeGenerationJob ="),
    );
    assert.match(poll, /status === "COMPLETE" \|\| status === "DEGRADED"/);
    const failureBranch = poll.slice(
      poll.indexOf("      const terminalStatus ="),
      poll.indexOf("    } catch"),
    );
    const compiled = ts.transpileModule(failureBranch, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.None,
      },
    }).outputText;
    state.status = status;
    state.setGenerationJobStatus = (value) => {
      state.generationJobStatus = value;
    };
    state.clearGenerationQuery = () => {};
    new Function("state", `with (state) { ${compiled} }`)(state);
    assert.equal(state.generationError, status);
    assert.equal(state.careerObjective, "Pending local edit");
    assert.equal(state.hasPendingGeneration, true);
    assert.deepEqual(state.pendingApproval, approval);
    assert.equal(await handlers.persistCv(false), null);
    assert.deepEqual(canonical, before);
    assert.deepEqual(writes, []);
  });
}

test("career generation pending and retained save errors use reactive locale and stable codes", async () => {
  const career = await readFile(
    new URL("./CareerProfilePage.tsx", import.meta.url),
    "utf8",
  );
  assert.match(career, /useState<GenerationSaveErrorCode \| null>\(null\)/);
  assert.match(
    career,
    /GENERATION_SAVE_ERRORS\[generationSaveError\]\[uiVi \? 0 : 1\]/,
  );
  assert.match(career, /isGenerating \? \(isSaving \?/);
  assert.match(career, /'Creating CV…'/);
  assert.match(career, /generationSaveErrorText \|\| \(isGenerating/);
  assert.doesNotMatch(career, /setSaveError\(error.message\)/);
});

test("profile pending drafts populate editor fields and warnings but only explicit approval writes canonical CV", async () => {
  const types = await readFile(
    new URL("../../lib/cvTypes.ts", import.meta.url),
    "utf8",
  );
  const typesModule = ts.transpileModule(types, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const { filterMeaningfulCvEntries } = await import(
    `data:text/javascript;base64,${Buffer.from(typesModule).toString("base64")}`
  );
  const helpers = source.slice(
    source.indexOf("const asRecord ="),
    source.indexOf("export default function CVEditorPage"),
  );
  const apply = source.slice(
    source.indexOf("  const applyGeneratedDraft ="),
    source.indexOf("  const clearGenerationTimer ="),
  );
  const persist = source.slice(
    source.indexOf("  const persistCv ="),
    source.indexOf("  const handleSaveCV ="),
  );
  const copy = source.slice(
    source.indexOf("const saveCopy ="),
    source.indexOf("const localeLabels ="),
  );
  // Execute production mapping/handlers with shared mutable state, as React would on rerender.
  const compiled = ts.transpileModule(
    `${helpers}\n${copy}\n${apply}\n${persist}\nreturn { applyGeneratedDraft, persistCv };`,
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.None,
      },
    },
  ).outputText;
  for (const jobId of [undefined, "authorized-job"]) {
    const profile = { fullName: "Synthetic Candidate", contentVersion: 7 };
    const canonical = {
      _id: "pending-cv",
      fullName: "Original",
      contentVersion: 3,
    };
    const before = globalThis.structuredClone({ profile, canonical });
    const writes = [];
    const state = {
      fullName: canonical.fullName,
      title: "Original",
      generationMode: "MANUAL",
      hasPendingGeneration: false,
      pendingApproval: null,
      visibleSections: {},
      draftRevision: 0,
      isTitleManual: true,
      isNew: false,
      id: canonical._id,
      editorCvId: canonical._id,
      salaryValid: true,
      accessToken: "synthetic-token",
      uiVi: false,
      i18n: { language: "en", resolvedLanguage: "en" },
      contentVersionRef: { current: 3 },
      filterMeaningfulCvEntries,
      generationRequestContextIsCurrent: () => true,
      toast: { error: (...args) => assert.fail(args.join(" ")) },
      setTimeout: () => {},
      navigate: () => {},
      markDirty: () =>
        assert.fail("Pending drafts must not use legacy dirty path"),
    };
    for (const name of [
      "HasPendingGeneration",
      "PendingApproval",
      "GenerationError",
      "CvLanguage",
      "Title",
      "FullName",
      "Position",
      "Phone",
      "Email",
      "Link",
      "Address",
      "CareerObjective",
      "Education",
      "WorkExperience",
      "Skills",
      "Activities",
      "Projects",
      "Certificates",
      "Awards",
      "SectionOrder",
      "FontFamilyId",
      "ThemeColorId",
      "FontSize",
      "LineSpacing",
      "VisibleSections",
      "GenerationMode",
      "ContentVersion",
      "GenerationWarnings",
      "ShowGenerationWarnings",
      "GenerationStatus",
      "IsDirty",
      "DraftRevision",
      "IsSaving",
      "EditorCvId",
    ]) {
      const key = name[0].toLowerCase() + name.slice(1);
      state[`set${name}`] = (value) => {
        state[key] = typeof value === "function" ? value(state[key]) : value;
      };
    }
    state.buildCvPayload = () => ({
      fullName: state.fullName,
      title: state.title,
      workExperience: state.workExperience,
    });
    state.onlineCvApi = {
      update: async (id, payload, token) => {
        writes.push({ id, payload, token });
        Object.assign(canonical, payload, { contentVersion: 4 });
        return canonical;
      },
      create: () =>
        assert.fail("Must update the pending CV, not create another"),
    };
    const handlers = new Function("state", `with (state) { ${compiled} }`)(
      state,
    );
    const providerResult = {
      operationId: "profile-operation",
      draftHash: "synthetic-draft-hash",
      reviewStatus: "PENDING",
      status: "DEGRADED",
      contentVersion: 3,
      locale: "en-US",
      jobId,
      warnings: ["insufficient source evidence"],
      draft: {
        title: "Generated CV",
        full_name: profile.fullName,
        position: "Engineer",
        work_experience: [
          {
            company_name: "Synthetic Co",
            position: "Developer",
            bullets: ["Built APIs"],
          },
        ],
        skills: ["TypeScript"],
      },
    };
    handlers.applyGeneratedDraft(globalThis.structuredClone(providerResult));
    assert.equal(state.hasPendingGeneration, true);
    assert.equal(state.generationMode, "EDITOR_ONLY");
    assert.equal(state.fullName, profile.fullName);
    assert.equal(state.title, "Generated CV");
    assert.equal(state.position, "Engineer");
    assert.deepEqual(state.workExperience, [
      {
        companyName: "Synthetic Co",
        position: "Developer",
        description: "Built APIs",
      },
    ]);
    assert.deepEqual(state.skills, [{ name: "TypeScript" }]);
    assert.equal(state.showGenerationWarnings, true);
    assert.match(
      normalizeCvGenerationWarnings(
        state.generationWarnings,
        state.generationStatus,
        "en-US",
      ).messages.join(" "),
      /source evidence/,
    );
    assert.match(banner, /hasPendingGeneration &&/);
    assert.match(banner, /This draft is not saved/);
    assert.deepEqual(writes, []);
    assert.deepEqual({ profile, canonical }, before);
    const approval = state.pendingApproval;
    state.pendingApproval = null;
    assert.equal(
      await handlers.persistCv(true),
      null,
      "A pending draft without approval metadata cannot be saved",
    );
    state.pendingApproval = approval;
    state.setFullName("Locally edited Candidate");
    assert.equal(
      await handlers.persistCv(false),
      null,
      "Background/pre-generation save must not approve local edits",
    );
    assert.deepEqual(writes, []);
    assert.deepEqual({ profile, canonical }, before);
    assert.equal(await handlers.persistCv(true), canonical._id);
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0], {
      id: "pending-cv",
      token: "synthetic-token",
      payload: {
        fullName: "Locally edited Candidate",
        title: "Generated CV",
        workExperience: state.workExperience,
        expectedContentVersion: 3,
        generationApproval: {
          operationId: "profile-operation",
          draftHash: "synthetic-draft-hash",
        },
      },
    });
    assert.equal(state.hasPendingGeneration, false);
    assert.equal(state.pendingApproval, null);
    assert.equal(state.contentVersionRef.current, 4);
    assert.deepEqual(profile, before.profile);
  }
});
