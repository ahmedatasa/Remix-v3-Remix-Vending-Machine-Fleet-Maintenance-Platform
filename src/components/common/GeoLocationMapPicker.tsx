import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Check, X, AlertTriangle, Building2, LocateFixed } from 'lucide-react';
import { Button } from './Button';
import { validateCoordinates } from '../../utils/geoValidation';

// High-visibility custom SVG map pins
const createCustomPinIcon = (type: 'machine' | 'building' | 'proposed' | 'reference') => {
  let pinColor = '#2563EB'; // Blue for machine
  let innerIcon = `<circle cx="12" cy="10" r="3" fill="#ffffff"></circle>`;

  if (type === 'building') {
    pinColor = '#4F46E5'; // Indigo for building
    innerIcon = `<rect x="9" y="7" width="6" height="7" rx="1" fill="#ffffff"></rect>`;
  } else if (type === 'proposed') {
    pinColor = '#F59E0B'; // Amber for proposed
    innerIcon = `<circle cx="12" cy="10" r="3" fill="#ffffff"></circle>`;
  } else if (type === 'reference') {
    pinColor = '#64748B'; // Slate for reference building
    innerIcon = `<rect x="9" y="7" width="6" height="7" rx="1" fill="#ffffff"></rect>`;
  }

  const strokeColor = '#FFFFFF';
  return L.divIcon({
    className: 'custom-map-pin',
    html: `
      <div style="
        position: relative;
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: ${type === 'reference' ? 'default' : 'grab'};
      ">
        <svg viewBox="0 0 24 24" width="36" height="36" fill="${pinColor}" stroke="${strokeColor}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 3px 6px rgba(0,0,0,0.4));">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
          ${innerIcon}
        </svg>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36]
  });
};

export interface GeoLocationMapPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (coordinates: { latitude: number; longitude: number }) => void;
  initialLatitude?: number | null;
  initialLongitude?: number | null;
  entityTitle?: string;
  entityType?: 'machine' | 'building';
  isReadOnly?: boolean;
  proposedCoordinates?: { latitude: number; longitude: number; technicianName?: string; capturedAt?: string };
  buildingReferenceCoords?: { latitude: number; longitude: number; buildingName?: string } | null;
  // Legacy alias support
  machineTitle?: string;
}

export const GeoLocationMapPicker: React.FC<GeoLocationMapPickerProps> = ({
  isOpen,
  onClose,
  onConfirm,
  initialLatitude,
  initialLongitude,
  entityTitle,
  entityType = 'machine',
  isReadOnly = false,
  proposedCoordinates,
  buildingReferenceCoords,
  machineTitle
}) => {
  const displayTitle = entityTitle || machineTitle;
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const proposedMarkerRef = useRef<L.Marker | null>(null);
  const referenceMarkerRef = useRef<L.Marker | null>(null);

  // Temporary selected coordinates while picker is open
  const [selectedLat, setSelectedLat] = useState<number | null>(null);
  const [selectedLng, setSelectedLng] = useState<number | null>(null);
  const [tileLoadError, setTileLoadError] = useState(false);
  const [manualInputLat, setManualInputLat] = useState<string>('');
  const [manualInputLng, setManualInputLng] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Initialize coordinates state when modal opens
  useEffect(() => {
    if (isOpen) {
      setTileLoadError(false);
      setValidationError(null);
      if (typeof initialLatitude === 'number' && typeof initialLongitude === 'number') {
        setSelectedLat(initialLatitude);
        setSelectedLng(initialLongitude);
        setManualInputLat(initialLatitude.toFixed(6));
        setManualInputLng(initialLongitude.toFixed(6));
      } else {
        setSelectedLat(null);
        setSelectedLng(null);
        setManualInputLat('');
        setManualInputLng('');
      }
    }
  }, [isOpen, initialLatitude, initialLongitude]);

  // Setup Leaflet map instance
  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return;

    // Riyadh KSU default center coordinates
    const defaultCenter: [number, number] = [24.7136, 46.6753];

    // Priority for initial map center:
    // 1. Initial coordinates if present
    // 2. Proposed coordinates if present
    // 3. Building reference coordinates if present (Section 15: centers machine map near building without saving marker)
    // 4. Default KSU center
    let initialCenter: [number, number] = defaultCenter;
    let initialZoom = 14;

    if (typeof initialLatitude === 'number' && typeof initialLongitude === 'number') {
      initialCenter = [initialLatitude, initialLongitude];
      initialZoom = 16;
    } else if (proposedCoordinates) {
      initialCenter = [proposedCoordinates.latitude, proposedCoordinates.longitude];
      initialZoom = 16;
    } else if (buildingReferenceCoords && typeof buildingReferenceCoords.latitude === 'number' && typeof buildingReferenceCoords.longitude === 'number') {
      initialCenter = [buildingReferenceCoords.latitude, buildingReferenceCoords.longitude];
      initialZoom = 16;
    }

    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: initialZoom,
      zoomControl: true
    });
    mapInstanceRef.current = map;

    // OpenStreetMap standard tile layer
    const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    });

    tileLayer.on('tileerror', () => {
      setTileLoadError(true);
    });

    tileLayer.addTo(map);

    // If initial coordinates exist, place official marker
    if (typeof initialLatitude === 'number' && typeof initialLongitude === 'number') {
      const marker = L.marker([initialLatitude, initialLongitude], {
        draggable: !isReadOnly,
        icon: createCustomPinIcon(entityType)
      }).addTo(map);

      const label = entityType === 'building'
        ? `<strong>${displayTitle || 'موقع المبنى'}</strong><br/>إحداثيات المبنى المعتمدة`
        : `<strong>${displayTitle || 'موقع الماكينة'}</strong><br/>الموقع المعتمد حالياً`;

      marker.bindPopup(label).openPopup();

      if (!isReadOnly) {
        marker.on('dragend', (e) => {
          const latLng = (e.target as L.Marker).getLatLng();
          const cleanLat = Number(latLng.lat.toFixed(6));
          const cleanLng = Number(latLng.lng.toFixed(6));
          setSelectedLat(cleanLat);
          setSelectedLng(cleanLng);
          setManualInputLat(cleanLat.toFixed(6));
          setManualInputLng(cleanLng.toFixed(6));
          setValidationError(null);
        });
      }

      markerRef.current = marker;
    }

    // If building reference coords exist (Section 15: subtle reference marker, NOT a machine marker)
    if (
      entityType === 'machine' &&
      buildingReferenceCoords &&
      typeof buildingReferenceCoords.latitude === 'number' &&
      typeof buildingReferenceCoords.longitude === 'number'
    ) {
      const refMarker = L.marker([buildingReferenceCoords.latitude, buildingReferenceCoords.longitude], {
        draggable: false,
        icon: createCustomPinIcon('reference')
      }).addTo(map);

      refMarker.bindPopup(`
        <div style="font-size: 11px;">
          <strong>🏢 ${buildingReferenceCoords.buildingName || 'موقع المبنى التابع'}</strong><br/>
          <span style="color: #64748b;">(نقطة مرجعية للمبنى — انقر على الخريطة لتحديد الموقع الفعلي للماكينة)</span>
        </div>
      `);

      referenceMarkerRef.current = refMarker;
    }

    // If proposed coordinates exist (for management review)
    if (proposedCoordinates) {
      const propMarker = L.marker([proposedCoordinates.latitude, proposedCoordinates.longitude], {
        draggable: false,
        icon: createCustomPinIcon('proposed')
      }).addTo(map);

      propMarker.bindPopup(`
        <strong>الموقع المقترح من الفني</strong><br/>
        الفني: ${proposedCoordinates.technicianName || 'فني الصيانة'}<br/>
        الإحداثيات: ${proposedCoordinates.latitude.toFixed(6)}, ${proposedCoordinates.longitude.toFixed(6)}
      `);

      proposedMarkerRef.current = propMarker;
    }

    // Map click handler (only explicit user click creates or moves coordinate)
    if (!isReadOnly) {
      map.on('click', (e: L.LeafletMouseEvent) => {
        const cleanLat = Number(e.latlng.lat.toFixed(6));
        const cleanLng = Number(e.latlng.lng.toFixed(6));

        setSelectedLat(cleanLat);
        setSelectedLng(cleanLng);
        setManualInputLat(cleanLat.toFixed(6));
        setManualInputLng(cleanLng.toFixed(6));
        setValidationError(null);

        if (markerRef.current) {
          markerRef.current.setLatLng([cleanLat, cleanLng]);
        } else {
          const newMarker = L.marker([cleanLat, cleanLng], {
            draggable: true,
            icon: createCustomPinIcon(entityType)
          }).addTo(map);

          newMarker.on('dragend', (dragEvent) => {
            const latLng = (dragEvent.target as L.Marker).getLatLng();
            const dLat = Number(latLng.lat.toFixed(6));
            const dLng = Number(latLng.lng.toFixed(6));
            setSelectedLat(dLat);
            setSelectedLng(dLng);
            setManualInputLat(dLat.toFixed(6));
            setManualInputLng(dLng.toFixed(6));
            setValidationError(null);
          });

          markerRef.current = newMarker;
        }
      });
    }

    // Resize observer to ensure full container dimensions render correctly
    const resizeTimer = setTimeout(() => {
      map.invalidateSize();
    }, 250);

    return () => {
      clearTimeout(resizeTimer);
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
      proposedMarkerRef.current = null;
      referenceMarkerRef.current = null;
    };
  }, [isOpen, initialLatitude, initialLongitude, isReadOnly, proposedCoordinates, displayTitle, entityType, buildingReferenceCoords]);

  // Apply manual coordinate inputs into map marker
  const handleApplyManualInputs = () => {
    const valResult = validateCoordinates(manualInputLat, manualInputLng);
    if (!valResult.isValid || valResult.latitude === null || valResult.longitude === null) {
      setValidationError(valResult.error || 'يرجى إدخال إحداثيات صحيحة.');
      return;
    }

    const lat = valResult.latitude;
    const lng = valResult.longitude;

    setValidationError(null);
    setSelectedLat(lat);
    setSelectedLng(lng);

    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([lat, lng], 16);
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      } else {
        const newMarker = L.marker([lat, lng], {
          draggable: !isReadOnly,
          icon: createCustomPinIcon(entityType)
        }).addTo(mapInstanceRef.current);

        newMarker.on('dragend', (dragEvent) => {
          const latLng = (dragEvent.target as L.Marker).getLatLng();
          const dLat = Number(latLng.lat.toFixed(6));
          const dLng = Number(latLng.lng.toFixed(6));
          setSelectedLat(dLat);
          setSelectedLng(dLng);
          setManualInputLat(dLat.toFixed(6));
          setManualInputLng(dLng.toFixed(6));
        });

        markerRef.current = newMarker;
      }
    }
  };

  const handleConfirm = () => {
    if (selectedLat === null || selectedLng === null) {
      setValidationError(
        entityType === 'building'
          ? 'يرجى النقر على الخريطة لتحديد موقع المبنى أولاً.'
          : 'يرجى النقر على الخريطة لتحديد موقع الماكينة أولاً.'
      );
      return;
    }
    onConfirm({ latitude: selectedLat, longitude: selectedLng });
    onClose();
  };

  if (!isOpen) return null;

  const headerTitle = displayTitle
    ? entityType === 'building'
      ? `تحديد موقع المبنى (${displayTitle}) على الخريطة`
      : `تحديد موقع الماكينة (${displayTitle}) على الخريطة`
    : entityType === 'building'
    ? 'تحديد موقع المبنى على الخريطة / Building Location Map'
    : 'تحديد موقع الماكينة على الخريطة / Select Machine Location';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl ${entityType === 'building' ? 'bg-indigo-600/20 text-indigo-400 border-indigo-500/30' : 'bg-blue-600/20 text-blue-400 border-blue-500/30'} border`}>
              {entityType === 'building' ? <Building2 className="w-5 h-5" /> : <MapPin className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">
                {headerTitle}
              </h3>
              <p className="text-xs text-slate-400">
                انقر على أي نقطة على الخريطة لوضع المؤشر، أو اسحب المؤشر لتعديل الإحداثيات بدقة
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Building Reference Guidance Notice (Section 15) */}
        {entityType === 'machine' && buildingReferenceCoords && (
          <div className="px-5 py-2 bg-indigo-500/10 border-b border-indigo-500/20 flex items-center justify-between text-xs text-indigo-300">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 shrink-0 text-indigo-400" />
              <span>
                مرجع الخريطة: تم التمركز عند موقع المبنى <strong>({buildingReferenceCoords.buildingName || 'المبنى'})</strong> لتسهيل التحديد.
              </span>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">
              {buildingReferenceCoords.latitude.toFixed(4)}, {buildingReferenceCoords.longitude.toFixed(4)}
            </span>
          </div>
        )}

        {/* Offline / Map Tile Failure Notice */}
        {tileLoadError && (
          <div className="px-5 py-2.5 bg-amber-500/10 border-b border-amber-500/30 flex items-center gap-2 text-xs text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>تعذر تحميل الخريطة حاليًا. يمكنك إدخال الإحداثيات يدويًا في الحقول أدناه ثم الضغط على تطبيق.</span>
          </div>
        )}

        {/* Interactive Map Canvas Container */}
        <div className="relative flex-1 min-h-[420px] bg-slate-950">
          <div ref={mapContainerRef} className="w-full h-full min-h-[420px] z-10" />

          {/* Map Overlay Quick Indicator */}
          <div className="absolute top-3 right-3 z-20 bg-slate-900/90 backdrop-blur border border-slate-700/80 px-3 py-2 rounded-xl text-xs text-slate-200 shadow-lg pointer-events-none">
            {selectedLat !== null && selectedLng !== null ? (
              <div className="flex items-center gap-2 font-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>خط العرض: {selectedLat.toFixed(6)}</span>
                <span className="text-slate-500">|</span>
                <span>خط الطول: {selectedLng.toFixed(6)}</span>
              </div>
            ) : (
              <div className="text-slate-400 flex items-center gap-1.5">
                <LocateFixed className="w-3.5 h-3.5 text-blue-400" />
                <span>انقر على الخريطة لتحديد الإحداثيات</span>
              </div>
            )}
          </div>
        </div>

        {/* Coordinate Controls & Manual Override Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 space-y-3">
          {validationError && (
            <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
              {validationError}
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1">
                <span className="text-[11px] text-slate-400">Lat:</span>
                <input
                  type="text"
                  placeholder="24.713600"
                  value={manualInputLat}
                  onChange={(e) => setManualInputLat(e.target.value)}
                  className="w-24 bg-transparent text-xs font-mono text-slate-200 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1">
                <span className="text-[11px] text-slate-400">Lng:</span>
                <input
                  type="text"
                  placeholder="46.675300"
                  value={manualInputLng}
                  onChange={(e) => setManualInputLng(e.target.value)}
                  className="w-24 bg-transparent text-xs font-mono text-slate-200 focus:outline-none"
                />
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleApplyManualInputs}
              >
                تطبيق الإحداثيات
              </Button>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClose}
              >
                {isReadOnly ? 'إغلاق' : 'إلغاء / Cancel'}
              </Button>

              {!isReadOnly && (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  icon={Check}
                  disabled={selectedLat === null || selectedLng === null}
                  onClick={handleConfirm}
                >
                  تأكيد الموقع / Confirm Location
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
