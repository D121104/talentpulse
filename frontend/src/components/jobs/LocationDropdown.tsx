import { useState, useEffect, useRef, useMemo } from 'react';
import {
  MapPin,
  Search,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Check,
  X,
} from 'lucide-react';

interface LocationDropdownProps {
  value?: string;
  onChange: (locationStr: string) => void;
  className?: string;
}

export const PROVINCES_DATA: Record<string, string[]> = {
  'Hà Nội': [
    'Ba Đình',
    'Ba Vì',
    'Bắc Từ Liêm',
    'Cầu Giấy',
    'Chương Mỹ',
    'Đan Phượng',
    'Đông Anh',
    'Đống Đa',
    'Gia Lâm',
    'Hà Đông',
    'Hai Bà Trưng',
    'Hoài Đức',
    'Hoàn Kiếm',
    'Hoàng Mai',
    'Long Biên',
    'Mê Linh',
    'Mỹ Đức',
    'Nam Từ Liêm',
    'Phú Xuyên',
    'Phúc Thọ',
    'Quốc Oai',
    'Sóc Sơn',
    'Sơn Tây',
    'Tây Hồ',
    'Thạch Thất',
    'Thanh Oai',
    'Thanh Trì',
    'Thanh Xuân',
    'Thường Tín',
    'Ứng Hòa',
  ],
  'Hồ Chí Minh': [
    'Quận 1',
    'Quận 3',
    'Quận 4',
    'Quận 5',
    'Quận 6',
    'Quận 7',
    'Quận 8',
    'Quận 10',
    'Quận 11',
    'Quận 12',
    'Bình Chánh',
    'Bình Tân',
    'Bình Thạnh',
    'Cần Giờ',
    'Củ Chi',
    'Gò Vấp',
    'Hóc Môn',
    'Nhà Bè',
    'Phú Nhuận',
    'Tân Bình',
    'Tân Phú',
    'TP. Thủ Đức',
  ],
  'Đà Nẵng': [
    'Hải Châu',
    'Cẩm Lệ',
    'Thanh Khê',
    'Liên Chiểu',
    'Ngũ Hành Sơn',
    'Sơn Trà',
    'Hòa Vang',
    'Hoàng Sa',
  ],
  'Bình Dương': [
    'TP. Thủ Dầu Một',
    'TP. Thuận An',
    'TP. Dĩ An',
    'TP. Tân Uyên',
    'Bến Cát',
    'Bàu Bàng',
    'Bắc Tân Uyên',
    'Dầu Tiếng',
    'Phú Giáo',
  ],
  'Bắc Ninh': [
    'TP. Bắc Ninh',
    'TP. Từ Sơn',
    'Yên Phong',
    'Quế Võ',
    'Tiên Du',
    'Thuận Thành',
    'Gia Bình',
    'Lương Tài',
  ],
  'Đồng Nai': [
    'TP. Biên Hòa',
    'TP. Long Khánh',
    'Long Thành',
    'Nhơn Trạch',
    'Trảng Bom',
    'Thống Nhất',
    'Vĩnh Cửu',
    'Cẩm Mỹ',
    'Định Quán',
    'Xuân Lộc',
    'Tân Phú',
  ],
  'Hải Phòng': [
    'Hồng Bàng',
    'Ngô Quyền',
    'Lê Chân',
    'Hải An',
    'Kiến An',
    'Đồ Sơn',
    'Dương Kinh',
    'Thủy Nguyên',
    'An Dương',
    'An Lão',
    'Kiến Thụy',
    'Tiên Lãng',
    'Vĩnh Bảo',
    'Cát Hải',
  ],
  'Cần Thơ': [
    'Ninh Kiều',
    'Bình Thủy',
    'Cái Răng',
    'Ô Môn',
    'Thốt Nốt',
    'Phong Điền',
    'Cờ Đỏ',
    'Thới Lai',
    'Vĩnh Thạnh',
  ],
  'Hưng Yên': [
    'TP. Hưng Yên',
    'Mỹ Hào',
    'Văn Giang',
    'Văn Lâm',
    'Yên Mỹ',
    'Khoái Châu',
    'Kim Động',
    'Ân Thi',
    'Tiên Lữ',
    'Phù Cừ',
  ],
  'Quảng Ninh': [
    'TP. Hạ Long',
    'TP. Cẩm Phả',
    'TP. Uông Bí',
    'TP. Móng Cái',
    'Quảng Yên',
    'Đông Triều',
    'Vân Đồn',
    'Tiên Yên',
  ],
  'Bà Rịa - Vũng Tàu': [
    'TP. Vũng Tàu',
    'TP. Bà Rịa',
    'Phú Mỹ',
    'Châu Đức',
    'Côn Đảo',
    'Đất Đỏ',
    'Long Điền',
    'Xuyên Mộc',
  ],
  'Thái Nguyên': [
    'TP. Thái Nguyên',
    'TP. Sông Công',
    'Phổ Yên',
    'Đại Từ',
    'Định Hóa',
    'Đồng Hỷ',
    'Phú Bình',
    'Phú Lương',
    'Võ Nhai',
  ],
  'Thừa Thiên Huế': [
    'TP. Huế',
    'Hương Thủy',
    'Hương Trà',
    'A Lưới',
    'Nam Đông',
    'Phong Điền',
    'Phú Lộc',
    'Phú Vang',
    'Quảng Điền',
  ],
  'Khánh Hòa': [
    'TP. Nha Trang',
    'TP. Cam Ranh',
    'Ninh Hòa',
    'Cam Lâm',
    'Diên Khánh',
    'Khánh Sơn',
    'Khánh Vĩnh',
    'Vạn Ninh',
  ],
};

