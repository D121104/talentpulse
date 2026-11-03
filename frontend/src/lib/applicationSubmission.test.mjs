import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

for (const path of ['../components/jobs/JobApplyModal.tsx', '../pages/jobs/JobDetailsPage.tsx']) {
  test(`${path}: disclosure precedes submit and no optional AI consent remains`, async () => {
    const source = await read(path);
    assert.doesNotMatch(source, /aiRankingConsent|aiConsent|type="checkbox"/);
    assert.match(source, /t\('jobApplication.aiDisclosure'\)/);
    assert.match(source, /aria-describedby="application-ai-disclosure"/);
    const disclosure = source.indexOf('id="application-ai-disclosure"');
    const submit = source.indexOf('aria-describedby="application-ai-disclosure"');
    assert.ok(disclosure >= 0 && disclosure < submit);

    const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const payloads = [];
    const visit = (node) => {
      if (ts.isObjectLiteralExpression(node)) {
        const keys = node.properties.map((property) => property.name?.getText(ast));
        if (keys.includes('cvId') && keys.includes('jobId')) payloads.push(keys);
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
    assert.equal(payloads.length, 1);
    assert.deepEqual(payloads[0], ['cvId', 'jobId', 'companyId', 'coverLetter']);
  });
}

test('both locales disclose job-only processing, search/training exclusions and withdrawal', async () => {
  const vi = await read('../i18n/vi.ts');
  const en = await read('../i18n/en.ts');
  assert.match(vi, /Khi nộp đơn, bạn cho phép nhà tuyển dụng dùng AI để phân tích và đánh giá CV đã chọn cho riêng công việc này\. Việc này không cho phép tìm kiếm CV toàn hệ thống, xử lý cho công việc khác hoặc dùng dữ liệu để huấn luyện AI\./);
  assert.match(en, /for this job only/);
  assert.match(en, /does not authorize platform-wide CV searches, processing for other jobs, or use of your data to train AI/);
  const policies = [
    [en, 'Withdrawing removes the application and its AI matching results and prevents further matching for that application. An AI request already in progress may finish, but its result will not be retained for the withdrawn application.', 'Withdraw this application?'],
    [vi, 'Khi hủy đơn, đơn ứng tuyển và kết quả đánh giá AI của đơn sẽ được xóa, và hệ thống sẽ không tiếp tục đánh giá CV cho đơn đó. Yêu cầu AI đang chạy có thể hoàn tất, nhưng kết quả sẽ không được lưu cho đơn đã hủy.', 'Hủy đơn ứng tuyển này?'],
  ];
  for (const [source, policy, confirmation] of policies) {
    const ast = ts.createSourceFile('locale.ts', source, ts.ScriptTarget.Latest, true);
    const messages = {};
    const visit = (node) => {
      if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.initializer)) {
        messages[node.name.getText(ast)] = node.initializer.text;
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
    assert.ok(messages.aiDisclosure.endsWith(policy));
    assert.equal(messages.withdrawConfirm, `${confirmation} ${policy}`);
    assert.doesNotMatch(messages.aiDisclosure + messages.withdrawConfirm, /stop processing|stop AI processing|dừng xử lý/);
  }
});

test('withdrawal uses existing delete endpoint and removes the application only after success', async () => {
  const api = await read('./applicationsApi.ts');
  assert.doesNotMatch(api, /aiRankingConsent/);
  assert.match(api, /withdraw:[\s\S]*?`\/applications\/\$\{id\}`[\s\S]*?method: 'DELETE'/);
  const page = await read('../pages/candidate/AppliedJobsPage.tsx');
  assert.match(page, /window.confirm\(t\('jobApplication.withdrawConfirm'\)\)/);
  assert.match(page, /await applicationsApi.withdraw\(id, accessToken\);\s*setApplications\(\(prev\) => prev.filter/);
  assert.match(page, /disabled=\{withdrawingIds\[app._id\]\}/);
  assert.match(page, /error\(t\('jobApplication.withdrawError'\)\)/);
});
