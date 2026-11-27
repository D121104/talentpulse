import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Building2,
  Crosshair,
  Loader2,
  MapPin,
  Maximize2,
  Navigation,
  X,
} from 'lucide-react';
import {
  detectAccurateDeviceLocation,
  reverseGeocodePlace,
  searchVietnamPlaces,
  type GeocodePlaceSuggestion,
} from '../../lib/geocoding';
import LocationPickerModal from './LocationPickerModal';

export interface LocationValue {
  address: string;
  lat: number | null;
  lon: number | null;
}

interface LocationMapPickerProps {
  address: string;
  lat?: number | null;
  lon?: number | null;
  onChange: (next: LocationValue) => void;
  markerTitle?: string;
  placeholder?: string;
  modalTitle?: string;
  modalSubtitle?: string;
  mapHeightClass?: string;
  required?: boolean;
  companyFallback?: {
    address?: string | null;
    lat?: number | null;
    lon?: number | null;
  } | null;
}

const DEFAULT_HANOI_LAT = 21.0285;
const DEFAULT_HANOI_LON = 105.8542;

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isValidCoords(lat?: number | null, lon?: number | null): boolean {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

function createPinIcon(isPinned: boolean): L.DivIcon {
  const color = isPinned ? '#2563EB' : '#64748B';
  const ring = isPinned ? 'rgba(37, 99, 235, 0.25)' : 'rgba(100, 116, 139, 0.2)';
  return L.divIcon({
    className: 'tp-inline-picker-pin',
    html: `
      <div style="position: relative; width: 38px; height: 38px; display: flex; align-items: center; justify-content: center; cursor: grab;">
        <div style="position: absolute; width: 38px; height: 38px; background-color: ${ring}; border-radius: 50%; ${isPinned ? 'animation: ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;' : ''}"></div>
        <div style="position: relative; width: 28px; height: 28px; background: ${color}; border-radius: 50%; border: 2.5px solid white; box-shadow: 0 3px 10px rgba(15, 23, 42, 0.3); display: flex; align-items: center; justify-content: center; color: white;">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
        </div>
      </div>
    `,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -16],
  });
}

