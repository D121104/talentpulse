import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ExternalLink, Navigation } from 'lucide-react';

interface CompanyMapProps {
  companyName: string;
  address?: string | null;
  lat?: number | null;
  lon?: number | null;
  logo?: string | null;
  className?: string;
  zoom?: number;
}

// Fallback coordinates (Hanoi center)
const DEFAULT_LAT = 21.0285;
const DEFAULT_LON = 105.8542;

export default function CompanyMap({
  companyName,
  address,
  lat,
  lon,
  logo,
  className = 'h-64 sm:h-72 w-full',
  zoom = 15,
}: CompanyMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lon: number }>({
    lat: lat && !isNaN(lat) ? lat : DEFAULT_LAT,
    lon: lon && !isNaN(lon) ? lon : DEFAULT_LON,
  });
  const [hasValidCoords, setHasValidCoords] = useState<boolean>(
    Boolean(lat && lon && !isNaN(lat) && !isNaN(lon)),
  );
  const [isGeocoding, setIsGeocoding] = useState<boolean>(false);

  // Auto-geocode from address if lat/lon are missing
  useEffect(() => {
    if (lat && lon && !isNaN(lat) && !isNaN(lon)) {
      setCurrentCoords({ lat, lon });
      setHasValidCoords(true);
      return;
    }

    if (!address || !address.trim()) return;

    let isMounted = true;
    setIsGeocoding(true);

    const timer = setTimeout(async () => {
      try {
        const query = encodeURIComponent(address.trim());
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`,
          {
            headers: {
              'Accept-Language': 'vi,en',
            },
          },
        );
        const data = await res.json();
        if (isMounted && Array.isArray(data) && data.length > 0) {
          const parsedLat = parseFloat(data[0].lat);
          const parsedLon = parseFloat(data[0].lon);
          if (!isNaN(parsedLat) && !isNaN(parsedLon)) {
            setCurrentCoords({ lat: parsedLat, lon: parsedLon });
            setHasValidCoords(true);
          }
        }
      } catch {
        // Fallback to default coordinates
      } finally {
        if (isMounted) setIsGeocoding(false);
      }
    }, 400);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [lat, lon, address]);

  // Initialize and update Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Destroy any existing instance before re-initializing
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapContainerRef.current, {
      center: [currentCoords.lat, currentCoords.lon],
      zoom: zoom,
      scrollWheelZoom: false,
      zoomControl: true,
      attributionControl: false,
    });

    mapInstanceRef.current = map;

    // Clean, free OpenStreetMap tile layer (No watermark, no API key required)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    // Custom Pulse Marker matching TalentPulse theme
    const customIcon = L.divIcon({
      className: 'tp-map-marker-container',
      html: `
        <div style="position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;">
          <div style="position: absolute; width: 36px; height: 36px; background-color: rgba(37, 99, 235, 0.25); border-radius: 50%; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="position: relative; width: 28px; height: 28px; background: linear-gradient(135deg, #2563EB, #1D4ED8); border-radius: 50%; border: 3px solid white; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4); display: flex; align-items: center; justify-content: center; color: white;">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
          </div>
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      popupAnchor: [0, -18],
    });

    const marker = L.marker([currentCoords.lat, currentCoords.lon], {
      icon: customIcon,
    }).addTo(map);

    markerRef.current = marker;

    const popupHtml = `
      <div style="padding: 6px; font-family: system-ui, -apple-system, sans-serif;">
        ${logo ? `<img src="${logo}" alt="${companyName}" style="width: 28px; height: 28px; object-fit: contain; margin-bottom: 4px; border-radius: 6px;" />` : ''}
        <p style="font-size: 12px; font-weight: 800; color: #0f172a; margin: 0 0 4px 0;">${companyName}</p>
        <p style="font-size: 11px; color: #64748b; margin: 0 0 6px 0; max-width: 220px; line-height: 1.3;">${address || 'Vị trí công ty'}</p>
        <a href="https://www.google.com/maps?q=${currentCoords.lat},${currentCoords.lon}" target="_blank" rel="noopener noreferrer" style="display: inline-block; font-size: 11px; font-weight: 700; color: #2563EB; text-decoration: none;">
          Chỉ đường trên Google Maps →
        </a>
      </div>
    `;

    marker.bindPopup(popupHtml);

    // Invalidate size after mount to prevent grey boxes
    setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [currentCoords, companyName, address, zoom]);

  const googleMapsUrl = `https://www.google.com/maps?q=${currentCoords.lat},${currentCoords.lon}`;

  return (
    <div className="relative rounded-2xl overflow-hidden border border-slate-200/90 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shadow-sm group">
      {/* Map Header Toolbar */}
      <div className="px-4 py-2.5 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 z-10 relative">
        <div className="flex items-center gap-1.5 min-w-0">
          <Navigation className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
            Bản đồ định vị
          </span>
          {hasValidCoords ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/60 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Đã định vị
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-800/60 text-[10px] font-medium text-amber-600 dark:text-amber-400 shrink-0">
              {isGeocoding ? 'Đang tìm...' : 'Tọa độ ước lượng'}
            </span>
          )}
        </div>

        {/* Open in Google Maps Link */}
        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary text-primary hover:text-white dark:bg-primary/20 dark:text-primary-light dark:hover:bg-primary dark:hover:text-white text-[11px] font-bold transition-all shrink-0 cursor-pointer"
          title="Mở trên ứng dụng Google Maps"
        >
          <span>Mở trong Maps</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* Leaflet Map Canvas */}
      <div className={`relative z-0 ${className}`}>
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* Attribution Badge */}
        <div className="absolute bottom-1.5 right-2 z-[400] pointer-events-none">
          <span className="px-1.5 py-0.5 rounded bg-white/80 dark:bg-slate-900/80 backdrop-blur-xs text-[9px] font-medium text-slate-500 dark:text-slate-400 border border-slate-200/60 dark:border-slate-800">
            © OpenStreetMap • TalentPulse
          </span>
        </div>
      </div>
    </div>
  );
}
