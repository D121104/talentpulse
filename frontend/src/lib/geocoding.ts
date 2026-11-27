export interface GeocodePlaceSuggestion {
  display_name: string;
  short_name: string;
  lat: string;
  lon: string;
  source: 'photon' | 'nominatim';
}

export interface SavedMapLocation {
  lat: number;
  lon: number;
  label?: string;
  source: 'manual' | 'gps' | 'profile';
  updatedAt: number;
}

export interface DeviceLocationResult {
  lat: number;
  lon: number;
  accuracy: number;
}

const STORAGE_KEY_PREFIX = 'tp_job_map_location';
const VIETNAM_BBOX = '102.1,8.1,109.5,23.4';
const EXPLICIT_REGION_KEYWORDS = [
  'ho chi minh',
  'tp hcm',
  'tphcm',
  'hcm',
  'sai gon',
  'da nang',
  'can tho',
  'hai phong',
  'binh duong',
  'dong nai',
  'bien hoa',
  'nha trang',
  'khanh hoa',
  'vung tau',
  'ba ria',
  'thua thien hue',
  'hue',
  'bac ninh',
  'hai duong',
  'quang ninh',
  'ha long',
  'nghe an',
  'vinh',
  'thanh hoa',
  'thai nguyen',
  'da lat',
  'lam dong',
  'long an',
  'tien giang',
  'an giang',
  'kien giang',
  'phu quoc',
];

const placeSearchCache = new Map<string, GeocodePlaceSuggestion[]>();
const reverseGeocodeCache = new Map<string, string>();

export function foldVietnameseText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

export function hasExplicitVietnamRegion(query: string): boolean {
  const folded = foldVietnameseText(query);
  return EXPLICIT_REGION_KEYWORDS.some((kw) => folded.includes(kw));
}

function getStorageKey(userKey?: string): string {
  return userKey ? `${STORAGE_KEY_PREFIX}:${userKey}` : STORAGE_KEY_PREFIX;
}

export function loadSavedMapLocation(userKey?: string): SavedMapLocation | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(getStorageKey(userKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.lat === 'number' &&
      typeof parsed.lon === 'number' &&
      Number.isFinite(parsed.lat) &&
      Number.isFinite(parsed.lon)
    ) {
      return parsed as SavedMapLocation;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveMapLocation(location: SavedMapLocation, userKey?: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(getStorageKey(userKey), JSON.stringify(location));
  } catch {
    // Ignore storage quota / privacy mode restrictions
  }
}

export function clearSavedMapLocation(userKey?: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.removeItem(getStorageKey(userKey));
  } catch {
    // Ignore
  }
}

export function normalizeVietnamAdminName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const folded = foldVietnameseText(trimmed).replace(/\s+/g, ' ');

  if (
    /^hano[iï]+$/i.test(trimmed) ||
    /^(thanh pho )?(ha noi|hanoii?)$/.test(folded) ||
    /^tp\.?\s*ha noi$/.test(folded)
  ) {
    return 'Hà Nội';
  }
  if (folded === 'thanh pho ho chi minh' || folded === 'tp. ho chi minh' || folded === 'tp ho chi minh') {
    return trimmed;
  }
  if (/^(ho chi minh( city)?|sai gon|saigon|tphcm)$/.test(folded)) {
    return 'TP. Hồ Chí Minh';
  }
  if (/^(thanh pho )?(da nang|danang)( city)?$/.test(folded)) {
    return 'Đà Nẵng';
  }
  if (/^(thanh pho )?(hai phong|haiphong)( city)?$/.test(folded)) {
    return 'Hải Phòng';
  }
  if (/^(thanh pho )?(can tho|cantho)( city)?$/.test(folded)) {
    return 'Cần Thơ';
  }
  if (folded === 'vietnam' || folded === 'viet nam') {
    return 'Việt Nam';
  }

  return trimmed;
}

