import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

async function loadTsModule(relativePath, replacements = []) {
  let source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
  for (const [pattern, value] of replacements) {
    source = source.replace(pattern, value);
  }
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

test('getVisiblePageNumbers returns windowed pages with ellipses for large totals', async () => {
  const { getVisiblePageNumbers } = await loadTsModule('./pagination.ts');

  assert.deepEqual(getVisiblePageNumbers(1, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(getVisiblePageNumbers(8, 15), [1, 'ellipsis', 7, 8, 9, 'ellipsis', 15]);
  assert.deepEqual(getVisiblePageNumbers(14, 15), [1, 'ellipsis', 13, 14, 15]);
});

test('searchJobsApi & searchJobsByLocationApi serialize negotiable and map filter params', async () => {
  const calls = [];
  globalThis.__mockApiRequest = async (path, options) => {
    calls.push({ path, options });
    return {
      meta: { current: 1, pageSize: 10, pages: 1, total: 0 },
      result: [],
    };
  };

  const { searchJobsApi, searchJobsByLocationApi } = await loadTsModule('./jobApi.ts', [
    [/import\s*\{[^}]*\}\s*from\s*'\.\/api';/, 'const apiRequest = globalThis.__mockApiRequest;'],
  ]);

  await searchJobsApi({
    query: 'Backend',
    negotiable: true,
    isHot: true,
    page: 2,
    limit: 10,
  });

  assert.match(calls[0].path, /\/jobs\/search-es\?/);
  assert.match(calls[0].path, /query=Backend/);
  assert.match(calls[0].path, /negotiable=true/);
  assert.match(calls[0].path, /isHot=true/);
  assert.match(calls[0].path, /page=2/);

  await searchJobsByLocationApi({
    lat: 21.0285,
    lon: 105.8542,
    radius: 15,
    query: 'ha noi',
    level: 'SENIOR',
    negotiable: true,
  });

  assert.match(calls[1].path, /\/jobs\/map-search\?/);
  assert.match(calls[1].path, /radius=15/);
  assert.match(calls[1].path, /level=SENIOR/);
  assert.match(calls[1].path, /negotiable=true/);

  delete globalThis.__mockApiRequest;
});
