import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { URL } from 'node:url';
import ts from 'typescript';

const source = await readFile(new URL('./assistantApi.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source.replace(/^import .*;$/gm, ''), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
function setup(uploads = [], online = []) {
  const calls = [];
  const context = vm.createContext({ exports: {}, apiRequest: async (path, options) => {
    calls.push({ path, options });
    return path === '/user-cvs' ? uploads : path === '/online-cvs' ? online : {};
  } });
  vm.runInContext(javascript, context);
  return { api: context.exports.assistantApi, calls };
}
const ready = { _id: '00000000-0000-4000-8000-000000000001', title: 'CV', parseStatus: 'READY', contentHash: 'hash', parsedText: 'Content' };
test('complete list preserves pending, failed and unreadable uploads and deduplicates linked online snapshots', async () => {
  const { api, calls } = setup([
    ready,
    ...['PENDING', 'PROCESSING', 'FAILED', undefined].map((parseStatus, i) => ({ ...ready, _id: `state-${i}`, parseStatus })),
    { ...ready, _id: 'empty', parsedText: ' ' },
    { ...ready, _id: 'hashless', contentHash: '' },
    { ...ready, _id: 'snapshot', onlineCvId: 'online' },
  ], [{ _id: 'online', fullName: 'Name' }, { _id: 'empty-online' }]);
  const options = await api.listCvOptions('token');
  assert.equal(options.length, 9);
  assert.equal(options.some(cv => cv.id === 'snapshot'), false);
  assert.equal(options.filter(cv => cv.disabled).length, 6);
  assert.ok(options.filter(cv => cv.disabled).every(cv => cv.status));
  assert.ok(options.filter(cv => cv.source === 'online').every(cv => !cv.disabled));
  assert.deepEqual(calls.map(call => call.path), ['/user-cvs', '/online-cvs']);
});
test('source-prefixed keys avoid collisions without changing source IDs or payloads', async () => {
  const { api, calls } = setup([ready], [{ _id: ready._id }]);
  const options = await api.listCvOptions('token');
  assert.equal(new Set(options.map(cv => cv.key)).size, 2);
  for (const cv of options) {
    await api.sendMessage('session', { content: 'Review', clientMessageId: ready._id, cvId: cv.id, cvSource: cv.source, locale: 'en-US' }, 'token');
    const body = calls.at(-1).options.body;
    assert.equal(body.cvId, ready._id);
    assert.equal(body.cvSource, cv.source);
    assert.equal(body.locale, 'en-US');
  }
  await api.sendMessage('session', { content: 'Legacy', clientMessageId: ready._id, cvId: ready._id }, 'token');
  assert.equal('cvSource' in calls.at(-1).options.body, false);
});
test('empty lists and unnamed uploads have usable results', async () => {
  assert.equal((await setup().api.listCvOptions('token')).length, 0);
  assert.equal((await setup([{ ...ready, title: '' }]).api.listCvOptions('token'))[0].title, 'CV của tôi');
});
