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
  RotateCcw,
  Compass,
  ExternalLink,
} from 'lucide-react';
import { JobItem, searchJobsByLocationApi, formatSalary } from '../../lib/jobApi';
import {
  JOB_LEVEL_OPTIONS,
  SALARY_PRESETS,
  WORKING_MODEL_OPTIONS,
  parseSalaryPresetValue,
  formatShortSalaryLabel,
  buildGoogleMapsDirectionsUrl,
  clusterJobsByLocation,
  type JobLocationCluster,
} from '../../lib/jobFilters';
import { useAuth } from '../../auth/AuthContext';
import {
  searchVietnamPlaces,
  reverseGeocodePlace,
  detectAccurateDeviceLocation,
  loadSavedMapLocation,
  saveMapLocation,
  type GeocodePlaceSuggestion,
} from '../../lib/geocoding';

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

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isSafeHttpUrl(url?: string | null): boolean {
  if (!url) return false;
  return url.startsWith('https://') || url.startsWith('http://') || url.startsWith('/');
}

function createJobMarkerIcon(options: {
  distLabel: string;
  salaryLabel?: string;
  showSalary?: boolean;
  count?: number;
  isActive: boolean;
}): L.DivIcon {
  const { distLabel, salaryLabel, showSalary = false, count = 1, isActive } = options;
  const safeDist = escapeHtml(distLabel);
  const safeSalary = salaryLabel ? escapeHtml(salaryLabel) : '';
  const isCluster = count > 1;

  const badgeText = isCluster
    ? `${count} việc · ${safeDist}`
    : showSalary && safeSalary
      ? `${safeDist} · ${safeSalary}`
      : safeDist;

  const background = isCluster
    ? isActive
      ? '#4338CA'
      : '#4F46E5'
    : isActive
      ? '#1D4ED8'
      : '#2563EB';
  const shadowColor = isCluster ? 'rgba(79, 70, 229, 0.42)' : 'rgba(37, 99, 235, 0.4)';

  return L.divIcon({
    className: 'tp-job-map-marker',
    html: `
      <div style="position: relative; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: transform 0.2s ease;">
        <div style="
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 9px;
          background: ${background};
          color: white;
          font-size: 11px;
          font-weight: 700;
          font-family: system-ui, sans-serif;
          border-radius: 9999px;
          border: 2px solid white;
          box-shadow: 0 4px 12px ${shadowColor};
          white-space: nowrap;
          transform: ${isActive ? 'scale(1.12)' : 'scale(1)'};
        ">
          ${
            isCluster
              ? `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>`
              : `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`
          }
          <span>${badgeText}</span>
        </div>
      </div>
    `,
    iconSize: [isCluster || (showSalary && safeSalary) ? 124 : 84, 30],
    iconAnchor: [isCluster || (showSalary && safeSalary) ? 62 : 42, 15],
    popupAnchor: [0, -18],
  });
}

function buildJobActionsHtml(
  jobId: string,
  jobLat: number,
  jobLon: number,
  origin?: { lat: number; lon: number } | null,
): string {
  const safeJobId = encodeURIComponent(String(jobId));
  const safeDirectionsUrl = escapeHtml(buildGoogleMapsDirectionsUrl(jobLat, jobLon, origin));

  return `
    <div style="display: flex; align-items: center; gap: 6px; margin-top: 8px;">
      <a href="${safeDirectionsUrl}" target="_blank" rel="noopener noreferrer" style="
        flex: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        padding: 6px 8px;
        background: #F8FAFC;
        color: #0F172A;
        border: 1px solid #CBD5E1;
        font-size: 11px;
        font-weight: 700;
        border-radius: 8px;
        text-decoration: none;
      ">
        Chỉ đường
      </a>
      <a href="/jobs/${safeJobId}" target="_blank" rel="noopener noreferrer" style="
        flex: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 6px 10px;
        background: #2563EB;
        color: white;
        font-size: 11px;
        font-weight: 700;
        border-radius: 8px;
        text-decoration: none;
      ">
        Chi tiết →
      </a>
    </div>
  `;
}

