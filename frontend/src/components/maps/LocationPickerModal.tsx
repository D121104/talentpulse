import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Building2,
  Check,
  Crosshair,
  ExternalLink,
  Loader2,
  MapPin,
  Navigation,
  Search,
  X,
} from 'lucide-react';
import {
  detectAccurateDeviceLocation,
  reverseGeocodePlace,
  searchVietnamPlaces,
  type GeocodePlaceSuggestion,
} from '../../lib/geocoding';

export interface PickedLocationResult {
  lat: number;
  lon: number;
  address: string;
}

export interface LocationPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialLat?: number | null;
  initialLon?: number | null;
  initialAddress?: string | null;
  title?: string;
  subtitle?: string;
  markerTitle?: string;
  companyFallback?: {
    address?: string | null;
    lat?: number | null;
    lon?: number | null;
  } | null;
  onConfirm: (location: PickedLocationResult) => void;
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

function buildPinPopupHtml(title: string, address: string, lat: number, lon: number): string {
  const safeTitle = escapeHtml(title || 'Vị trí đã chọn');
  const safeAddress = escapeHtml(address || 'Nhấp hoặc kéo thả ghim để điều chỉnh vị trí');
  const mapsUrl = `https://www.google.com/maps?q=${lat},${lon}`;

  return `
    <div style="padding: 4px 2px; font-family: system-ui, -apple-system, sans-serif; min-width: 190px; max-width: 260px;">
      <p style="font-size: 12px; font-weight: 800; color: #0f172a; margin: 0 0 4px 0;">${safeTitle}</p>
      <p style="font-size: 11px; color: #475569; margin: 0 0 6px 0; line-height: 1.4;">${safeAddress}</p>
      <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 700; color: #2563EB; text-decoration: none;">
        Xem trên Google Maps ↗
      </a>
    </div>
  `;
}

function createDraggablePinIcon(): L.DivIcon {
  return L.divIcon({
    className: 'tp-picker-pin',
    html: `
      <div style="position: relative; width: 42px; height: 42px; display: flex; align-items: center; justify-content: center; cursor: grab;">
        <div style="position: absolute; width: 42px; height: 42px; background-color: rgba(37, 99, 235, 0.28); border-radius: 50%; animation: ping 1.6s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
        <div style="position: relative; width: 32px; height: 32px; background: linear-gradient(135deg, #2563EB, #1D4ED8); border-radius: 50%; border: 3px solid white; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.45); display: flex; align-items: center; justify-content: center; color: white;">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
        </div>
      </div>
    `,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    popupAnchor: [0, -18],
  });
}