export default function LocationMapPicker({
  address,
  lat,
  lon,
  onChange,
  markerTitle = 'Vị trí đã chọn',
  placeholder = 'Nhập địa chỉ hoặc tìm quận, tòa nhà...',
  modalTitle = 'Chọn vị trí trên bản đồ',
  modalSubtitle = 'Tìm địa chỉ, nhấp bản đồ hoặc kéo thả ghim xanh',
  mapHeightClass = 'h-56 sm:h-60',
  required = false,
  companyFallback = null,
}: LocationMapPickerProps) {
  const hasPinnedCoords = isValidCoords(lat, lon);
  const displayLat = hasPinnedCoords ? Number(lat) : DEFAULT_HANOI_LAT;
  const displayLon = hasPinnedCoords ? Number(lon) : DEFAULT_HANOI_LON;

  const [suggestions, setSuggestions] = useState<GeocodePlaceSuggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isLocatingGps, setIsLocatingGps] = useState(false);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const mapWrapperRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const dropdownContainerRef = useRef<HTMLDivElement>(null);

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const reverseAbortRef = useRef<AbortController | null>(null);

  const onChangeRef = useRef(onChange);
  const addressRef = useRef(address);
  const coordsRef = useRef({ lat: displayLat, lon: displayLon, pinned: hasPinnedCoords });
  const internalMoveRef = useRef(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    addressRef.current = address;
  }, [address]);

  useEffect(() => {
    coordsRef.current = { lat: displayLat, lon: displayLon, pinned: hasPinnedCoords };
  }, [displayLat, displayLon, hasPinnedCoords]);

  const resolveAndEmitPinMove = useCallback(async (nextLat: number, nextLon: number) => {
    const roundedLat = Number(nextLat.toFixed(6));
    const roundedLon = Number(nextLon.toFixed(6));
    internalMoveRef.current = true;
    onChangeRef.current({
      address: addressRef.current,
      lat: roundedLat,
      lon: roundedLon,
    });

    if (reverseAbortRef.current) {
      reverseAbortRef.current.abort();
    }
    const controller = new AbortController();
    reverseAbortRef.current = controller;
    setIsResolvingAddress(true);

    try {
      const resolved = await reverseGeocodePlace(roundedLat, roundedLon, controller.signal);
      if (resolved && !controller.signal.aborted) {
        onChangeRef.current({
          address: resolved,
          lat: roundedLat,
          lon: roundedLon,
        });
      }
    } finally {
      if (reverseAbortRef.current === controller) {
        reverseAbortRef.current = null;
        setIsResolvingAddress(false);
      }
    }
  }, []);

  // Initialize Leaflet map once
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [coordsRef.current.lat, coordsRef.current.lon],
      zoom: coordsRef.current.pinned ? 15 : 12,
      scrollWheelZoom: false,
      zoomControl: true,
      attributionControl: false,
    });
    mapRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    const marker = L.marker([coordsRef.current.lat, coordsRef.current.lon], {
      icon: createPinIcon(coordsRef.current.pinned),
      draggable: true,
    }).addTo(map);
    markerRef.current = marker;

    marker.on('dragend', (e) => {
      const pos = (e.target as L.Marker).getLatLng();
      setGpsError(null);
      void resolveAndEmitPinMove(pos.lat, pos.lng);
    });

    map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat: clickedLat, lng: clickedLon } = e.latlng;
      setGpsError(null);
      marker.setLatLng([clickedLat, clickedLon]);
      void resolveAndEmitPinMove(clickedLat, clickedLon);
    });

    const resizeTimer = setTimeout(() => {
      map.invalidateSize();
    }, 150);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && mapWrapperRef.current) {
      observer = new ResizeObserver(() => {
        map.invalidateSize();
      });
      observer.observe(mapWrapperRef.current);
    }

    return () => {
      clearTimeout(resizeTimer);
      observer?.disconnect();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      reverseAbortRef.current?.abort();
      searchAbortRef.current?.abort();
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [resolveAndEmitPinMove]);

  // Sync external lat/lon/address updates smoothly without rebuilding map
  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;

    markerRef.current.setIcon(createPinIcon(hasPinnedCoords));
    markerRef.current.setLatLng([displayLat, displayLon]);
    markerRef.current.bindPopup(
      `<div style="font-family: system-ui, sans-serif; font-size: 12px; max-width: 220px;">
        <strong style="color: #0f172a;">${escapeHtml(markerTitle)}</strong>
        <p style="margin: 4px 0 0; font-size: 11px; color: #475569;">${escapeHtml(address || 'Kéo thả ghim hoặc nhấp bản đồ để chỉnh vị trí')}</p>
      </div>`,
    );

    if (internalMoveRef.current) {
      internalMoveRef.current = false;
      return;
    }

    mapRef.current.setView([displayLat, displayLon], hasPinnedCoords ? 15 : 12, {
      animate: true,
    });
  }, [displayLat, displayLon, hasPinnedCoords, address, markerTitle]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (
        dropdownContainerRef.current &&
        !dropdownContainerRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const handleAddressInputChange = (val: string) => {
    setGpsError(null);
    onChange({
      address: val,
      lat: hasPinnedCoords ? Number(lat) : null,
      lon: hasPinnedCoords ? Number(lon) : null,
    });

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
      searchAbortRef.current = null;
    }

    const trimmed = val.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      setIsSearching(false);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      const controller = new AbortController();
      searchAbortRef.current = controller;
      setIsSearching(true);
      try {
        const list = await searchVietnamPlaces(trimmed, {
          limit: 6,
          biasLat: displayLat,
          biasLon: displayLon,
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setSuggestions(list);
          setShowDropdown(list.length > 0);
        }
      } catch {
        // Ignore geocode network errors
      } finally {
        if (searchAbortRef.current === controller) {
          searchAbortRef.current = null;
        }
        setIsSearching(false);
      }
    }, 320);
  };

  const handlePickSuggestion = (item: GeocodePlaceSuggestion) => {
    const pLat = Number(parseFloat(item.lat).toFixed(6));
    const pLon = Number(parseFloat(item.lon).toFixed(6));
    if (!Number.isFinite(pLat) || !Number.isFinite(pLon)) return;

    reverseAbortRef.current?.abort();
    setIsResolvingAddress(false);
    setShowDropdown(false);
    onChange({
      address: item.display_name,
      lat: pLat,
      lon: pLon,
    });
  };

  const handleDetectGps = async () => {
    setIsLocatingGps(true);
    setGpsError(null);
    try {
      const detected = await detectAccurateDeviceLocation({
        timeoutMs: 12000,
        acceptableAccuracyMeters: 400,
        refineWindowMs: 2500,
      });
      await resolveAndEmitPinMove(detected.lat, detected.lon);
    } catch {
      setGpsError('Không lấy được vị trí GPS. Hãy chọn trực tiếp trên bản đồ.');
    } finally {
      setIsLocatingGps(false);
    }
  };

  const handleResetToCompany = () => {
    if (!companyFallback) return;
    reverseAbortRef.current?.abort();
    setIsResolvingAddress(false);
    setGpsError(null);
    onChange({
      address: companyFallback.address?.trim() || '',
      lat: isValidCoords(companyFallback.lat, companyFallback.lon)
        ? Number(companyFallback.lat)
        : null,
      lon: isValidCoords(companyFallback.lat, companyFallback.lon)
        ? Number(companyFallback.lon)
        : null,
    });
  };

  const showCompanyReset = Boolean(
    companyFallback &&
      (companyFallback.address || isValidCoords(companyFallback.lat, companyFallback.lon)) &&
      (address.trim() !== (companyFallback.address || '').trim() ||
        lat !== (companyFallback.lat ?? null) ||
        lon !== (companyFallback.lon ?? null)),
  );

  return (
    <div className="space-y-2.5">
      {/* Address Autocomplete Input */}
      <div ref={dropdownContainerRef} className="relative">
        <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-primary pointer-events-none" />
        <input
          type="text"
          required={required}
          value={address}
          onChange={(e) => handleAddressInputChange(e.target.value)}
          onFocus={() => {
            if (suggestions.length > 0) setShowDropdown(true);
          }}
          placeholder={placeholder}
          className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-9 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white transition"
        />
        {(isSearching || isResolvingAddress) ? (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary" />
        ) : (
          address && (
            <button
              type="button"
              onClick={() => handleAddressInputChange('')}
              aria-label="Xóa địa chỉ"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )
        )}

        {showDropdown && suggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1.5 z-30 rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 shadow-xl max-h-56 overflow-y-auto p-1">
            {suggestions.map((item, idx) => (
              <button
                key={`${item.lat}-${item.lon}-${idx}`}
                type="button"
                onClick={() => handlePickSuggestion(item)}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-primary/5 dark:hover:bg-slate-800 text-xs text-slate-700 dark:text-slate-200 flex items-start gap-2 transition-colors cursor-pointer"
              >
                <Navigation className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                <span className="line-clamp-2">{item.display_name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Inline Interactive Map Container */}
      <div
        ref={mapWrapperRef}
        className="relative rounded-2xl overflow-hidden border border-slate-200/90 dark:border-slate-700/80 bg-slate-100 dark:bg-slate-800"
      >
        {/* Map Action Strip */}
        <div className="px-3 py-2 bg-white/95 dark:bg-slate-900/95 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {hasPinnedCoords ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200/70 dark:border-emerald-800/60 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Đã ghim trên bản đồ
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 dark:bg-amber-950/50 border border-amber-200/70 dark:border-amber-800/60 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                Nhấp bản đồ hoặc tìm địa chỉ để ghim
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {showCompanyReset && (
              <button
                type="button"
                onClick={handleResetToCompany}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:border-primary hover:text-primary transition-colors cursor-pointer"
                title="Dùng lại địa chỉ trụ sở công ty"
              >
                <Building2 className="h-3 w-3" />
                <span>Theo công ty</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => void handleDetectGps()}
              disabled={isLocatingGps}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:text-primary transition-colors cursor-pointer disabled:opacity-60"
              title="Lấy vị trí hiện tại"
            >
              {isLocatingGps ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Crosshair className="h-3 w-3" />
              )}
              <span>GPS</span>
            </button>

            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-1 rounded-lg bg-primary/10 hover:bg-primary px-2.5 py-1 text-[11px] font-bold text-primary hover:text-white transition-colors cursor-pointer"
            >
              <Maximize2 className="h-3 w-3" />
              <span>Mở bản đồ lớn</span>
            </button>
          </div>
        </div>

        <div className={`relative z-0 w-full ${mapHeightClass}`}>
          <div ref={mapContainerRef} className="w-full h-full" />
        </div>
      </div>

      {gpsError && (
        <p className="text-xs text-amber-600 dark:text-amber-400">{gpsError}</p>
      )}

      <LocationPickerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        initialLat={hasPinnedCoords ? Number(lat) : null}
        initialLon={hasPinnedCoords ? Number(lon) : null}
        initialAddress={address}
        title={modalTitle}
        subtitle={modalSubtitle}
        markerTitle={markerTitle}
        companyFallback={companyFallback}
        onConfirm={({ lat: pickedLat, lon: pickedLon, address: pickedAddress }) => {
          onChange({
            address: pickedAddress || address,
            lat: pickedLat,
            lon: pickedLon,
          });
        }}
      />
    </div>
  );
}
