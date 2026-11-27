import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

async function loadJobFilters() {
  const source = await readFile(new URL('./jobFilters.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

test('clusterJobsByLocation groups co-located jobs by rounded building coordinates', async () => {
  const { clusterJobsByLocation } = await loadJobFilters();
  const clusters = clusterJobsByLocation([
    { _id: 'j1', lat: 21.02851, lon: 105.85421, distanceKm: 3.2 },
    { _id: 'j2', lat: 21.02854, lon: 105.85423, distanceKm: 3.1 },
    { _id: 'j3', lat: 21.055, lon: 105.885, distanceKm: 1.4 },
    { _id: 'j4', lat: null, lon: null },
  ]);

  assert.equal(clusters.length, 2);
  assert.equal(clusters[0].jobs.length, 2);
  assert.equal(clusters[0].distanceKm, 3.1);
  assert.equal(clusters[1].jobs.length, 1);
});

test('buildGoogleMapsDirectionsUrl includes origin when provided and safe destination', async () => {
  const { buildGoogleMapsDirectionsUrl } = await loadJobFilters();
  const withOrigin = buildGoogleMapsDirectionsUrl(21.0173, 105.7838, {
    lat: 21.0655,
    lon: 105.8859,
  });
  assert.match(withOrigin, /^https:\/\/www\.google\.com\/maps\/dir\/\?/);
  assert.match(withOrigin, /origin=21\.0655%2C105\.8859/);
  assert.match(withOrigin, /destination=21\.0173%2C105\.7838/);
  assert.match(withOrigin, /travelmode=driving/);

  const withoutOrigin = buildGoogleMapsDirectionsUrl(21.0173, 105.7838, null);
  assert.equal(withoutOrigin.includes('origin='), false);
});

test('formatShortSalaryLabel & parseSalaryPresetValue handle numeric and negotiable ranges', async () => {
  const { formatShortSalaryLabel, parseSalaryPresetValue } = await loadJobFilters();
  assert.equal(formatShortSalaryLabel(25000000), '25tr');
  assert.equal(formatShortSalaryLabel(15500000), '15.5tr');
  assert.equal(formatShortSalaryLabel(0), 'Thỏa thuận');
  assert.equal(formatShortSalaryLabel(null), 'Thỏa thuận');

  assert.deepEqual(parseSalaryPresetValue('negotiable'), { negotiable: true });
  assert.deepEqual(parseSalaryPresetValue('15000000-20000000'), {
    minSalary: 15000000,
    maxSalary: 20000000,
  });
  assert.deepEqual(parseSalaryPresetValue(''), {});
});

test('FEATURED_CITIES highlights top Vietnamese hubs without ward clutter', async () => {
  const { FEATURED_CITIES } = await loadJobFilters();
  const names = FEATURED_CITIES.map((c) => c.name);
  assert.ok(names.includes('Hà Nội'));
  assert.ok(names.includes('Hồ Chí Minh'));
  assert.ok(names.includes('Đà Nẵng'));
});