function cleanVietnamAddressParts(parts: Array<string | undefined | null>, includeCountry: boolean): string[] {
  const uniqueParts: string[] = [];
  const seenFolded = new Set<string>();

  for (const raw of parts) {
    if (typeof raw !== 'string') continue;
    const normalized = normalizeVietnamAdminName(raw);
    if (!normalized || /^\d{4,6}$/.test(normalized)) continue;
    const folded = foldVietnameseText(normalized);
    if (!includeCountry && folded === 'viet nam') continue;
    if (!seenFolded.has(folded)) {
      seenFolded.add(folded);
      uniqueParts.push(normalized);
    }
  }

  return uniqueParts;
}

function formatPhotonParts(props: Record<string, any>): {
  displayName: string;
  shortName: string;
  primaryName: string;
} {
  const streetPart = [props.housenumber, props.street].filter(Boolean).join(' ').trim();
  const uniqueParts = cleanVietnamAddressParts(
    [
      props.name,
      streetPart && streetPart !== props.name ? streetPart : '',
      props.locality,
      props.district,
      props.county,
      props.city,
      props.state,
      props.country || 'Việt Nam',
    ],
    true,
  );

  const displayName = uniqueParts.join(', ');
  const shortParts = uniqueParts.filter((part) => foldVietnameseText(part) !== 'viet nam').slice(0, 3);
  const shortName = shortParts.join(', ') || displayName;
  return {
    displayName,
    shortName,
    primaryName: normalizeVietnamAdminName(props.name || streetPart || shortParts[0] || displayName),
  };
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function scorePlaceCandidate(
  query: string,
  primaryName: string,
  displayName: string,
  categoryHint: string,
  source: 'photon' | 'nominatim',
): number {
  const trimmedQuery = query.trim().toLowerCase();
  const foldedQuery = foldVietnameseText(query);
  const tokens = foldedQuery.split(/\s+/).filter(Boolean);

  const primaryLower = primaryName.toLowerCase();
  const primaryFolded = foldVietnameseText(primaryName);
  const displayLower = displayName.toLowerCase();
  const displayFolded = foldVietnameseText(displayName);

  let score = source === 'photon' ? 12 : 8;

  // Exact Vietnamese diacritic matches strongly outrank loose phonetic matches
  if (primaryLower === trimmedQuery) score += 120;
  else if (primaryLower.startsWith(trimmedQuery)) score += 90;
  else if (displayLower.includes(trimmedQuery)) score += 60;

  if (primaryFolded === foldedQuery) score += 70;
  else if (primaryFolded.startsWith(foldedQuery)) score += 45;
  else if (displayFolded.includes(foldedQuery)) score += 30;

  let matchedTokens = 0;
  for (const token of tokens) {
    if (displayFolded.includes(token)) {
      matchedTokens += 1;
      score += primaryFolded.includes(token) ? 18 : 10;
    }
  }
  if (tokens.length > 0 && matchedTokens === tokens.length) {
    score += 35;
  }

  // Prefer administrative boundaries and localities over transit stops when searching area names
  if (
    categoryHint.includes('boundary') ||
    categoryHint.includes('place') ||
    categoryHint.includes('administrative') ||
    categoryHint.includes('quarter') ||
    categoryHint.includes('suburb')
  ) {
    score += 20;
  }

  return score;
}

export async function searchVietnamPlaces(
  query: string,
  options?: {
    limit?: number;
    biasLat?: number;
    biasLon?: number;
    signal?: AbortSignal;
  },
): Promise<GeocodePlaceSuggestion[]> {
  const normalized = query.trim();
  if (!normalized) return [];

  const limit = Math.max(1, Math.min(10, options?.limit ?? 6));
  const useBias =
    options?.biasLat != null &&
    options?.biasLon != null &&
    Number.isFinite(options.biasLat) &&
    Number.isFinite(options.biasLon) &&
    !hasExplicitVietnamRegion(normalized);

  const cacheKey = [
    foldVietnameseText(normalized),
    useBias ? options!.biasLat!.toFixed(2) : 'no-bias',
    useBias ? options!.biasLon!.toFixed(2) : 'no-bias',
    limit,
  ].join('|');

  const cached = placeSearchCache.get(cacheKey);
  if (cached) return cached;

  const photonParams = new URLSearchParams({
    q: normalized,
    limit: String(Math.max(limit, 6)),
    bbox: VIETNAM_BBOX,
  });
  if (useBias) {
    photonParams.set('lat', String(options!.biasLat));
    photonParams.set('lon', String(options!.biasLon));
    photonParams.set('location_bias_scale', '0.15');
  }

  const nominatimParams = new URLSearchParams({
    format: 'json',
    q: normalized,
    countrycodes: 'vn',
    limit: String(Math.max(limit, 5)),
    addressdetails: '1',
  });

  const [photonRes, nominatimRes] = await Promise.allSettled([
    fetch(`https://photon.komoot.io/api/?${photonParams.toString()}`, {
      signal: options?.signal,
    }).then((res) => (res.ok ? res.json() : null)),
    fetch(`https://nominatim.openstreetmap.org/search?${nominatimParams.toString()}`, {
      headers: { 'Accept-Language': 'vi,en' },
      signal: options?.signal,
    }).then((res) => (res.ok ? res.json() : null)),
  ]);

  if (options?.signal?.aborted) {
    return [];
  }

  type ScoredSuggestion = GeocodePlaceSuggestion & { score: number };
  const candidates: ScoredSuggestion[] = [];

  if (photonRes.status === 'fulfilled' && Array.isArray(photonRes.value?.features)) {
    for (const feature of photonRes.value.features) {
      const coords = feature?.geometry?.coordinates;
      const props = feature?.properties || {};
      if (!Array.isArray(coords) || coords.length < 2) continue;

      const lon = Number(coords[0]);
      const lat = Number(coords[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      if (props.countrycode && String(props.countrycode).toUpperCase() !== 'VN') continue;

      const { displayName, shortName, primaryName } = formatPhotonParts(props);
      if (!displayName) continue;

      const categoryHint = `${props.osm_key || ''} ${props.osm_value || ''} ${props.type || ''}`.toLowerCase();
      candidates.push({
        display_name: displayName,
        short_name: shortName,
        lat: String(lat),
        lon: String(lon),
        source: 'photon',
        score: scorePlaceCandidate(normalized, primaryName, displayName, categoryHint, 'photon'),
      });
    }
  }

  if (nominatimRes.status === 'fulfilled' && Array.isArray(nominatimRes.value)) {
    for (const item of nominatimRes.value) {
      const lat = Number(item?.lat);
      const lon = Number(item?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || !item?.display_name) continue;

      const displayName = cleanVietnamAddressParts(
        String(item.display_name).split(','),
        true,
      ).join(', ');
      const shortName = cleanVietnamAddressParts(
        String(item.display_name).split(','),
        false,
      )
        .slice(0, 3)
        .join(', ');
      const primaryName = normalizeVietnamAdminName(
        item.name || displayName.split(',')[0] || displayName,
      );
      const categoryHint = `${item.class || ''} ${item.type || ''} ${item.addresstype || ''}`.toLowerCase();

      candidates.push({
        display_name: displayName,
        short_name: shortName || displayName,
        lat: String(item.lat),
        lon: String(item.lon),
        source: 'nominatim',
        score: scorePlaceCandidate(normalized, primaryName, displayName, categoryHint, 'nominatim'),
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  const deduped: GeocodePlaceSuggestion[] = [];
  for (const item of candidates) {
    const itemLat = Number(item.lat);
    const itemLon = Number(item.lon);
    const itemFolded = foldVietnameseText(item.short_name);

    const isDuplicate = deduped.some((existing) => {
      const dist = haversineMeters(
        itemLat,
        itemLon,
        Number(existing.lat),
        Number(existing.lon),
      );
      return dist < 180 && foldVietnameseText(existing.short_name) === itemFolded;
    });

    if (!isDuplicate) {
      deduped.push({
        display_name: item.display_name,
        short_name: item.short_name,
        lat: item.lat,
        lon: item.lon,
        source: item.source,
      });
    }

    if (deduped.length >= limit) break;
  }

  placeSearchCache.set(cacheKey, deduped);
  return deduped;
}

export async function reverseGeocodePlace(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<string | null> {
  const cacheKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const cached = reverseGeocodeCache.get(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14&addressdetails=1`,
      {
        headers: { 'Accept-Language': 'vi,en' },
        signal,
      },
    );
    if (res.ok) {
      const data = await res.json();
      const addr = data?.address;
      const structuredParts = addr
        ? cleanVietnamAddressParts(
            [
              addr.road,
              addr.suburb || addr.quarter || addr.neighbourhood || addr.village || addr.town,
              addr.city_district || addr.district || addr.county,
              addr.city || addr.state,
            ],
            false,
          )
        : [];
      const fallbackParts = data?.display_name
        ? cleanVietnamAddressParts(String(data.display_name).split(','), false).slice(0, 3)
        : [];
      const shortName = (structuredParts.length > 0 ? structuredParts : fallbackParts)
        .slice(0, 3)
        .join(', ');
      if (shortName) {
        reverseGeocodeCache.set(cacheKey, shortName);
        return shortName;
      }
    }
  } catch {
    if (signal?.aborted) return null;
  }

  try {
    const res = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}`, { signal });
    if (res.ok) {
      const data = await res.json();
      const props = data?.features?.[0]?.properties;
      if (props) {
        const { shortName } = formatPhotonParts(props);
        if (shortName) {
          reverseGeocodeCache.set(cacheKey, shortName);
          return shortName;
        }
      }
    }
  } catch {
    // Ignore fallback errors
  }

  return null;
}

export function detectAccurateDeviceLocation(options?: {
  timeoutMs?: number;
  acceptableAccuracyMeters?: number;
  refineWindowMs?: number;
}): Promise<DeviceLocationResult> {
  const timeoutMs = options?.timeoutMs ?? 12000;
  const acceptableAccuracy = options?.acceptableAccuracyMeters ?? 400;
  const refineWindowMs = options?.refineWindowMs ?? 2500;

  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }

    const geo = navigator.geolocation;
    if (typeof geo.watchPosition !== 'function') {
      geo.getCurrentPosition(
        (pos) =>
          resolve({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            accuracy: pos.coords.accuracy ?? 99999,
          }),
        (err) => reject(err),
        { timeout: timeoutMs, enableHighAccuracy: true, maximumAge: 0 },
      );
      return;
    }

    let settled = false;
    let best: DeviceLocationResult | null = null;
    let refineTimer: ReturnType<typeof setTimeout> | null = null;
    let hardTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = (watchId: number, result: DeviceLocationResult | null, err?: any) => {
      if (settled) return;
      settled = true;
      if (refineTimer) clearTimeout(refineTimer);
      if (hardTimer) clearTimeout(hardTimer);
      geo.clearWatch(watchId);

      if (result) resolve(result);
      else reject(err || new Error('Unable to detect device location'));
    };

    const watchId = geo.watchPosition(
      (pos) => {
        const sample: DeviceLocationResult = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : 99999,
        };

        if (!best || sample.accuracy < best.accuracy) {
          best = sample;
        }

        if (sample.accuracy <= acceptableAccuracy) {
          finish(watchId, sample);
          return;
        }

        if (!refineTimer) {
          refineTimer = setTimeout(() => {
            finish(watchId, best);
          }, refineWindowMs);
        }
      },
      (err) => {
        if (best) {
          finish(watchId, best);
        } else {
          finish(watchId, null, err);
        }
      },
      { timeout: timeoutMs, enableHighAccuracy: true, maximumAge: 0 },
    );

    hardTimer = setTimeout(() => {
      if (best) {
        finish(watchId, best);
      } else {
        finish(watchId, null, { code: 3, message: 'Geolocation timeout' });
      }
    }, timeoutMs + 200);
  });
}
