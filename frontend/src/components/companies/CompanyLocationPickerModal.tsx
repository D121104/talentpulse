import LocationPickerModal from '../maps/LocationPickerModal';

interface CompanyLocationPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialLat?: number | null;
  initialLon?: number | null;
  initialAddress?: string | null;
  onConfirm: (coords: { lat: number; lon: number; address?: string }) => void;
}

export default function CompanyLocationPickerModal({
  isOpen,
  onClose,
  initialLat,
  initialLon,
  initialAddress,
  onConfirm,
}: CompanyLocationPickerModalProps) {
  return (
    <LocationPickerModal
      isOpen={isOpen}
      onClose={onClose}
      initialLat={initialLat}
      initialLon={initialLon}
      initialAddress={initialAddress}
      title="Chọn vị trí trụ sở công ty"
      subtitle="Tìm địa chỉ, nhấp bản đồ hoặc kéo thả ghim xanh"
      markerTitle="Trụ sở công ty"
      onConfirm={({ lat, lon, address }) => {
        onConfirm({
          lat,
          lon,
          address: address || undefined,
        });
      }}
    />
  );
}