function buildClusterPopupHtml(
  cluster: JobLocationCluster<JobItem>,
  origin?: { lat: number; lon: number } | null,
): string {
  const distLabel = cluster.distanceKm != null ? `${cluster.distanceKm} km (chim bay)` : 'Gần bạn';

  if (cluster.jobs.length === 1) {
    const job = cluster.jobs[0];
    const jobId = String(job._id || (job as any).id);
    const safeCompanyName = escapeHtml(job.company?.name || 'Công ty tuyển dụng');
    const safeJobName = escapeHtml(job.name || '');
    const safeSalaryText = escapeHtml(formatSalary(job.salary));
    const safeWorkingModel = escapeHtml(job.workingModel || 'Onsite');
    const safeDistLabel = escapeHtml(distLabel);
    const safeLogoUrl = isSafeHttpUrl(job.company?.logo) ? escapeHtml(job.company!.logo!) : '';

    return `
      <div style="font-family: system-ui, sans-serif; padding: 6px; min-width: 230px; max-width: 270px;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
          ${
            safeLogoUrl
              ? `<img src="${safeLogoUrl}" alt="${safeCompanyName}" style="width: 32px; height: 32px; border-radius: 6px; object-fit: contain; border: 1px solid #e2e8f0; background: white;" />`
              : ''
          }
          <div style="overflow: hidden;">
            <p style="font-size: 11px; font-weight: 600; color: #64748b; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${safeCompanyName}
            </p>
            <h4 style="font-size: 13px; font-weight: 700; color: #0f172a; margin: 2px 0 0 0; line-height: 1.3;">
              ${safeJobName}
            </h4>
          </div>
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 4px; margin: 8px 0;">
          <span style="font-size: 10px; font-weight: 700; padding: 2px 6px; background: #EFF6FF; color: #2563EB; border-radius: 4px;">
            ${safeSalaryText}
          </span>
          <span style="font-size: 10px; font-weight: 600; padding: 2px 6px; background: #F1F5F9; color: #475569; border-radius: 4px;">
            ${safeWorkingModel}
          </span>
          <span style="font-size: 10px; font-weight: 700; padding: 2px 6px; background: #ECFDF5; color: #059669; border-radius: 4px;">
            ${safeDistLabel}
          </span>
        </div>
        ${buildJobActionsHtml(jobId, cluster.lat, cluster.lon, origin)}
      </div>
    `;
  }

  const rowsHtml = cluster.jobs
    .map((job) => {
      const jobId = String(job._id || (job as any).id);
      const safeCompanyName = escapeHtml(job.company?.name || 'Công ty tuyển dụng');
      const safeJobName = escapeHtml(job.name || '');
      const safeSalaryText = escapeHtml(formatSalary(job.salary));
      const safeWorkingModel = escapeHtml(job.workingModel || 'Onsite');

      return `
        <div style="padding: 8px 0; border-top: 1px solid #E2E8F0;">
          <p style="font-size: 10px; font-weight: 600; color: #64748B; margin: 0;">${safeCompanyName}</p>
          <p style="font-size: 12px; font-weight: 700; color: #0F172A; margin: 2px 0 4px 0; line-height: 1.3;">${safeJobName}</p>
          <div style="display: flex; flex-wrap: wrap; gap: 4px;">
            <span style="font-size: 10px; font-weight: 700; padding: 2px 6px; background: #EFF6FF; color: #2563EB; border-radius: 4px;">${safeSalaryText}</span>
            <span style="font-size: 10px; font-weight: 600; padding: 2px 6px; background: #F1F5F9; color: #475569; border-radius: 4px;">${safeWorkingModel}</span>
          </div>
          ${buildJobActionsHtml(jobId, cluster.lat, cluster.lon, origin)}
        </div>
      `;
    })
    .join('');

  return `
    <div style="font-family: system-ui, sans-serif; padding: 4px; min-width: 245px; max-width: 290px;">
      <div style="padding-bottom: 6px;">
        <p style="font-size: 12px; font-weight: 800; color: #312E81; margin: 0;">
          ${cluster.jobs.length} vị trí tại cùng địa điểm
        </p>
        <p style="font-size: 10px; font-weight: 600; color: #059669; margin: 2px 0 0 0;">
          Cách bạn ${escapeHtml(distLabel)}
        </p>
      </div>
      <div style="max-height: 240px; overflow-y: auto; padding-right: 4px;">
        ${rowsHtml}
      </div>
    </div>
  `;
}

