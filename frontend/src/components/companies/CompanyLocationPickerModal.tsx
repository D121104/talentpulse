import { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  MapPin,
  Search,
  Check,
  X,
  Loader2,
  Crosshair,
} from 'lucide-react';

interface CompanyLocationPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialLat?: number | null;
  initialLon?: number | null;
  initialAddress?: string | null;
  onConfirm: (coords: { lat: number; lon: number; address?: string }) => void;
}

const DEFAULT_HANOI_LAT = 21.0285;
const DEFAULT_HANOI_LON = 105.8542;

export default function CompanyLocationPickerModal({
  isOpen,
  onClose,
  initialLat,
  initialLon,
  initialAddress,
  onConfirm,
}: CompanyLocationPickerModalProps) {
  const [coords, setCoords] = useState<{ lat: number; lon: number }>({
    lat: initialLat && !isNaN(initialLat) ? initialLat : DEFAULT_HANOI_LAT,
    lon: initialLon && !isNaN(initialLon) ? initialLon : DEFAULT_HANOI_LON,
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<
    Array<{ display_name: string; lat: string; lon: string }>
  >([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<string>(
    initialAddress || '',
  );

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync initial props on open
  useEffect(() => {
    if (isOpen) {
      const initL = initialLat && !isNaN(initialLat) ? initialLat : DEFAULT_HANOI_LAT;
      const initLo = initialLon && !isNaN(initialLon) ? initialLon : DEFAULT_HANOI_LON;
      setCoords({ lat: initL, lon: initLo });
      setSelectedAddress(initialAddress || '');
      setSearchQuery('');
      setSearchResults([]);
    }
  }, [isOpen, initialLat, initialLon, initialAddress]);

  // Leaflet map initialization
  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapContainerRef.current, {
      center: [coords.lat, coords.lon],
      zoom: 15,
      zoomControl: true,
      attributionControl: false,
    });

    mapInstanceRef.current = map;

    // Clean, free OpenStreetMap tile layer (No watermark, no API key required)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    const customPin = L.divIcon({
      className: 'tp-picker-pin',
      html: `
        <div style="position: relative; width: 42px; height: 42px; display: flex; align-items: center; justify-content: center; cursor: grab;">
          <div style="position: absolute; width: 42px; height: 42px; background-color: rgba(37, 99, 235, 0.3); border-radius: 50%; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="position: relative; width: 32px; height: 32px; background: linear-gradient(135deg, #2563EB, #1E40AF); border-radius: 50%; border: 3px solid white; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.5); display: flex; align-items: center; justify-content: center; color: white;">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
          </div>
        </div>
      `,
      iconSize: [42, 42],
      iconAnchor: [21, 21],
    });

    const marker = L.marker([coords.lat, coords.lon], {
      icon: customPin,
      draggable: true,
    }).addTo(map);

    markerRef.current = marker;

    // Drag marker event
    marker.on('dragend', (e) => {
      const newPos = (e.target as L.Marker).getLatLng();
      setCoords({ lat: newPos.lat, lon: newPos.lng });
    });

    // Click map to reposition marker
    map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      setCoords({ lat, lon: lng });
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      }
    });

    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [isOpen]);

  // Update marker position when coords state changes
  const updateMapPosition = (newLat: number, newLon: number, newZoom = 16) => {
    setCoords({ lat: newLat, lon: newLon });
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([newLat, newLon], newZoom);
    }
    if (markerRef.current) {
      markerRef.current.setLatLng([newLat, newLon]);
    }
  };

  // Search address handler with debounce
  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!val.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const q = encodeURIComponent(val.trim());
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${q}&countrycodes=vn&limit=5`,
          {
            headers: { 'Accept-Language': 'vi,en' },
          },
        );
        const data = await res.json();
        setSearchResults(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Failed to geocode address', err);
      } finally {
        setIsSearching(false);
      }
    }, 450);
  };

  // Pick search result
  const handleSelectSearchResult = (item: {
    display_name: string;
    lat: string;
    lon: string;
  }) => {
    const pLat = parseFloat(item.lat);
    const pLon = parseFloat(item.lon);
    if (!isNaN(pLat) && !isNaN(pLon)) {
      updateMapPosition(pLat, pLon, 16);
      setSelectedAddress(item.display_name);
      setSearchQuery('');
      setSearchResults([]);
    }
  };

  // Locate current user device GPS position
  const handleLocateCurrentDevice = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        updateMapPosition(pos.coords.latitude, pos.coords.longitude, 16);
      },
      (err) => {
        console.warn('Cannot get geolocation', err);
      },
    );
  };

  const handleConfirm = () => {
    onConfirm({
      lat: Number(coords.lat.toFixed(6)),
      lon: Number(coords.lon.toFixed(6)),
      address: selectedAddress || undefined,
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-3xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                Chọn vị trí định vị công ty
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Click hoặc kéo thả ghim trên bản đồ để xác định tọa độ chính xác
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar & Auto-complete */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 relative">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Tìm kiếm địa chỉ, tên tòa nhà hoặc đường phố..."
              className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
            />
            {isSearching && (
              <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-primary animate-spin" />
            )}
          </div>

          {/* Autocomplete Results Dropdown */}
          {searchResults.length > 0 && (
            <div className="absolute left-4 right-4 top-full mt-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden z-50 divide-y divide-slate-100 dark:divide-slate-800 max-h-48 overflow-y-auto">
              {searchResults.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectSearchResult(item)}
                  className="w-full px-4 py-2.5 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-primary/5 hover:text-primary transition-colors flex items-start gap-2 cursor-pointer"
                >
                  <MapPin className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                  <span className="line-clamp-2">{item.display_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Map Container */}
        <div className="relative flex-1 min-h-[340px] sm:min-h-[400px]">
          <div ref={mapContainerRef} className="w-full h-full" />

          {/* Quick Locate My Position Button */}
          <button
            type="button"
            onClick={handleLocateCurrentDevice}
            className="absolute bottom-4 right-4 z-[400] flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 shadow-lg hover:text-primary hover:border-primary transition-all cursor-pointer"
            title="Lấy vị trí hiện tại của bạn"
          >
            <Crosshair className="w-4 h-4 text-primary" />
            <span>Vị trí của tôi</span>
          </button>
        </div>

        {/* Modal Footer: Coordinates Info + Confirm CTA */}
        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              Tọa độ đã chọn:
            </span>{' '}
            <code className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-primary font-mono text-[11px] font-bold">
              {coords.lat.toFixed(5)}, {coords.lon.toFixed(5)}
            </code>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Hủy bỏ
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="px-5 py-2 rounded-xl bg-primary hover:bg-primary-dark text-white text-xs font-bold shadow-md shadow-primary/25 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <Check className="w-4 h-4" />
              <span>Xác nhận tọa độ</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
