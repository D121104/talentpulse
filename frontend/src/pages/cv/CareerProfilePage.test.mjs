import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import test from 'node:test';
import { compile } from 'tailwindcss';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const source = await readFile(new URL('./CareerProfilePage.tsx', import.meta.url), 'utf8');

test('source contract: navigation has balanced desktop columns and separate readable child labels', () => {
  assert.match(source, /max-w-\[1360px\]/);
  assert.match(source, /lg:grid-cols-\[256px_minmax\(0,1fr\)\] xl:grid-cols-\[296px_minmax\(0,1fr\)\]/);
  assert.match(source, /title=\{child.label\}/);
  assert.match(source, /font-medium">\{child.primary\}/);
  assert.match(source, /text-\[13px\] leading-5[^>]+>\{child.secondary\}/);
});

test('source contract: nested navigation has separate disclosure, live indexed targets and mobile groups', () => {
  assert.match(source, /id=\{`\$\{section\}-\$\{index\}`\} tabIndex=\{-1\}/);
  assert.match(source, /aria-label=\{entryLabel\(entry, section, index\)\}/);
  assert.match(source, /children: key === 'skills' \? \[\] : profile\[key\]\.map/);
  assert.match(source, /aria-expanded=\{Boolean\(expandedSections\[section.id\]\)\}/);
  assert.match(source, /aria-controls=\{`nav-\$\{section.id\}`\}/);
  assert.match(source, /hidden=\{!expandedSections\[section.id\]\}/);
  assert.match(source, /<optgroup key=\{section.id\} label=\{section.label\}/);
  assert.match(source, /<option key=\{child.id\} value=\{child.id\}/);
  assert.match(source, /goToSection\(child.id\)/);
  assert.match(source, /lg:max-h-\[calc\(100dvh-7rem\)\] lg:overflow-y-auto/);
});

test('Chrome isolated fixture: jump handler focuses exact indexed entry below fixed header after reorder/removal', async () => {
  const jumpBody = source.match(/const goToSection = \(id: string\) => \{([\s\S]*?)\n {2}\};/)[1];
  const directory = await mkdtemp(join(tmpdir(), 'career-nav-'));
  try {
    const path = join(directory, 'navigation.html');
    await writeFile(path, `<style>header{position:fixed;top:0;height:80px}article{scroll-margin-top:112px;height:500px}body{padding-top:150px;padding-bottom:1000px}</style><header>Header</header><main></main><pre id="result"></pre><script>
      const goToSection = (id) => {${jumpBody}};
      const entries = ['First', 'Second', 'Third'];
      const render = () => {document.querySelector('main').innerHTML = entries.map((name,index) => '<article tabindex="-1" id="experience-'+index+'">'+name+'</article>').join('');};
      render(); goToSection('experience-1');
      const initial = document.activeElement.textContent;
      [entries[0],entries[1]] = [entries[1],entries[0]];
      render(); goToSection('experience-0');
      const reordered = document.activeElement.textContent;
      entries.splice(0,1); render(); goToSection('experience-1');
      document.querySelector('#result').textContent = JSON.stringify({initial,reordered,removed:document.activeElement.textContent,top:document.activeElement.getBoundingClientRect().top,unique:new Set([...document.querySelectorAll('article')].map(e=>e.id)).size,stale:!!document.getElementById('experience-2')});
    </script>`);
    const html = execFileSync('/usr/bin/google-chrome', ['--headless', '--no-sandbox', '--disable-gpu', '--dump-dom', `file://${path}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const result = JSON.parse(html.match(/<pre id="result">([^<]+)<\/pre>/)[1]);
    assert.equal(result.initial, 'Second');
    assert.equal(result.reordered, 'Second');
    assert.equal(result.removed, 'Third');
    assert.equal(result.top, 112);
    assert.equal(result.unique, 2);
    assert.equal(result.stale, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

// Execute the local, dependency-free handler with state setters, not a rendered React page.
const addSkillBody = source.match(/const addSkill = \(\) => \{([\s\S]*?)\n {2}\};/)[1];
function runAddSkill(draft, skills = [], composing = false) {
  const result = { draft, skills, feedback: '', focused: false };
  const handler = new Function('skillDraft', 'profile', 'skillComposing', 'skillInputRef', 'updateProfile', 'setSkillDraft', 'setSkillFeedback', addSkillBody);
  handler(draft, { skills }, { current: composing }, { current: { focus() { result.focused = true; } } },
    (patch) => { result.skills = patch.skills; },
    (value) => { result.draft = value; },
    (value) => { result.feedback = value; });
  return result;
}

test('skill handler rejects whitespace and case-insensitive trimmed duplicates without losing draft', () => {
  assert.deepEqual(runAddSkill('   ').skills, []);
  const skills = [{ name: ' TypeScript ', level: 'Advanced', description: 'Legacy note' }];
  const duplicate = runAddSkill('typescript', skills);
  assert.equal(duplicate.skills, skills);
  assert.equal(duplicate.draft, 'typescript');
  assert.ok(duplicate.feedback);
});

test('skill handler appends a trimmed name with empty level and preserves legacy metadata by identity', () => {
  const legacy = { name: 'React', level: 'Advanced', description: 'Legacy note' };
  const result = runAddSkill('  Tiếng Việt  ', [legacy]);
  assert.equal(result.skills[0], legacy);
  assert.deepEqual(result.skills[1], { name: 'Tiếng Việt', level: '' });
  assert.equal(result.draft, '');
  assert.equal(result.focused, true);
});

test('skill handler does not commit during composition', () => {
  const result = runAddSkill('Tiếng Việt', [], true);
  assert.deepEqual(result.skills, []);
  assert.equal(result.draft, 'Tiếng Việt');
});

test('source contract: bottom add zone reserves space and reveals for keyboard and touch', () => {
  assert.match(source, /group\/add flex min-h-16/);
  assert.match(source, /group-focus-within\/add:opacity-100/);
  assert.match(source, /\[@media\(hover:hover\)_and_\(pointer:fine\)_and_\(not_\(any-pointer:coarse\)\)\]:opacity-0/);
  assert.match(source, /pendingAdd\.current = true/);
  assert.match(source, /focus\(\{ preventScroll: true \}\)/);
  assert.match(source, /prefers-reduced-motion: reduce/);
});

test('Chrome fixture: compiled bottom-add CSS stays visible on hybrid and touch devices', async () => {
  const classes = source.match(/onClick=\{add\} className="([^"]*group-hover\/add[^"]*)"/)[1];
  const compiler = await compile('@tailwind utilities;');
  const css = compiler.build(classes.split(' '));
  const directory = await mkdtemp(join(tmpdir(), 'career-add-'));
  try {
    for (const device of [
      { name: 'hybrid', hover: true, fine: true, coarse: true, expected: '1' },
      { name: 'touch', hover: false, fine: false, coarse: true, expected: '1' },
      { name: 'mouse', hover: true, fine: true, coarse: false, expected: '0' },
    ]) {
      // Substitute only device media features; Chrome evaluates the compiled cascade,
      // compound negation, specificity and focus-within selectors itself.
      const deviceCss = css.replace(/\(hover:\s*hover\)/g, device.hover ? '(min-width: 0px)' : '(max-width: 0px)')
        .replace(/\(pointer:\s*fine\)/g, device.fine ? '(min-width: 0px)' : '(max-width: 0px)')
        .replace(/\(any-pointer:\s*coarse\)/g, device.coarse ? '(min-width: 0px)' : '(max-width: 0px)');
      const path = join(directory, `${device.name}.html`);
      await writeFile(path, `<style>${deviceCss} button{transition:none!important}</style><div class="group/add"><button class="${classes}">Add</button></div><pre id="result"></pre><script>const button=document.querySelector('button');const idle=getComputedStyle(button).opacity;button.focus();document.querySelector('#result').textContent=JSON.stringify({idle,focused:getComputedStyle(button).opacity});</script>`);
      const html = execFileSync('/usr/bin/google-chrome', ['--headless', '--no-sandbox', '--disable-gpu', '--dump-dom', `file://${path}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const result = JSON.parse(html.match(/<pre id="result">([^<]+)<\/pre>/)[1]);
      assert.equal(result.idle, device.expected, `${device.name} idle opacity`);
      assert.equal(result.focused, '1', `${device.name} keyboard focus opacity`);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('source contract: skills use name-only tags with IME and pending-draft guards', () => {
  assert.doesNotMatch(source, /Mức độ \/ ghi chú|CareerSkillEntry/);
  assert.match(source, /nativeEvent\.isComposing/);
  assert.match(source, /keyCode !== 229/);
  assert.match(source, /skill\.name\.trim\(\)\.toLocaleLowerCase\(\)/);
  assert.match(source, /name, level: ''/);
  assert.match(source, /if \(skillDraft\.trim\(\)\) throw new ProfileSaveError/);
  assert.match(source, /if \(skillDraft\.trim\(\)\) \{/);
  assert.match(source, /aria-label=\{`Xóa kỹ năng/);
});

test('Chrome fixture: textarea grows, shrinks, responds to width and appended input receives focus', async () => {
  const resizeLogic = source.slice(source.indexOf('    const resize = () => {'), source.indexOf('    return () => observer.disconnect();'));
  const focusLogic = source.match(/useLayoutEffect\(\(\) => \{\n( {4}if \(!pendingAdd.current\)[\s\S]*?)\n {2}\}, \[entries.length\]\);/)[1];
  const directory = await mkdtemp(join(tmpdir(), 'career-fields-'));
  try {
    const path = join(directory, 'fields.html');
    await writeFile(path, `<style>textarea{box-sizing:border-box;width:600px;padding:10px 14px;border:1px solid;line-height:24px;font-size:14px;resize:none;overflow:hidden}input{scroll-margin-top:112px}</style><textarea rows="3"></textarea><div style="height:1500px"></div><div id="entry"><input></div><pre id="result"></pre><script>
      const element = document.querySelector('textarea');
      const longText = 'Description with enough words to wrap across the available width. '.repeat(40);
      element.value = longText;
      ${resizeLogic}
      const loaded = element.clientHeight;
      element.value = 'Short'; resize(); const short = element.clientHeight;
      element.value = longText; resize(); const edited = element.clientHeight;
      element.style.width = '240px';
      const pendingAdd = {current:true};
      const lastEntryRef = {current:document.querySelector('#entry')};
      (() => { ${focusLogic} })();
      setTimeout(() => {
        document.querySelector('#result').textContent = JSON.stringify({loaded,short,edited,narrow:element.clientHeight,scrollHeight:element.scrollHeight,focused:document.activeElement === lastEntryRef.current.querySelector('input'),pending:pendingAdd.current});
        observer.disconnect();
      }, 500);
    </script>`);
    const html = execFileSync('/usr/bin/google-chrome', ['--headless', '--no-sandbox', '--disable-gpu', '--virtual-time-budget=1500', '--dump-dom', `file://${path}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const result = JSON.parse(html.match(/<pre id="result">([^<]+)<\/pre>/)[1]);
    assert.ok(result.loaded > result.short, 'loaded content expands and deletion shrinks');
    assert.equal(result.edited, result.loaded, 'editing/paste expands again');
    assert.ok(result.narrow > result.edited, 'ResizeObserver expands at narrower width');
    assert.equal(result.scrollHeight, result.narrow, 'all content fits without internal scrolling');
    assert.equal(result.focused, true, 'appended entry first input is focused');
    assert.equal(result.pending, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('source contract: only requested descriptions opt into uncapped auto-grow', () => {
  assert.equal((source.match(/<TextField autoGrow/g) || []).length, 2);
  assert.match(source, /<TextField autoGrow label="Mô tả và thành tựu"/);
  assert.match(source, /<TextField autoGrow label="Mô tả dự án"/);
  assert.match(source, /new ResizeObserver/);
  assert.match(source, /width !== previousWidth/);
  assert.match(source, /element\.style\.height = 'auto'/);
  assert.match(source, /resize-none overflow-hidden/);
});

test('source contract: loading/error guards and editor disabled wiring are present', () => {
  assert.match(source, /if \(isLoading \|\| loadError \|\| conflict\)/);
  assert.match(source, /disabled=\{isLoading \|\| Boolean\(loadError\) \|\| isSaving \|\| isGenerating\}/);
});

test('source contract: section destinations declare focus targets and scroll offsets', () => {
  assert.match(source, /id=\{section\} tabIndex=\{-1\}/);
  assert.match(source, /id="base" tabIndex=\{-1\}/);
  assert.match(source, /id="ai" tabIndex=\{-1\}/);
  assert.match(source, /scroll-mt-28/);
});

test('source contract: contact fields declare email and telephone semantics', () => {
  assert.match(source, /type="email" autoComplete="email"/);
  assert.match(source, /type="tel" autoComplete="tel"/);
});

test('source contract: save bar stays in main flow with sticky positioning and chatbot clearance', () => {
  const main = source.slice(source.indexOf('<main '), source.indexOf('</main>'));
  const bar = main.match(/<div className="([^"]+)"\s*>\s*<div className="min-w-0" aria-live="polite">/);
  assert.ok(bar, 'Save status bar must be inside main, before Footer');
  assert.match(bar[1], /\bsticky bottom-4\b/);
  assert.doesNotMatch(bar[1], /\bfixed\b/);
  assert.match(bar[1], /\bmr-20\b/);
  assert.match(bar[1], /\bsm:mr-24\b/);
});
