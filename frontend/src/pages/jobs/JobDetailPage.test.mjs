import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('./JobDetailPage.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('JobDetailPage.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'handleCopyJobId') {
    handler = node.initializer.getText(ast);
  }
  ts.forEachChild(node, visit);
}
visit(ast);

test('copy button is labelled and connected to the job ID handler', () => {
  assert.match(source, /onClick=\{handleCopyJobId\}\s+title="Sao chép mã công việc"\s+aria-label="Sao chép mã công việc"/);
});

for (const mode of ['success', 'rejected', 'unavailable']) {
  test(`copy job ID: ${mode}`, async () => {
    const writes = [];
    const successes = [];
    const errors = [];
    const navigator = mode === 'unavailable' ? {} : {
      clipboard: { writeText: async (value) => {
        writes.push(value);
        if (mode === 'rejected') throw new Error('Permission denied');
      } },
    };
    const job = { _id: 'canonical-job-id', name: 'Job title' };
    const copy = new Function('job', 'navigator', 'success', 'error', `return (${handler});`)(
      job, navigator, (message) => successes.push(message), (message) => errors.push(message),
    );
    await copy();
    assert.deepEqual(writes, mode === 'unavailable' ? [] : [job._id]);
    assert.deepEqual(successes, mode === 'success' ? ['Đã sao chép mã công việc.'] : []);
    assert.deepEqual(errors, mode === 'success' ? [] : ['Không thể sao chép mã công việc. Vui lòng thử lại.']);
  });
}