const PROVINCE_NAMES = Object.keys(PROVINCES_DATA);

export default function LocationDropdown({
  value = 'Tất cả địa điểm',
  onChange,
  className = '',
}: LocationDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchType, setSearchType] = useState<'old' | 'new'>('old');

  // Map of selected province -> array of selected districts (empty array = all districts)
  const [selectedMap, setSelectedMap] = useState<Record<string, string[]>>({});
  const [activeProvince, setActiveProvince] = useState<string>('Hà Nội');

  const [provinceSearch, setProvinceSearch] = useState('');
  const [districtSearch, setDistrictSearch] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);

  // Sync external value to internal map
  useEffect(() => {
    if (!value || value === 'Tất cả địa điểm') {
      setSelectedMap({});
      return;
    }

    const newMap: Record<string, string[]> = {};
    const parts = value.split(';').map((s) => s.trim()).filter(Boolean);

    for (const part of parts) {
      if (part.includes('-')) {
        const [prov, distsStr] = part.split('-').map((s) => s.trim());
        const matchedProv = PROVINCE_NAMES.find(
          (p) => p.toLowerCase() === prov.toLowerCase(),
        );
        if (matchedProv) {
          const dists = distsStr
            .split(',')
            .map((d) => d.trim())
            .filter(Boolean);
          newMap[matchedProv] = dists;
        }
      } else {
        // Direct province name (e.g. "Hồ Chí Minh" or "Hà Nội")
        const matchedProv = PROVINCE_NAMES.find(
          (p) =>
            p.toLowerCase() === part.toLowerCase() ||
            part.toLowerCase().includes(p.toLowerCase()) ||
            p.toLowerCase().includes(part.toLowerCase()),
        );
        if (matchedProv) {
          newMap[matchedProv] = [];
        }
      }
    }

    setSelectedMap(newMap);
    const firstProv = Object.keys(newMap)[0];
    if (firstProv) {
      setActiveProvince(firstProv);
    }
  }, [value]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filtered provinces
  const filteredProvinces = useMemo(() => {
    if (!provinceSearch.trim()) return PROVINCE_NAMES;
    const q = provinceSearch.trim().toLowerCase();
    return PROVINCE_NAMES.filter((p) => p.toLowerCase().includes(q));
  }, [provinceSearch]);

  // Districts for active province
  const currentDistricts = useMemo(() => {
    return PROVINCES_DATA[activeProvince] || [];
  }, [activeProvince]);

  // Filtered districts
  const filteredDistricts = useMemo(() => {
    if (!districtSearch.trim()) return currentDistricts;
    const q = districtSearch.trim().toLowerCase();
    return currentDistricts.filter((d) => d.toLowerCase().includes(q));
  }, [currentDistricts, districtSearch]);

  const isProvinceChecked = (prov: string) => {
    return prov in selectedMap;
  };

  // Clicking province row activates it and selects it
  const handleSelectProvinceRow = (prov: string) => {
    setActiveProvince(prov);
    setSelectedMap((prev) => {
      const next = { ...prev };
      if (!(prov in next)) {
        next[prov] = []; // select all districts of this province by default
      }
      return next;
    });
  };

  // Explicit checkbox toggle for province
  const handleToggleProvinceCheckbox = (prov: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveProvince(prov);
    setSelectedMap((prev) => {
      const next = { ...prev };
      if (prov in next) {
        delete next[prov];
      } else {
        next[prov] = [];
      }
      return next;
    });
  };

  const isDistrictChecked = (district: string) => {
    const selected = selectedMap[activeProvince];
    if (!selected) return false;
    if (selected.length === 0) return true; // All are selected
    return selected.includes(district);
  };

  const isAllDistrictsChecked = useMemo(() => {
    const selected = selectedMap[activeProvince];
    if (!selected) return false;
    return (
      selected.length === 0 ||
      selected.length === (PROVINCES_DATA[activeProvince]?.length || 0)
    );
  }, [selectedMap, activeProvince]);

  const handleToggleAllDistricts = () => {
    setSelectedMap((prev) => {
      const next = { ...prev };
      if (isAllDistrictsChecked) {
        delete next[activeProvince];
      } else {
        next[activeProvince] = [];
      }
      return next;
    });
  };

  const handleToggleDistrict = (district: string) => {
    setSelectedMap((prev) => {
      const next = { ...prev };
      const currentSelected = next[activeProvince];
      const allDists = PROVINCES_DATA[activeProvince] || [];

      if (!currentSelected) {
        next[activeProvince] = [district];
      } else if (currentSelected.length === 0) {
        next[activeProvince] = allDists.filter((d) => d !== district);
      } else if (currentSelected.includes(district)) {
        const updated = currentSelected.filter((d) => d !== district);
        if (updated.length === 0) {
          delete next[activeProvince];
        } else {
          next[activeProvince] = updated;
        }
      } else {
        const updated = [...currentSelected, district];
        if (updated.length === allDists.length) {
          next[activeProvince] = [];
        } else {
          next[activeProvince] = updated;
        }
      }
      return next;
    });
  };

  const handleClearAll = () => {
    setSelectedMap({});
    onChange('Tất cả địa điểm');
  };

  const handleApply = () => {
    setIsOpen(false);
    const keys = Object.keys(selectedMap);
    if (keys.length === 0) {
      onChange('Tất cả địa điểm');
      return;
    }

    const summaryParts: string[] = [];
    for (const prov of keys) {
      const dists = selectedMap[prov];
      if (!dists || dists.length === 0) {
        summaryParts.push(prov);
      } else {
        summaryParts.push(`${prov} - ${dists.join(', ')}`);
      }
    }

    const resultStr = summaryParts.join('; ');
    onChange(resultStr || 'Tất cả địa điểm');
  };

  // Formatted Label on Trigger Input
  const displayLabel = useMemo(() => {
    const keys = Object.keys(selectedMap);
    if (keys.length === 0) return value || 'Tất cả địa điểm';
    if (keys.length === 1) {
      const prov = keys[0];
      const dists = selectedMap[prov];
      if (!dists || dists.length === 0) return prov;
      if (dists.length === 1) return `${prov} - ${dists[0]}`;
      return `${prov} (${dists.length} quận/huyện)`;
    }
    return `${keys[0]} +${keys.length - 1} nơi`;
  }, [selectedMap, value]);

  const hasSelection = Object.keys(selectedMap).length > 0 && displayLabel !== 'Tất cả địa điểm';

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* TRIGGER BAR */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border cursor-pointer transition-all ${
          isOpen
            ? 'border-primary ring-2 ring-primary/20 bg-white dark:bg-slate-800'
            : 'border-slate-200/60 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/70 hover:border-primary/60 hover:bg-white dark:hover:bg-slate-800'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <MapPin className="w-4 h-4 text-primary shrink-0" />
          <span
            className={`text-sm truncate font-medium ${
              hasSelection
                ? 'text-slate-900 dark:text-white font-bold'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            {displayLabel}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {hasSelection && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedMap({});
                onChange('Tất cả địa điểm');
              }}
              className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {isOpen ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </div>

      {/* 2-COLUMN DROPDOWN POPUP */}
      {isOpen && (
        <div className="absolute left-0 sm:left-auto right-0 sm:right-auto md:-left-12 lg:left-0 top-full mt-2 w-[calc(100vw-2rem)] sm:w-[580px] md:w-[620px] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-4 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* HEADER: Radio Pill Options */}
          <div className="flex items-center flex-wrap gap-2 pb-3 border-b border-slate-100 dark:border-slate-800 text-xs">
            <span className="font-semibold text-slate-500 dark:text-slate-400 mr-1">
              Tìm theo:
            </span>

            {/* Pill 1: Tỉnh, Quận/huyện cũ */}
            <button
              type="button"
              onClick={() => setSearchType('old')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold border transition-all ${
                searchType === 'old'
                  ? 'border-primary bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
              }`}
            >
              <span
                className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                  searchType === 'old'
                    ? 'border-primary bg-primary'
                    : 'border-slate-400 bg-transparent'
                }`}
              >
                {searchType === 'old' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-white" />
                )}
              </span>
              Tỉnh, Quận/huyện cũ
            </button>

            {/* Pill 2: Tỉnh, Phường/xã sau 1/7/2025 */}
            <button
              type="button"
              onClick={() => setSearchType('new')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold border transition-all ${
                searchType === 'new'
                  ? 'border-primary bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
              }`}
            >
              <span
                className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                  searchType === 'new'
                    ? 'border-primary bg-primary'
                    : 'border-slate-400 bg-transparent'
                }`}
              >
                {searchType === 'new' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-white" />
                )}
              </span>
              Tỉnh, Phường/xã sau 1/7/2025
              <span className="ml-1 px-1.5 py-0.2 rounded-md text-[10px] font-bold bg-primary text-white">
                Mới
              </span>
            </button>
          </div>

          {/* 2-COLUMN SELECTOR BODY */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-3">
            {/* LEFT COLUMN: Tỉnh / Thành phố */}
            <div className="space-y-2">
              {/* Province Search Input */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus-within:border-primary">
                <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <input
                  type="text"
                  value={provinceSearch}
                  onChange={(e) => setProvinceSearch(e.target.value)}
                  placeholder="Nhập Tỉnh/Thành phố"
                  className="w-full text-xs bg-transparent text-slate-800 dark:text-slate-200 placeholder:text-slate-400 outline-none"
                />
                {provinceSearch && (
                  <button
                    type="button"
                    onClick={() => setProvinceSearch('')}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Province List */}
              <div className="max-h-64 overflow-y-auto pr-1 space-y-1">
                {filteredProvinces.map((prov) => {
                  const isChecked = isProvinceChecked(prov);
                  const isActive = activeProvince === prov;
                  const distCount = selectedMap[prov]?.length || 0;

                  return (
                    <div
                      key={prov}
                      onClick={() => handleSelectProvinceRow(prov)}
                      className={`flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer transition-all ${
                        isActive
                          ? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light font-bold'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* Checkbox */}
                        <div
                          onClick={(e) => handleToggleProvinceCheckbox(prov, e)}
                          className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all ${
                            isChecked
                              ? 'bg-primary border-primary text-white shadow-xs'
                              : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                          }`}
                        >
                          {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>

                        <span className="text-xs truncate">{prov}</span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0 text-slate-400">
                        {isChecked && (
                          <span className="text-[11px] text-primary dark:text-primary-light">
                            {distCount === 0 ? 'Tất cả' : `${distCount} quận`}
                          </span>
                        )}
                        <ChevronRight
                          className={`w-3.5 h-3.5 ${
                            isActive ? 'text-primary' : 'text-slate-300 dark:text-slate-600'
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* RIGHT COLUMN: Quận / Huyện */}
            <div className="space-y-2 sm:border-l sm:border-slate-100 sm:dark:border-slate-800 sm:pl-4">
              {/* District Search Input */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus-within:border-primary">
                <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <input
                  type="text"
                  value={districtSearch}
                  onChange={(e) => setDistrictSearch(e.target.value)}
                  placeholder="Nhập Phường/Xã/Quận/Huyện"
                  className="w-full text-xs bg-transparent text-slate-800 dark:text-slate-200 placeholder:text-slate-400 outline-none"
                />
                {districtSearch && (
                  <button
                    type="button"
                    onClick={() => setDistrictSearch('')}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* District List */}
              <div className="max-h-64 overflow-y-auto pr-1 space-y-1">
                {/* Select All Option */}
                <div
                  onClick={handleToggleAllDistricts}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/60 cursor-pointer font-bold text-xs text-slate-800 dark:text-slate-200"
                >
                  <div
                    className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all ${
                      isAllDistrictsChecked
                        ? 'bg-primary border-primary text-white shadow-xs'
                        : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                    }`}
                  >
                    {isAllDistrictsChecked && (
                      <Check className="w-3 h-3 stroke-[3]" />
                    )}
                  </div>
                  <span>Tất cả {activeProvince}</span>
                </div>

                {filteredDistricts.map((district) => {
                  const isChecked = isDistrictChecked(district);

                  return (
                    <div
                      key={district}
                      onClick={() => handleToggleDistrict(district)}
                      className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/60 cursor-pointer text-xs text-slate-700 dark:text-slate-300"
                    >
                      <div
                        className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all ${
                          isChecked
                            ? 'bg-primary border-primary text-white shadow-xs'
                            : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                        }`}
                      >
                        {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <span className="truncate">{district}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* FOOTER ACTION BAR */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <button
              type="button"
              onClick={handleClearAll}
              className="text-xs font-bold text-slate-500 hover:text-rose-500 dark:text-slate-400 dark:hover:text-rose-400 transition-colors cursor-pointer"
            >
              Bỏ chọn tất cả
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Đóng
              </button>

              <button
                type="button"
                onClick={handleApply}
                className="px-6 py-2 bg-primary hover:bg-primary-dark active:scale-95 text-white text-xs font-bold rounded-xl shadow-md shadow-primary/25 hover:shadow-primary/35 transition-all cursor-pointer"
              >
                Áp dụng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
