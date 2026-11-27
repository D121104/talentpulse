import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

async function loadGeocoding() {
  const source = await readFile(new URL('./geocoding.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

test('searchVietnamPlaces prioritizes exact Photon match for Thượng Thanh over Nominatim Cần Thơ fallback', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes('photon.komoot.io')) {
      return {
        ok: true,
        json: async () => ({
          features: [
            {
              geometry: { coordinates: [105.8859, 21.0655] },
              properties: {
                name: 'Thượng Thanh',
                locality: 'Thượng Cát',
                district: 'Việt Hưng',
                city: 'Thành phố Hà Nội',
                country: 'Việt Nam',
                countrycode: 'VN',
                osm_key: 'place',
                osm_value: 'quarter',
              },
            },
          ],
        }),
      };
    }

    return {
      ok: true,
      json: async () => [
        {
          lat: '9.9858',
          lon: '105.7604',
          name: 'Khu vực Thường Thạnh',
          display_name: 'Khu vực Thường Thạnh, Phường Cái Răng, Thành phố Cần Thơ, Việt Nam',
          class: 'boundary',
          type: 'administrative',
        },
      ],
    };
  };

  try {
    const { searchVietnamPlaces } = await loadGeocoding();
    const results = await searchVietnamPlaces('thượng thanh', {
      limit: 5,
      biasLat: 21.0285,
      biasLon: 105.8542,
    });

    assert.ok(results.length >= 2);
    assert.equal(results[0].source, 'photon');
    assert.match(results[0].display_name, /Thượng Thanh.*Hà Nội/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('searchVietnamPlaces disables local Hanoi bias when query names another city', async () => {
  const originalFetch = globalThis.fetch;
  const capturedUrls = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    capturedUrls.push(url);
    if (url.includes('photon.komoot.io')) {
      return { ok: true, json: async () => ({ features: [] }) };
    }
    return {
      ok: true,
      json: async () => [
        {
          lat: '10.7756',
          lon: '106.7019',
          name: 'Quận 1',
          display_name: 'Quận 1, Thành phố Hồ Chí Minh, Việt Nam',
          class: 'boundary',
          type: 'administrative',
        },
      ],
    };
  };

  try {
    const { searchVietnamPlaces, hasExplicitVietnamRegion } = await loadGeocoding();
    assert.equal(hasExplicitVietnamRegion('quận 1 hồ chí minh'), true);
    assert.equal(hasExplicitVietnamRegion('thượng thanh'), false);

    const results = await searchVietnamPlaces('quận 1 hồ chí minh', {
      limit: 5,
      biasLat: 21.0285,
      biasLon: 105.8542,
    });

    const photonUrl = capturedUrls.find((u) => u.includes('photon.komoot.io'));
    assert.ok(photonUrl);
    assert.equal(photonUrl.includes('location_bias_scale'), false);
    assert.match(results[0].display_name, /Quận 1, Thành phố Hồ Chí Minh/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('reverseGeocodePlace falls back to Photon when Nominatim fails', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes('nominatim')) {
      return { ok: false };
    }
    return {
      ok: true,
      json: async () => ({
        features: [
          {
            properties: {
              name: 'Thượng Thanh',
              district: 'Việt Hưng',
              city: 'Hà Nội',
              country: 'Việt Nam',
            },
          },
        ],
      }),
    };
  };

  try {
    const { reverseGeocodePlace } = await loadGeocoding();
    const label = await reverseGeocodePlace(21.0655, 105.8859);
    assert.equal(label, 'Thượng Thanh, Việt Hưng, Hà Nội');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('reverseGeocodePlace normalizes Hanoiï / Hanoi OSM typos to Hà Nội', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes('nominatim')) {
      return {
        ok: true,
        json: async () => ({
          display_name: 'Long Biên, Hanoiï, Việt Nam',
          address: {
            city_district: 'Long Biên',
            city: 'Hanoiï',
            country: 'Việt Nam',
          },
        }),
      };
    }
    return { ok: false };
  };

  try {
    const { reverseGeocodePlace } = await loadGeocoding();
    const label = await reverseGeocodePlace(21.045, 105.895);
    assert.equal(label, 'Long Biên, Hà Nội');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('saveMapLocation and loadSavedMapLocation persist user coordinates per account', async () => {
  const originalWindow = globalThis.window;
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
  };

  try {
    const { saveMapLocation, loadSavedMapLocation, clearSavedMapLocation } = await loadGeocoding();
    saveMapLocation(
      {
        lat: 21.0655,
        lon: 105.8859,
        label: 'Thượng Thanh, Việt Hưng',
        source: 'manual',
        updatedAt: 1700000000000,
      },
      'user-123',
    );

    const loaded = loadSavedMapLocation('user-123');
    assert.equal(loaded.lat, 21.0655);
    assert.equal(loaded.label, 'Thượng Thanh, Việt Hưng');
    assert.equal(loadSavedMapLocation('other-user'), null);

    clearSavedMapLocation('user-123');
    assert.equal(loadSavedMapLocation('user-123'), null);
  } finally {
    globalThis.window = originalWindow;
  }
});