export const JobLocationSearchModal: React.FC<JobLocationSearchModalProps> = ({
  isOpen,
  onClose,
  accessToken,
  onSelectJob,
}) => {
  const { user } = useAuth();
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('locating');
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [userLocationName, setUserLocationName] = useState<string>('');
  const [locationAccuracyNotice, setLocationAccuracyNotice] = useState<string | null>(null);

  // Location Address Search
  const [locationInput, setLocationInput] = useState<string>('');
  const [locationSuggestions, setLocationSuggestions] = useState<GeocodePlaceSuggestion[]>([]);
  const [isSearchingLocation, setIsSearchingLocation] = useState<boolean>(false);
  const [showLocationDropdown, setShowLocationDropdown] = useState<boolean>(false);
  const locationSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locationSearchAbortRef = useRef<AbortController | null>(null);
  const locationDropdownRef = useRef<HTMLDivElement>(null);

  const [radiusKm, setRadiusKm] = useState<number>(10);
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [debouncedKeyword, setDebouncedKeyword] = useState<string>('');
  const [filterLevel, setFilterLevel] = useState<string>('');
  const [filterSalary, setFilterSalary] = useState<string>('');
  const [filterWorkingModel, setFilterWorkingModel] = useState<string>('');
  const [mapZoom, setMapZoom] = useState<number>(13);

  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [totalJobs, setTotalJobs] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const radiusCircleRef = useRef<L.Circle | null>(null);
  const jobMarkersRef = useRef<
    Map<
      string,
      {
        cluster: JobLocationCluster<JobItem>;
        marker: L.Marker;
        distLabel: string;
        salaryLabel: string;
      }
    >
  >(new Map());
  const jobToClusterKeyRef = useRef<Map<string, string>>(new Map());
  const prevActiveJobIdRef = useRef<string | null>(null);
  const activeJobIdRef = useRef<string | null>(activeJobId);
  activeJobIdRef.current = activeJobId;
  const mapZoomRef = useRef<number>(mapZoom);
  mapZoomRef.current = mapZoom;
  const radiusKmRef = useRef<number>(radiusKm);
  radiusKmRef.current = radiusKm;
  const skipNextReverseGeocodeRef = useRef<boolean>(false);
  const currentCoordsRef = useRef<{ lat: number; lon: number } | null>(currentCoords);
  currentCoordsRef.current = currentCoords;
  const hasReadyCoords = Boolean(currentCoords);

  // Debounce search keyword input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedKeyword(searchKeyword);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchKeyword]);

  const userRef = useRef(user);
  userRef.current = user;
  const persistManualLocation = useCallback(
    (lat: number, lon: number, label?: string) => {
      setLocationAccuracyNotice(null);
      saveMapLocation(
        {
          lat,
          lon,
          label,
          source: 'manual',
          updatedAt: Date.now(),
        },
        userRef.current?._id,
      );
    },
    [],
  );

  // Request browser location permission or recenter GPS
  const requestLocation = useCallback(async (isRecenter: boolean = false) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      if (!isRecenter) setLocationStatus('error');
      return;
    }

    if (!isRecenter) {
      setLocationStatus('locating');
    }
    setIsLocating(true);

    try {
      const detected = await detectAccurateDeviceLocation({
        timeoutMs: 12000,
        acceptableAccuracyMeters: 400,
        refineWindowMs: 2500,
      });

      const currentUser = userRef.current;
      let nextCoords = { lat: detected.lat, lon: detected.lon };
      let notice: string | null = null;
      let source: 'gps' | 'profile' = 'gps';
      let presetLabel: string | undefined;

      if (detected.accuracy > 1500) {
        const approxKm = (detected.accuracy / 1000).toFixed(1);
        const profileAddress = !isRecenter ? currentUser?.address?.trim() : '';

        if (profileAddress) {
          const profileMatches = await searchVietnamPlaces(profileAddress, { limit: 1 });
          if (profileMatches.length > 0) {
            const pLat = parseFloat(profileMatches[0].lat);
            const pLon = parseFloat(profileMatches[0].lon);
            if (Number.isFinite(pLat) && Number.isFinite(pLon)) {
              nextCoords = { lat: pLat, lon: pLon };
              source = 'profile';
              presetLabel = profileMatches[0].short_name;
              skipNextReverseGeocodeRef.current = true;
              setUserLocationName(presetLabel);
              setLocationInput(presetLabel);
              notice = `Định vị mạng có sai số ~${approxKm} km, đang đặt theo địa chỉ hồ sơ. Bạn có thể nhập lại hoặc kéo ghim.`;
            }
          }
        }

        if (!notice) {
          notice = `Định vị qua mạng có sai số ~${approxKm} km. Hãy nhập khu vực cụ thể hoặc kéo ghim về đúng vị trí.`;
        }
      }

      setLocationAccuracyNotice(notice);
      setCurrentCoords(nextCoords);
      setLocationStatus('ready');
      saveMapLocation(
        {
          lat: nextCoords.lat,
          lon: nextCoords.lon,
          label: presetLabel,
          source,
          updatedAt: Date.now(),
        },
        currentUser?._id,
      );

      if (mapInstanceRef.current) {
        mapInstanceRef.current.flyTo([nextCoords.lat, nextCoords.lon], 13, { duration: 1.2 });
      }
      if (userMarkerRef.current) {
        userMarkerRef.current.setLatLng([nextCoords.lat, nextCoords.lon]);
      }
      if (radiusCircleRef.current) {
        radiusCircleRef.current.setLatLng([nextCoords.lat, nextCoords.lon]);
      }
    } catch (err: any) {
      if (!isRecenter) {
        if (err?.code === 1) {
          setLocationStatus('denied');
        } else {
          setLocationStatus('error');
        }
      }
    } finally {
      setIsLocating(false);
    }
  }, []);

  // Use default fallback if user rejects permission
  const handleUseDefaultLocation = () => {
    const fallback = { lat: DEFAULT_LAT, lon: DEFAULT_LON };
    skipNextReverseGeocodeRef.current = true;
    setCurrentCoords(fallback);
    setLocationStatus('ready');
    setLocationAccuracyNotice(null);
    setUserLocationName('Hà Nội (Mặc định)');
    setLocationInput('Hà Nội');
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([fallback.lat, fallback.lon], 13);
    }
  };

  // Reverse geocode to get city/district name of current coordinates (debounced, cached & abortable)
  useEffect(() => {
    if (!currentCoords) return;
    if (skipNextReverseGeocodeRef.current) {
      skipNextReverseGeocodeRef.current = false;
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      void reverseGeocodePlace(currentCoords.lat, currentCoords.lon, controller.signal).then(
        (shortName) => {
          if (shortName && !controller.signal.aborted) {
            setUserLocationName(shortName);
            setLocationInput(shortName);
            const saved = loadSavedMapLocation(userRef.current?._id);
            if (saved && saved.source === 'manual') {
              saveMapLocation({ ...saved, label: shortName }, userRef.current?._id);
            }
          }
        },
      );
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [currentCoords]);

  // Handle location search input change using Photon + Nominatim autocomplete
  const handleLocationInputChange = (val: string) => {
    setLocationInput(val);
    if (locationSearchTimeoutRef.current) {
      clearTimeout(locationSearchTimeoutRef.current);
    }
    if (locationSearchAbortRef.current) {
      locationSearchAbortRef.current.abort();
      locationSearchAbortRef.current = null;
    }

    const normalized = val.trim();
    if (!normalized) {
      setLocationSuggestions([]);
      setShowLocationDropdown(false);
      setIsSearchingLocation(false);
      return;
    }

    locationSearchTimeoutRef.current = setTimeout(async () => {
      const controller = new AbortController();
      locationSearchAbortRef.current = controller;
      setIsSearchingLocation(true);
      try {
        const bias = currentCoordsRef.current;
        const results = await searchVietnamPlaces(normalized, {
          limit: 6,
          biasLat: bias?.lat,
          biasLon: bias?.lon,
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setLocationSuggestions(results);
          setShowLocationDropdown(results.length > 0);
        }
      } catch {
        // Ignore abort / network geocode errors
      } finally {
        if (locationSearchAbortRef.current === controller) {
          locationSearchAbortRef.current = null;
        }
        setIsSearchingLocation(false);
      }
    }, 350);
  };

  // Select location suggestion
  const handleSelectLocationSuggestion = (item: GeocodePlaceSuggestion) => {
    const lat = parseFloat(item.lat);
    const lon = parseFloat(item.lon);
    if (!isNaN(lat) && !isNaN(lon)) {
      const short = item.short_name || item.display_name.split(', ').slice(0, 3).join(', ');
      skipNextReverseGeocodeRef.current = true;
      setCurrentCoords({ lat, lon });
      setLocationInput(short);
      setUserLocationName(short);
      setShowLocationDropdown(false);
      persistManualLocation(lat, lon, short);

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

  // Restore saved manual position or detect device location on open
  useEffect(() => {
    if (!isOpen) {
      if (locationSearchTimeoutRef.current) {
        clearTimeout(locationSearchTimeoutRef.current);
      }
      if (locationSearchAbortRef.current) {
        locationSearchAbortRef.current.abort();
        locationSearchAbortRef.current = null;
      }
      setLocationStatus('locating');
      setCurrentCoords(null);
      setUserLocationName('');
      setLocationInput('');
      setLocationAccuracyNotice(null);
      setShowLocationDropdown(false);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      return;
    }

    const saved = loadSavedMapLocation(userRef.current?._id);
    if (saved && (saved.source === 'manual' || saved.source === 'profile')) {
      skipNextReverseGeocodeRef.current = Boolean(saved.label);
      setCurrentCoords({ lat: saved.lat, lon: saved.lon });
      setUserLocationName(saved.label || '');
      setLocationInput(saved.label || '');
      setLocationAccuracyNotice(null);
      setLocationStatus('ready');
      return;
    }

    void requestLocation(false);
  }, [isOpen, requestLocation]);

  // Fetch jobs by location when coordinates or filters change
  const fetchJobs = useCallback(async () => {
    if (!isOpen || !currentCoords) return;
    setIsLoading(true);

    try {
      const salaryBounds = parseSalaryPresetValue(filterSalary);
      const res = await searchJobsByLocationApi(
        {
          lat: currentCoords.lat,
          lon: currentCoords.lon,
          radius: radiusKm,
          query: debouncedKeyword.trim() || undefined,
          level: filterLevel || undefined,
          workingModel: filterWorkingModel || undefined,
          ...salaryBounds,
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
  }, [
    isOpen,
    currentCoords,
    radiusKm,
    debouncedKeyword,
    filterLevel,
    filterSalary,
    filterWorkingModel,
    accessToken,
  ]);

  useEffect(() => {
    if (isOpen && currentCoords && locationStatus === 'ready') {
      void fetchJobs();
    }
  }, [isOpen, currentCoords, locationStatus, fetchJobs]);

  // Initialize Map ONLY once when coordinates become ready
  useEffect(() => {
    const coords = currentCoordsRef.current;
    if (!isOpen || locationStatus !== 'ready' || !hasReadyCoords || !coords || !mapContainerRef.current) {
      return;
    }

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [coords.lat, coords.lon],
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

      const userMarker = L.marker([coords.lat, coords.lon], {
        icon: userIcon,
        draggable: true,
        zIndexOffset: 1000,
      }).addTo(map);

      // Handle dragging the user marker
      userMarker.on('dragend', (e: any) => {
        const newPos = e.target.getLatLng();
        setCurrentCoords({ lat: newPos.lat, lon: newPos.lng });
        persistManualLocation(newPos.lat, newPos.lng);
      });

      userMarkerRef.current = userMarker;

      // Radius Circle
      const circle = L.circle([coords.lat, coords.lon], {
        radius: radiusKmRef.current * 1000,
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
        persistManualLocation(lat, lng);
      });

      map.on('zoomend', () => {
        setMapZoom(map.getZoom());
      });

      setMapZoom(map.getZoom());
      mapInstanceRef.current = map;
    }

    const timer = setTimeout(() => {
      mapInstanceRef.current?.invalidateSize();
    }, 200);

    return () => {
      clearTimeout(timer);
    };
  }, [isOpen, locationStatus, hasReadyCoords, persistManualLocation]);

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

  // Render clustered job markers when job results change (do not tear down on hover/zoom)
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    jobMarkersRef.current.forEach(({ marker }) => marker.remove());
    jobMarkersRef.current.clear();
    jobToClusterKeyRef.current.clear();

    const clusters = clusterJobsByLocation(jobs);
    const showSalaryOnPin = mapZoomRef.current >= 14;

    clusters.forEach((cluster) => {
      const distLabel = cluster.distanceKm != null ? `${cluster.distanceKm} km` : 'Gần bạn';
      const primaryJob = cluster.jobs[0];
      const salaryLabel = formatShortSalaryLabel(primaryJob?.salary);
      const isClusterActive = cluster.jobs.some(
        (j) => String(j._id || (j as any).id) === activeJobIdRef.current,
      );

      const marker = L.marker([cluster.lat, cluster.lon], {
        icon: createJobMarkerIcon({
          distLabel,
          salaryLabel,
          showSalary: showSalaryOnPin,
          count: cluster.jobs.length,
          isActive: isClusterActive,
        }),
      }).addTo(map);

      const popupHtml = buildClusterPopupHtml(cluster, currentCoordsRef.current);
      marker.bindPopup(popupHtml, { maxWidth: 310 });

      marker.on('click', () => {
        const firstId = String(primaryJob._id || (primaryJob as any).id);
        setActiveJobId(firstId);
      });

      jobMarkersRef.current.set(cluster.key, {
        cluster,
        marker,
        distLabel,
        salaryLabel,
      });

      cluster.jobs.forEach((job) => {
        const jobId = String(job._id || (job as any).id);
        jobToClusterKeyRef.current.set(jobId, cluster.key);
      });
    });
  }, [jobs]);

  // Update cluster marker icons smoothly when active job or map zoom changes
  useEffect(() => {
    const showSalary = mapZoom >= 14;
    const prevId = prevActiveJobIdRef.current;
    const prevClusterKey = prevId ? jobToClusterKeyRef.current.get(prevId) : undefined;
    const nextClusterKey = activeJobId ? jobToClusterKeyRef.current.get(activeJobId) : undefined;

    jobMarkersRef.current.forEach((entry, key) => {
      const isActive = Boolean(nextClusterKey && key === nextClusterKey);
      const wasActive = Boolean(prevClusterKey && key === prevClusterKey);
      if (isActive || wasActive || entry.cluster.jobs.length === 1) {
        entry.marker.setIcon(
          createJobMarkerIcon({
            distLabel: entry.distLabel,
            salaryLabel: entry.salaryLabel,
            showSalary,
            count: entry.cluster.jobs.length,
            isActive,
          }),
        );
      }
    });

    prevActiveJobIdRef.current = activeJobId;
  }, [activeJobId, mapZoom]);

  // Handle card hover: highlight cluster marker on map
  const handleCardHover = (job: JobItem) => {
    const jobId = String(job._id || (job as any).id);
    setActiveJobId(jobId);
    const clusterKey = jobToClusterKeyRef.current.get(jobId);
    if (clusterKey && mapInstanceRef.current) {
      const entry = jobMarkersRef.current.get(clusterKey);
      if (entry && !entry.marker.isPopupOpen()) {
        entry.marker.openPopup();
      }
    }
  };

  // Handle card click: center map on job cluster
  const handleCardClick = (job: JobItem) => {
    const jobId = String(job._id || (job as any).id);
    setActiveJobId(jobId);
    const clusterKey = jobToClusterKeyRef.current.get(jobId);
    if (job.lat != null && job.lon != null && mapInstanceRef.current) {
      mapInstanceRef.current.panTo([job.lat, job.lon], { animate: true, duration: 0.5 });
      if (clusterKey) {
        const entry = jobMarkersRef.current.get(clusterKey);
        if (entry && !entry.marker.isPopupOpen()) {
          entry.marker.openPopup();
        }
      }
    }
    if (onSelectJob) {
      onSelectJob(job);
    }
  };

  const hasActiveMapFilters = Boolean(
    searchKeyword.trim() || filterLevel || filterSalary || filterWorkingModel,
  );

  const handleResetMapFilters = () => {
    setSearchKeyword('');
    setFilterLevel('');
    setFilterSalary('');
    setFilterWorkingModel('');
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
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-400 text-slate-950 border border-amber-300/60">
                  PREMIUM
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
                {isSearchingLocation ? (
                  <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-slate-400" />
                ) : (
                  locationInput && (
                    <button
                      type="button"
                      onClick={() => {
                        handleLocationInputChange('');
                      }}
                      aria-label="Xóa địa điểm"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )
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

        {/* QUICK MAP FILTER SUB-BAR */}
        {locationStatus === 'ready' && (
          <div className="px-4 sm:px-6 py-2 bg-slate-50/90 dark:bg-slate-900/90 border-b border-slate-200/80 dark:border-slate-800 flex items-center flex-wrap gap-2.5 shrink-0 z-10">
            {/* Level Filter */}
            <select
              aria-label="Lọc cấp bậc trên bản đồ"
              value={filterLevel}
              onChange={(e) => setFilterLevel(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none focus:border-blue-600 cursor-pointer"
            >
              <option value="">Tất cả cấp bậc</option>
              {JOB_LEVEL_OPTIONS.map((lvl) => (
                <option key={lvl.id} value={lvl.id}>
                  {lvl.label}
                </option>
              ))}
            </select>

            {/* Salary Filter */}
            <select
              aria-label="Lọc mức lương trên bản đồ"
              value={filterSalary}
              onChange={(e) => setFilterSalary(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none focus:border-blue-600 cursor-pointer"
            >
              {SALARY_PRESETS.map((preset) => (
                <option key={preset.id || 'all'} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>

            {/* Working Model Chips */}
            <div className="flex items-center gap-1 bg-white dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
              {WORKING_MODEL_OPTIONS.map((wm) => (
                <button
                  key={wm.id || 'all'}
                  type="button"
                  onClick={() => setFilterWorkingModel(wm.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    filterWorkingModel === wm.id
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  {wm.label}
                </button>
              ))}
            </div>

            {hasActiveMapFilters && (
              <button
                type="button"
                onClick={handleResetMapFilters}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30 transition-colors cursor-pointer ml-auto"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Đặt lại</span>
              </button>
            )}
          </div>
        )}

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
                            {/* Straight-line Distance Badge */}
                            <span
                              title="Khoảng cách đường chim bay tính theo tọa độ địa lý"
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60"
                            >
                              <Navigation className="w-3 h-3 text-blue-600 dark:text-blue-400 shrink-0" />
                              <span>
                                {job.distanceKm != null ? `${job.distanceKm} km (chim bay)` : 'Gần bạn'}
                              </span>
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
                          <div className="mt-2.5 flex items-center justify-between gap-2 pt-1">
                            {job.lat != null && job.lon != null ? (
                              <a
                                href={buildGoogleMapsDirectionsUrl(job.lat, job.lon, currentCoords)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700/70 dark:hover:bg-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 transition-colors"
                              >
                                <ExternalLink className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                <span>Chỉ đường</span>
                              </a>
                            ) : (
                              <span className="text-[10px] text-slate-400">Xem vị trí map</span>
                            )}
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

              {/* Instruction Floating Hint & Accuracy Notice at top */}
              <div className="absolute top-4 left-4 right-4 z-20 pointer-events-none flex flex-col items-start gap-2">
                <div className="px-3.5 py-1.5 rounded-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-md border border-slate-200/80 dark:border-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-blue-600" />
                  <span>Kéo thả ghim xanh hoặc nhấp chuột lên bản đồ để đổi vị trí</span>
                </div>
                {locationAccuracyNotice && (
                  <div className="max-w-md px-3.5 py-2 rounded-2xl bg-amber-50/95 dark:bg-amber-950/90 backdrop-blur-md shadow-md border border-amber-200 dark:border-amber-800 text-[11px] font-medium text-amber-800 dark:text-amber-200 flex items-center gap-2 pointer-events-auto">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>{locationAccuracyNotice}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AnimatePresence>
  );
};

export default JobLocationSearchModal;