function isValidCoordinatePair(lat?: number | null, lon?: number | null): boolean {
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

export default function LocationPickerModal({
  isOpen,
  onClose,
  initialLat,
  initialLon,
  initialAddress,
  title = 'Chọn vị trí trên bản đồ',
  subtitle = 'Tìm địa chỉ, nhấp bản đồ hoặc kéo thả ghim xanh',
  markerTitle = 'Vị trí đã chọn',
  companyFallback,
  onConfirm,
}: LocationPickerModalProps) {
  const [coords, setCoords] = useState<{ lat: number; lon: number }>({
    lat: isValidCoordinatePair(initialLat, initialLon) ? Number(initialLat) : DEFAULT_HANOI_LAT,
    lon: isValidCoordinatePair(initialLat, initialLon) ? Number(initialLon) : DEFAULT_HANOI_LON,
  });
  const [selectedAddress, setSelectedAddress] = useState<string>(initialAddress || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GeocodePlaceSuggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isLocatingGps, setIsLocatingGps] = useState(false);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const reverseAbortRef = useRef<AbortController | null>(null);
  const coordsRef = useRef(coords);
  const markerTitleRef = useRef(markerTitle);

  useEffect(() => {
    coordsRef.current = coords;
  }, [coords]);

  useEffect(() => {
    markerTitleRef.current = markerTitle;
  }, [markerTitle]);

  const resolveAddressForCoords = useCallback(async (lat: number, lon: number) => {
    if (reverseAbortRef.current) {
      reverseAbortRef.current.abort();
    }
    const controller = new AbortController();
    reverseAbortRef.current = controller;
    setIsResolvingAddress(true);
    try {
      const resolved = await reverseGeocodePlace(lat, lon, controller.signal);
      if (resolved && !controller.signal.aborted) {
        setSelectedAddress(resolved);
        setSearchQuery(resolved);
      }
    } finally {
      if (reverseAbortRef.current === controller) {
        reverseAbortRef.current = null;
        setIsResolvingAddress(false);
      }
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      const hasValidInit = isValidCoordinatePair(initialLat, initialLon);
      const nextLat = hasValidInit ? Number(initialLat) : DEFAULT_HANOI_LAT;
      const nextLon = hasValidInit ? Number(initialLon) : DEFAULT_HANOI_LON;
      setCoords({ lat: nextLat, lon: nextLon });
      setSelectedAddress(initialAddress || '');
      setSearchQuery(initialAddress || '');
      setSearchResults([]);
      setShowDropdown(false);
      setGpsError(null);
      return;
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    reverseAbortRef.current?.abort();
    reverseAbortRef.current = null;
  }, [isOpen, initialLat, initialLon, initialAddress]);

  // Close autocomplete on outside click or Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showDropdown) setShowDropdown(false);
        else onClose();
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, showDropdown, onClose]);

  // Initialize Leaflet map once per open
  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const startLat = isValidCoordinatePair(initialLat, initialLon)
      ? Number(initialLat)
      : DEFAULT_HANOI_LAT;
    const startLon = isValidCoordinatePair(initialLat, initialLon)
      ? Number(initialLon)
      : DEFAULT_HANOI_LON;
    const startZoom = isValidCoordinatePair(initialLat, initialLon) ? 16 : 13;

    const map = L.map(mapContainerRef.current, {
      center: [startLat, startLon],
      zoom: startZoom,
      zoomControl: true,
      attributionControl: false,
    });
    mapInstanceRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    const marker = L.marker([startLat, startLon], {
      icon: createDraggablePinIcon(),
      draggable: true,
    }).addTo(map);
    markerRef.current = marker;

    marker.on('dragend', (e) => {
      const pos = (e.target as L.Marker).getLatLng();
      setGpsError(null);
      setCoords({ lat: pos.lat, lon: pos.lng });
      void resolveAddressForCoords(pos.lat, pos.lng);
    });

    map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      setGpsError(null);
      setCoords({ lat, lon: lng });
      marker.setLatLng([lat, lng]);
      void resolveAddressForCoords(lat, lng);
    });

    const resizeTimer = setTimeout(() => {
      map.invalidateSize();
    }, 180);

    return () => {
      clearTimeout(resizeTimer);
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
    };
  }, [isOpen, initialLat, initialLon, resolveAddressForCoords]);

  // Keep popup content synced with selected coordinates & address
  useEffect(() => {
    if (!markerRef.current) return;
    markerRef.current.setLatLng([coords.lat, coords.lon]);
    markerRef.current.bindPopup(
      buildPinPopupHtml(markerTitle, selectedAddress, coords.lat, coords.lon),
    );
  }, [coords.lat, coords.lon, selectedAddress, markerTitle]);

  const moveMapTo = useCallback((lat: number, lon: number, zoom = 16) => {
    setCoords({ lat, lon });
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lon]);
    }
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([lat, lon], zoom, { duration: 0.9 });
    }
  }, []);

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    setGpsError(null);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
      searchAbortRef.current = null;
    }

    const trimmed = val.trim();
    if (!trimmed) {
      setSearchResults([]);
      setShowDropdown(false);
      setIsSearching(false);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      const controller = new AbortController();
      searchAbortRef.current = controller;
      setIsSearching(true);
      try {
        const results = await searchVietnamPlaces(trimmed, {
          limit: 6,
          biasLat: coordsRef.current.lat,
          biasLon: coordsRef.current.lon,
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setSearchResults(results);
          setShowDropdown(results.length > 0);
        }
      } catch {
        // Ignore network/abort errors
      } finally {
        if (searchAbortRef.current === controller) {
          searchAbortRef.current = null;
        }
        setIsSearching(false);
      }
    }, 300);
  };

  const handleSelectSuggestion = (item: GeocodePlaceSuggestion) => {
    const pLat = parseFloat(item.lat);
    const pLon = parseFloat(item.lon);
    if (!Number.isFinite(pLat) || !Number.isFinite(pLon)) return;

    reverseAbortRef.current?.abort();
    setIsResolvingAddress(false);
    setSelectedAddress(item.display_name);
    setSearchQuery(item.display_name);
    setShowDropdown(false);
    moveMapTo(pLat, pLon, 16);
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
      moveMapTo(detected.lat, detected.lon, 16);
      void resolveAddressForCoords(detected.lat, detected.lon);
    } catch {
      setGpsError('Không lấy được GPS thiết bị. Hãy kiểm tra quyền định vị hoặc tìm địa chỉ.');
    } finally {
      setIsLocatingGps(false);
    }
  };

  const handleResetToCompany = () => {
    if (!companyFallback) return;
    const hasCoords = isValidCoordinatePair(companyFallback.lat, companyFallback.lon);
    const addr = companyFallback.address?.trim() || '';
    if (addr) {
      setSelectedAddress(addr);
      setSearchQuery(addr);
    }
    if (hasCoords) {
      moveMapTo(Number(companyFallback.lat), Number(companyFallback.lon), 16);
    }
  };

  const handleConfirm = () => {
    const finalAddress = selectedAddress.trim() || searchQuery.trim();
    onConfirm({
      lat: Number(coords.lat.toFixed(6)),
      lon: Number(coords.lon.toFixed(6)),
      address: finalAddress,
    });
    onClose();
  };

  if (!isOpen) return null;

  const canUseCompanyFallback = Boolean(
    companyFallback &&
      (companyFallback.address || isValidCoordinatePair(companyFallback.lat, companyFallback.lon)),
  );

  const modalContent = (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-2 sm:p-5 bg-slate-950/65 backdrop-blur-sm">
      <div className="relative flex flex-col w-full max-w-5xl h-[88dvh] rounded-2xl sm:rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        {/* Top Toolbar matching JobLocationSearchModal style */}
        <header className="px-4 sm:px-6 py-3.5 bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 flex flex-wrap lg:flex-nowrap items-center justify-between gap-3 shrink-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
              <MapPin className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white truncate">
                {title}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {subtitle}
              </p>
            </div>
          </div>

          {/* Search Autocomplete Input */}
          <div ref={dropdownRef} className="relative flex-1 min-w-[220px] max-w-xl">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-600" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => {
                if (searchResults.length > 0) setShowDropdown(true);
              }}
              placeholder="Tìm địa chỉ, quận/huyện, tên tòa nhà..."
              className="w-full pl-10 pr-9 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 transition-colors"
            />
            {isSearching ? (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-blue-600" />
            ) : (
              searchQuery && (
                <button
                  type="button"
                  onClick={() => handleSearchChange('')}
                  aria-label="Xóa từ khóa tìm kiếm"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )
            )}

            {showDropdown && searchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl max-h-60 overflow-y-auto z-50 p-1">
                {searchResults.map((item, idx) => (
                  <button
                    key={`${item.lat}-${item.lon}-${idx}`}
                    type="button"
                    onClick={() => handleSelectSuggestion(item)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-blue-50 dark:hover:bg-slate-700/70 text-xs text-slate-700 dark:text-slate-200 transition-colors flex items-start gap-2 cursor-pointer"
                  >
                    <Navigation className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                    <span className="line-clamp-2">{item.display_name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {canUseCompanyFallback && (
              <button
                type="button"
                onClick={handleResetToCompany}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-blue-500 hover:text-blue-600 transition-colors cursor-pointer"
              >
                <Building2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Theo trụ sở công ty</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => void handleDetectGps()}
              disabled={isLocatingGps}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/50 text-xs font-bold text-slate-700 dark:text-slate-200 hover:text-blue-600 transition-colors cursor-pointer disabled:opacity-60"
            >
              {isLocatingGps ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
              ) : (
                <Crosshair className="w-3.5 h-3.5 text-blue-600" />
              )}
              <span>GPS của tôi</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng bản đồ"
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Map Canvas */}
        <div className="relative flex-1 min-h-0 z-0">
          <div ref={mapContainerRef} className="w-full h-full" />

          {/* Floating Instruction Pill */}
          <div className="pointer-events-none absolute top-3 left-14 z-[400] hidden sm:inline-flex items-center gap-1.5 rounded-full bg-slate-900/85 px-3.5 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur-md">
            <MapPin className="w-3.5 h-3.5 text-blue-400" />
            <span>Kéo thả ghim xanh hoặc nhấp chuột lên bản đồ để chọn vị trí</span>
          </div>

          {gpsError && (
            <div className="absolute top-3 right-3 z-[400] max-w-xs rounded-xl bg-amber-50 dark:bg-amber-950/90 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs font-medium text-amber-800 dark:text-amber-200 shadow-lg">
              {gpsError}
            </div>
          )}
        </div>

        {/* Footer: Human-readable Address & Confirm */}
        <footer className="px-4 sm:px-6 py-3.5 border-t border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
              {isResolvingAddress ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <MapPin className="w-4 h-4" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                {isResolvingAddress
                  ? 'Đang xác định địa chỉ...'
                  : selectedAddress || 'Chưa có tên địa chỉ — nhập ở thanh tìm kiếm hoặc chọn trên bản đồ'}
              </p>
              <a
                href={`https://www.google.com/maps?q=${coords.lat},${coords.lon}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline mt-0.5"
              >
                <span>Mở kiểm tra trên Google Maps</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-600/25 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <Check className="w-4 h-4" />
              <span>Xác nhận vị trí</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
