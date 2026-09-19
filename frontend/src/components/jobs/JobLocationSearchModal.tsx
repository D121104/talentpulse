import React, { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AnimatePresence, motion } from 'framer-motion';
import {
  MapPin,
  Search,
  X,
  Crosshair,
  Briefcase,
  DollarSign,
  Building2,
  Navigation,
  Loader2,
  AlertTriangle,
  RotateCw,
  Compass,
} from 'lucide-react';
import { JobItem, searchJobsByLocationApi, formatSalary } from '../../lib/jobApi';

interface JobLocationSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  accessToken: string | null;
  onSelectJob?: (job: JobItem) => void;
}

// Fallback coordinates: Hanoi Center (Keangnam Landmark 72)
const DEFAULT_LAT = 21.0173;
const DEFAULT_LON = 105.7838;

const RADIUS_OPTIONS = [5, 10, 15, 20];

type LocationStatus = 'locating' | 'ready' | 'denied' | 'error';

export const JobLocationSearchModal: React.FC<JobLocationSearchModalProps> = ({
  isOpen,
  onClose,
  accessToken,
  onSelectJob,
}) => {
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('locating');
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [userLocationName, setUserLocationName] = useState<string>('');

  // Location Address Search
  const [locationInput, setLocationInput] = useState<string>('');
  const [locationSuggestions, setLocationSuggestions] = useState<
    Array<{ display_name: string; lat: string; lon: string }>
  >([]);
  const [isSearchingLocation, setIsSearchingLocation] = useState<boolean>(false);
  const [showLocationDropdown, setShowLocationDropdown] = useState<boolean>(false);
  const locationSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locationDropdownRef = useRef<HTMLDivElement>(null);

  const [radiusKm, setRadiusKm] = useState<number>(10);
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [debouncedKeyword, setDebouncedKeyword] = useState<string>('');

  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [totalJobs, setTotalJobs] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const radiusCircleRef = useRef<L.Circle | null>(null);
  const jobMarkersRef = useRef<Map<string, L.Marker>>(new Map());

  // Debounce search keyword input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedKeyword(searchKeyword);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchKeyword]);

  // Request browser location permission or recenter GPS
  const requestLocation = useCallback((isRecenter: boolean = false) => {
    if (!navigator.geolocation) {
      if (!isRecenter) setLocationStatus('error');
      return;
    }

    if (!isRecenter) {
      setLocationStatus('locating');
    }
    setIsLocating(true);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        };
        setCurrentCoords(next);
        setLocationStatus('ready');
        setIsLocating(false);

        if (mapInstanceRef.current) {
          mapInstanceRef.current.flyTo([next.lat, next.lon], 13, { duration: 1.2 });
        }
        if (userMarkerRef.current) {
          userMarkerRef.current.setLatLng([next.lat, next.lon]);
        }
        if (radiusCircleRef.current) {
          radiusCircleRef.current.setLatLng([next.lat, next.lon]);
        }
      },
      (err) => {
        setIsLocating(false);
        if (!isRecenter) {
          if (err.code === err.PERMISSION_DENIED) {
            setLocationStatus('denied');
          } else {
            setLocationStatus('error');
          }
        }
      },
      { timeout: 12000, enableHighAccuracy: true, maximumAge: 0 },
    );
  }, []);

  // Use default fallback if user rejects permission
  const handleUseDefaultLocation = () => {
    const fallback = { lat: DEFAULT_LAT, lon: DEFAULT_LON };
    setCurrentCoords(fallback);
    setLocationStatus('ready');
    setUserLocationName('Hà Nội (Mặc định)');
    setLocationInput('Hà Nội');
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([fallback.lat, fallback.lon], 13);
    }
  };

  // Reverse geocode to get city/district name of current coordinates
  useEffect(() => {
    if (!currentCoords) return;
    let isMounted = true;

    fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${currentCoords.lat}&lon=${currentCoords.lon}&zoom=14`,
      {
        headers: { 'Accept-Language': 'vi,en' },
      },
    )
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data?.display_name) {
          const parts = data.display_name.split(', ');
          const shortName = parts.slice(0, 3).join(', ');
          setUserLocationName(shortName);
          setLocationInput(shortName);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [currentCoords]);

  // Handle location search input change
  const handleLocationInputChange = (val: string) => {
    setLocationInput(val);
    if (locationSearchTimeoutRef.current) {
      clearTimeout(locationSearchTimeoutRef.current);
    }

    if (!val.trim()) {
      setLocationSuggestions([]);
      setShowLocationDropdown(false);
      return;
    }

    locationSearchTimeoutRef.current = setTimeout(async () => {
      setIsSearchingLocation(true);
      try {
        const q = encodeURIComponent(val.trim());
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${q}&countrycodes=vn&limit=5`,
          {
            headers: { 'Accept-Language': 'vi,en' },
          },
        );
        const data = await res.json();
        if (Array.isArray(data)) {
          setLocationSuggestions(data);
          setShowLocationDropdown(data.length > 0);
        }
      } catch {
        // Ignore geocode errors
      } finally {
        setIsSearchingLocation(false);
      }
    }, 400);
  };

  // Select location suggestion
  const handleSelectLocationSuggestion = (item: { display_name: string; lat: string; lon: string }) => {
    const lat = parseFloat(item.lat);
    const lon = parseFloat(item.lon);
    if (!isNaN(lat) && !isNaN(lon)) {
      const next = { lat, lon };
      setCurrentCoords(next);
      const parts = item.display_name.split(', ');
      const short = parts.slice(0, 3).join(', ');
      setLocationInput(short);
      setUserLocationName(short);
      setShowLocationDropdown(false);

      if (mapInstanceRef.current) {
        mapInstanceRef.current.setView([lat, lon], 14, { animate: true });
      }
    }
  };

  // Click outside to close location dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        locationDropdownRef.current &&
        !locationDropdownRef.current.contains(e.target as Node)
      ) {
        setShowLocationDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset and trigger location request on open
  useEffect(() => {
    if (!isOpen) {
      setLocationStatus('locating');
      setCurrentCoords(null);
      setUserLocationName('');
      setLocationInput('');
      setShowLocationDropdown(false);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      return;
    }

    requestLocation(false);
  }, [isOpen, requestLocation]);

  // Fetch jobs by location when coordinates are ready
  const fetchJobs = useCallback(async () => {
    if (!isOpen || !currentCoords) return;
    setIsLoading(true);

    try {
      const res = await searchJobsByLocationApi(
        {
          lat: currentCoords.lat,
          lon: currentCoords.lon,
          radius: radiusKm,
          query: debouncedKeyword.trim() || undefined,
          limit: 50,
        },
        accessToken,
      );

      setJobs(res.result || []);
      setTotalJobs(res.meta?.total || 0);
    } catch {
      setJobs([]);
      setTotalJobs(0);
    } finally {
      setIsLoading(false);
    }
  }, [isOpen, currentCoords, radiusKm, debouncedKeyword, accessToken]);

  useEffect(() => {
    if (isOpen && currentCoords && locationStatus === 'ready') {
      void fetchJobs();
    }
  }, [isOpen, currentCoords, locationStatus, fetchJobs]);

  // Initialize Map ONLY when currentCoords are available
  useEffect(() => {
    if (!isOpen || locationStatus !== 'ready' || !currentCoords || !mapContainerRef.current) {
      return;
    }

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [currentCoords.lat, currentCoords.lon],
        zoom: 13,
        zoomControl: false,
        attributionControl: false,
      });

      L.control
        .zoom({
          position: 'bottomright',
        })
        .addTo(map);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      // User location marker (Draggable Pulse style)
      const userIcon = L.divIcon({
        className: 'tp-user-location-marker',
        html: `
          <div style="position: relative; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; cursor: grab;">
            <div style="position: absolute; width: 44px; height: 44px; background-color: rgba(37, 99, 235, 0.25); border-radius: 50%; animation: ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
            <div style="position: relative; width: 32px; height: 32px; background: linear-gradient(135deg, #2563EB, #1D4ED8); border-radius: 50%; border: 3px solid white; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.45); display: flex; align-items: center; justify-content: center; color: white;">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="8" r="5"/>
                <path d="M20 21a8 8 0 0 0-16 0"/>
              </svg>
            </div>
          </div>
        `,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      });

      const userMarker = L.marker([currentCoords.lat, currentCoords.lon], {
        icon: userIcon,
        draggable: true,
        zIndexOffset: 1000,
      }).addTo(map);

      // Handle dragging the user marker
      userMarker.on('dragend', (e: any) => {
        const newPos = e.target.getLatLng();
        setCurrentCoords({ lat: newPos.lat, lon: newPos.lng });
      });

      userMarkerRef.current = userMarker;

      // Radius Circle
      const circle = L.circle([currentCoords.lat, currentCoords.lon], {
        radius: radiusKm * 1000,
        color: '#2563EB',
        weight: 2,
        fillColor: '#3B82F6',
        fillOpacity: 0.08,
      }).addTo(map);
      radiusCircleRef.current = circle;

      // Click on map to re-center location
      map.on('click', (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        setCurrentCoords({ lat, lon: lng });
      });

      mapInstanceRef.current = map;
    }

    const timer = setTimeout(() => {
      mapInstanceRef.current?.invalidateSize();
    }, 200);

    return () => {
      clearTimeout(timer);
    };
  }, [isOpen, locationStatus, currentCoords]);

  // Update map user position and radius circle
  useEffect(() => {
    if (!mapInstanceRef.current || !currentCoords) return;

    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([currentCoords.lat, currentCoords.lon]);
    }
    if (radiusCircleRef.current) {
      radiusCircleRef.current.setLatLng([currentCoords.lat, currentCoords.lon]);
      radiusCircleRef.current.setRadius(radiusKm * 1000);
    }
  }, [currentCoords, radiusKm]);

  // Update job markers on map
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    // Clear old markers
    jobMarkersRef.current.forEach((marker) => marker.remove());
    jobMarkersRef.current.clear();

    // Render new markers
    jobs.forEach((job) => {
      if (job.lat == null || job.lon == null) return;

      const isCurrentActive = job._id === activeJobId;
      const distLabel = job.distanceKm != null ? `${job.distanceKm} km` : 'Gần bạn';

      const jobIcon = L.divIcon({
        className: `tp-job-map-marker-${job._id}`,
        html: `
          <div style="position: relative; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: transform 0.2s ease;">
            <div style="
              display: inline-flex;
              align-items: center;
              gap: 4px;
              padding: 4px 8px;
              background: ${isCurrentActive ? '#1D4ED8' : '#2563EB'};
              color: white;
              font-size: 11px;
              font-weight: 700;
              font-family: system-ui, sans-serif;
              border-radius: 9999px;
              border: 2px solid white;
              box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4);
              white-space: nowrap;
              transform: ${isCurrentActive ? 'scale(1.15)' : 'scale(1)'};
            ">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <rect width="20" height="14" x="2" y="7" rx="2" ry="2"/>
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
              </svg>
              <span>${distLabel}</span>
            </div>
          </div>
        `,
        iconSize: [80, 30],
        iconAnchor: [40, 15],
        popupAnchor: [0, -18],
      });

      const marker = L.marker([job.lat, job.lon], { icon: jobIcon }).addTo(map);

      const jobId = job._id || (job as any).id;
      const salaryText = formatSalary(job.salary);

      const popupContent = `
        <div style="font-family: system-ui, sans-serif; padding: 6px; min-width: 220px; max-width: 260px;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
            ${
              job.company?.logo
                ? `<img src="${job.company.logo}" alt="${job.company?.name || ''}" style="width: 32px; height: 32px; border-radius: 6px; object-fit: contain; border: 1px solid #e2e8f0; background: white;" />`
                : ''
            }
            <div style="overflow: hidden;">
              <p style="font-size: 11px; font-weight: 600; color: #64748b; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${job.company?.name || 'Công ty tuyển dụng'}
              </p>
              <h4 style="font-size: 13px; font-weight: 700; color: #0f172a; margin: 2px 0 0 0; line-height: 1.3;">
                ${job.name}
              </h4>
            </div>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 4px; margin: 8px 0;">
            <span style="font-size: 10px; font-weight: 700; padding: 2px 6px; background: #EFF6FF; color: #2563EB; border-radius: 4px;">
              ${salaryText}
            </span>
            <span style="font-size: 10px; font-weight: 600; padding: 2px 6px; background: #F1F5F9; color: #475569; border-radius: 4px;">
              ${job.workingModel || 'Onsite'}
            </span>
            <span style="font-size: 10px; font-weight: 700; padding: 2px 6px; background: #ECFDF5; color: #059669; border-radius: 4px;">
              Cách bạn ${distLabel}
            </span>
          </div>
          <a href="/jobs/${jobId}" target="_blank" rel="noopener noreferrer" style="
            display: block;
            text-align: center;
            padding: 7px 12px;
            background: #2563EB;
            color: white;
            font-size: 11px;
            font-weight: 700;
            border-radius: 8px;
            text-decoration: none;
            margin-top: 6px;
          ">
            Xem chi tiết việc làm →
          </a>
        </div>
      `;

      marker.bindPopup(popupContent);

      marker.on('click', () => {
        setActiveJobId(jobId);
      });

      jobMarkersRef.current.set(jobId, marker);
    });
  }, [jobs, activeJobId]);

  // Handle card hover: highlight marker on map
  const handleCardHover = (job: JobItem) => {
    setActiveJobId(job._id);
    if (job.lat != null && job.lon != null && mapInstanceRef.current) {
      const marker = jobMarkersRef.current.get(job._id);
      if (marker) {
        marker.openPopup();
      }
    }
  };

  // Handle card click: center map
  const handleCardClick = (job: JobItem) => {
    setActiveJobId(job._id);
    if (job.lat != null && job.lon != null && mapInstanceRef.current) {
      mapInstanceRef.current.panTo([job.lat, job.lon], { animate: true, duration: 0.5 });
      const marker = jobMarkersRef.current.get(job._id);
      if (marker) {
        marker.openPopup();
      }
    }
    if (onSelectJob) {
      onSelectJob(job);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex flex-col bg-slate-100 dark:bg-slate-950 font-sans overflow-hidden">
        {/* TOP TOOLBAR (Header) */}
        <header className="h-16 px-4 sm:px-6 bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0 shadow-xs z-20">
          {/* Brand & Title */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                  Tìm việc theo Bản đồ
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800">
                  PRO
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block truncate max-w-xs">
                {userLocationName ? `Vị trí: ${userLocationName}` : 'Quét việc làm quanh bán kính thực tế'}
              </p>
            </div>
          </div>

          {/* Center: Search Keyword & Address Autocomplete & Radius Selector */}
          {locationStatus === 'ready' && (
            <div className="flex items-center gap-2.5 flex-1 max-w-3xl mx-2 sm:mx-4">
              {/* 1. Search Keyword Input */}
              <div className="relative flex-1 min-w-[140px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  placeholder="Chức danh, kỹ năng..."
                  className="w-full pl-9 pr-8 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 transition-colors"
                />
                {searchKeyword && (
                  <button
                    type="button"
                    onClick={() => setSearchKeyword('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* 2. Location Address Search Input with Autocomplete */}
              <div ref={locationDropdownRef} className="relative flex-1 min-w-[160px]">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-600" />
                <input
                  type="text"
                  value={locationInput}
                  onChange={(e) => handleLocationInputChange(e.target.value)}
                  onFocus={() => {
                    if (locationSuggestions.length > 0) setShowLocationDropdown(true);
                  }}
                  placeholder="Vị trí của bạn (VD: Thượng Thanh, Long Biên)"
                  className="w-full pl-9 pr-8 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 transition-colors"
                />
                {isSearchingLocation && (
                  <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-slate-400" />
                )}

                {/* Autocomplete Dropdown */}
                {showLocationDropdown && locationSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 max-h-56 overflow-y-auto z-50 p-1">
                    {locationSuggestions.map((item, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSelectLocationSuggestion(item)}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-blue-50 dark:hover:bg-slate-700/60 text-xs text-slate-700 dark:text-slate-200 transition-colors flex items-start gap-2"
                      >
                        <Navigation className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{item.display_name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 3. Radius Options (5 - 10 - 15 - 20 km) */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200/80 dark:border-slate-700 shrink-0">
                {RADIUS_OPTIONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRadiusKm(r)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      radiusKm === r
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-slate-700'
                    }`}
                  >
                    {r} km
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Right Controls: GPS Locate & Close */}
          <div className="flex items-center gap-2 shrink-0">
            {locationStatus === 'ready' && (
              <button
                type="button"
                onClick={() => requestLocation(true)}
                disabled={isLocating}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-colors cursor-pointer"
                title="Định vị lại vị trí GPS"
              >
                <Crosshair className={`w-4 h-4 text-blue-600 ${isLocating ? 'animate-spin' : ''}`} />
                <span className="hidden xl:inline">GPS của tôi</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
              aria-label="Đóng bản đồ"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </header>

        {/* PERMISSION & LOCATING STATES */}
        {locationStatus === 'locating' && (
          <div className="flex-1 flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-950">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl p-8 shadow-xl border border-slate-200/80 dark:border-slate-800 text-center"
            >
              <div className="relative mx-auto w-20 h-20 flex items-center justify-center mb-6">
                <div className="absolute inset-0 rounded-full bg-blue-500/20 animate-ping" />
                <div className="relative w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
                  <Compass className="w-8 h-8 animate-pulse" />
                </div>
              </div>

              <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white mb-2">
                Đang xác định vị trí của bạn
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-6">
                Vui lòng bấm <strong>"Cho phép" (Allow)</strong> trên thông báo quyền truy cập vị trí của trình duyệt để TalentPulse định vị và tìm việc làm gần bạn nhất.
              </p>

              <div className="flex flex-col gap-2.5">
                <div className="inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 text-xs font-semibold border border-blue-200/60 dark:border-blue-800">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  <span>Đang chờ cấp quyền định vị...</span>
                </div>

                <button
                  type="button"
                  onClick={handleUseDefaultLocation}
                  className="text-xs text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 py-2 transition-colors cursor-pointer"
                >
                  Hoặc sử dụng vị trí mặc định (Hà Nội) →
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {locationStatus === 'denied' && (
          <div className="flex-1 flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-950">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl p-8 shadow-xl border border-slate-200/80 dark:border-slate-800 text-center"
            >
              <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/60 flex items-center justify-center text-amber-600 dark:text-amber-400 mb-5">
                <AlertTriangle className="w-8 h-8" />
              </div>

              <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white mb-2">
                Chưa có quyền truy cập vị trí
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-6">
                Bạn đã chặn hoặc trình duyệt chưa cho phép quyền định vị. Bạn có thể bấm <strong>"Thử lại"</strong> và cấp quyền, hoặc tiếp tục với vị trí mặc định và nhập địa chỉ / nhấp chuột chọn điểm mong muốn trên bản đồ.
              </p>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => requestLocation(false)}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold shadow-md shadow-blue-500/20 hover:bg-blue-700 transition-colors cursor-pointer"
                >
                  <RotateCw className="w-4 h-4" />
                  <span>Thử cấp quyền lại</span>
                </button>
                <button
                  type="button"
                  onClick={handleUseDefaultLocation}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Dùng vị trí mặc định
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {locationStatus === 'error' && (
          <div className="flex-1 flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-950">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl p-8 shadow-xl border border-slate-200/80 dark:border-slate-800 text-center"
            >
              <div className="mx-auto w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800/60 flex items-center justify-center text-red-600 dark:text-red-400 mb-5">
                <Navigation className="w-8 h-8" />
              </div>

              <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white mb-2">
                Không thể xác định vị trí
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-6">
                Thiết bị hoặc trình duyệt không phản hồi toạ độ GPS. Bạn có thể tiếp tục với vị trí mặc định và nhập địa chỉ hoặc nhấp chuột lên bản đồ để chọn khu vực mong muốn.
              </p>

              <button
                type="button"
                onClick={handleUseDefaultLocation}
                className="w-full px-5 py-3 rounded-xl bg-blue-600 text-white text-xs font-bold shadow-md shadow-blue-500/20 hover:bg-blue-700 transition-colors cursor-pointer"
              >
                Mở bản đồ với vị trí mặc định
              </button>
            </motion.div>
          </div>
        )}

        {/* MAIN SPLIT-VIEW (Dual Pane) - 30% List / 70% Map */}
        {locationStatus === 'ready' && (
          <div className="flex-1 flex overflow-hidden">
            {/* LEFT PANE: JOB LIST (30% width on desktop) */}
            <div className="w-full lg:w-[32%] xl:w-[30%] h-full flex flex-col bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 z-10 shrink-0">
              {/* Header Summary */}
              <div className="px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                    {isLoading ? (
                      <span className="flex items-center gap-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                        Đang quét việc làm...
                      </span>
                    ) : (
                      <span>
                        <strong className="text-blue-600 dark:text-blue-400 font-extrabold">{totalJobs}</strong> việc ({radiusKm} km)
                      </span>
                    )}
                  </h3>
                </div>
                <span className="text-[10px] font-semibold text-slate-400">
                  Gần nhất trước
                </span>
              </div>

              {/* Scrollable Job Cards List */}
              <div className="flex-1 overflow-y-auto p-3 sm:p-4">
                {jobs.length === 0 && !isLoading ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6">
                    <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-slate-800 flex items-center justify-center text-blue-600 mb-3">
                      <MapPin className="w-7 h-7" />
                    </div>
                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                      Chưa có việc làm trong {radiusKm} km
                    </h4>
                    <p className="text-[11px] text-slate-500 max-w-xs mt-1 mb-4">
                      Thử mở rộng bán kính lên 15km hoặc 20km, hoặc kéo ghim vị trí đến khu vực khác.
                    </p>
                    <button
                      type="button"
                      onClick={() => setRadiusKm(20)}
                      className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-bold shadow-sm hover:bg-blue-700 transition-colors cursor-pointer"
                    >
                      Mở rộng bán kính 20 km
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {jobs.map((job) => {
                      const jobId = job._id || (job as any).id;
                      const isActive = jobId === activeJobId;
                      const salaryFormatted = formatSalary(job.salary);

                      return (
                        <div
                          key={jobId}
                          onMouseEnter={() => handleCardHover(job)}
                          onClick={() => handleCardClick(job)}
                          className={`group relative rounded-2xl p-3.5 transition-all duration-200 cursor-pointer border ${
                            isActive
                              ? 'bg-white dark:bg-slate-800 border-blue-600 dark:border-blue-500 shadow-md shadow-blue-500/10'
                              : 'bg-white dark:bg-slate-800/90 border-slate-200/80 dark:border-slate-800 hover:border-blue-400 hover:shadow-xs'
                          }`}
                        >
                          {/* Company Logo & Name Header */}
                          <div className="flex items-start gap-2.5 mb-2">
                            {job.company?.logo ? (
                              <img
                                src={job.company.logo}
                                alt={job.company?.name || ''}
                                className="w-9 h-9 rounded-xl object-contain bg-slate-50 dark:bg-slate-700/50 p-1 border border-slate-200/60 dark:border-slate-700 shrink-0"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-400 shrink-0">
                                <Building2 className="w-4 h-4" />
                              </div>
                            )}

                            <div className="overflow-hidden flex-1 min-w-0">
                              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate">
                                {job.company?.name || 'Công ty tuyển dụng'}
                              </p>
                              <a
                                href={`/jobs/${jobId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white line-clamp-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors block"
                              >
                                {job.name}
                              </a>
                            </div>
                          </div>

                          {/* Badges / Meta Info */}
                          <div className="flex items-center flex-wrap gap-1.5 mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-700/60">
                            {/* Distance Badge */}
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60">
                              <Navigation className="w-3 h-3 text-blue-600 dark:text-blue-400 shrink-0" />
                              <span>{job.distanceKm != null ? `${job.distanceKm} km` : 'Gần bạn'}</span>
                            </span>

                            {/* Salary Badge */}
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60">
                              <DollarSign className="w-3 h-3 text-emerald-600 shrink-0" />
                              <span>{salaryFormatted}</span>
                            </span>

                            {/* Working Model Badge */}
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-medium bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                              <Briefcase className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                              <span className="truncate max-w-[80px]">{job.workingModel || 'Onsite'}</span>
                            </span>
                          </div>

                          {/* Bottom Actions Row */}
                          <div className="mt-2.5 flex items-center justify-between pt-1">
                            <span className="text-[10px] text-slate-400">Xem vị trí map</span>
                            <a
                              href={`/jobs/${jobId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline"
                            >
                              <span>Xem chi tiết</span>
                              <span aria-hidden="true">→</span>
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT PANE: INTERACTIVE LEAFLET MAP (70% width on desktop) */}
            <div className="flex-1 h-full relative">
              {/* Map Canvas Container */}
              <div ref={mapContainerRef} className="w-full h-full z-0" />

              {/* Instruction Floating Hint at top */}
              <div className="absolute top-4 left-4 z-20 pointer-events-none">
                <div className="px-3.5 py-1.5 rounded-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-md border border-slate-200/80 dark:border-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-blue-600" />
                  <span>Kéo thả ghim xanh hoặc nhấp chuột lên bản đồ để đổi vị trí</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AnimatePresence>
  );
};

export default JobLocationSearchModal;
