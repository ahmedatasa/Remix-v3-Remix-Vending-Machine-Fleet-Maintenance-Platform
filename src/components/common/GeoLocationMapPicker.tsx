import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  MapPin,
  Check,
  X,
  AlertTriangle,
  Building2,
  LocateFixed,
  Layers,
  ZoomIn,
  ZoomOut,
  RefreshCw,
  Trash2,
  Compass,
  CheckCircle2,
  Info
} from 'lucide-react';
import { Button } from './Button';
import { validateCoordinates } from '../../utils/geoValidation';
import { LocationSource } from '../../types';
import { MAP_CONFIG, MapLayerMode, getGpsAccuracyQuality, GpsAccuracyQuality } from '../../config/mapConfig';

// High-visibility custom SVG map pins
const createCustomPinIcon = (type: 'machine' | 'building' | 'proposed' | 'reference' | 'draft') => {
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
  } else if (type === 'draft') {
    pinColor = '#10B981'; // Emerald for draft unsaved
    innerIcon = `<circle cx="12" cy="10" r="3" fill="#ffffff"></circle>`;
  }

  const strokeColor = '#FFFFFF';
  return L.divIcon({
    className: 'custom-map-pin',
    html: `
      <div style="
        position: relative;
        width: 38px;
        height: 38px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: ${type === 'reference' ? 'default' : 'grab'};
      ">
        <svg viewBox="0 0 24 24" width="38" height="38" fill="${pinColor}" stroke="${strokeColor}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 4px 8px rgba(0,0,0,0.45));">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
          ${innerIcon}
        </svg>
      </div>
    `,
    iconSize: [38, 38],
    iconAnchor: [19, 38],
    popupAnchor: [0, -38]
  });
};

export interface GeoLocationMapPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (coordinates: { latitude: number | null; longitude: number | null; source?: LocationSource }) => void;
  initialLatitude?: number | null;
  initialLongitude?: number | null;
  entityTitle?: string;
  entityType?: 'machine' | 'building';
  isReadOnly?: boolean;
  proposedCoordinates?: { latitude: number; longitude: number; technicianName?: string; capturedAt?: string };
  buildingReferenceCoords?: { latitude: number; longitude: number; buildingName?: string } | null;
  locationSource?: LocationSource;
  locationNote?: string;
  locationUpdatedAt?: string | null;
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
  locationSource,
  locationNote,
  locationUpdatedAt,
  machineTitle
}) => {
  const displayTitle = entityTitle || machineTitle;
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  // Active layer references
  const currentTileLayerRef = useRef<L.TileLayer | null>(null);
  const hybridOverlayLayerRef = useRef<L.TileLayer | null>(null);

  // Marker references
  const markerRef = useRef<L.Marker | null>(null);
  const proposedMarkerRef = useRef<L.Marker | null>(null);
  const referenceMarkerRef = useRef<L.Marker | null>(null);

  // Map Mode: Street, Satellite, Hybrid
  const [activeLayerMode, setActiveLayerMode] = useState<MapLayerMode>(MAP_CONFIG.defaultLayer);
  const [satelliteFallbackWarning, setSatelliteFallbackWarning] = useState<string | null>(null);

  // Selected (draft) coordinates while picker is open
  const [selectedLat, setSelectedLat] = useState<number | null>(null);
  const [selectedLng, setSelectedLng] = useState<number | null>(null);
  const [draftSource, setDraftSource] = useState<LocationSource>('MAP_SELECTION');
  const [isDraftUnsaved, setIsDraftUnsaved] = useState(false);

  // UI States
  const [currentZoom, setCurrentZoom] = useState<number>(MAP_CONFIG.defaultZoom);
  const [manualInputLat, setManualInputLat] = useState<string>('');
  const [manualInputLng, setManualInputLng] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Device Geolocation state
  const [isLocatingDevice, setIsLocatingDevice] = useState(false);
  const [deviceGpsAccuracy, setDeviceGpsAccuracy] = useState<number | null>(null);
  const [deviceGpsQuality, setDeviceGpsQuality] = useState<GpsAccuracyQuality | null>(null);
  const [geoCaptureError, setGeoCaptureError] = useState<string | null>(null);

  // Clear confirmation modal state
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);

  // Initial persisted coordinates check
  const hasPersistedCoords = typeof initialLatitude === 'number' && typeof initialLongitude === 'number';

  // Initialize coordinates state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSatelliteFallbackWarning(null);
      setValidationError(null);
      setGeoCaptureError(null);
      setDeviceGpsAccuracy(null);
      setDeviceGpsQuality(null);

      if (typeof initialLatitude === 'number' && typeof initialLongitude === 'number') {
        setSelectedLat(initialLatitude);
        setSelectedLng(initialLongitude);
        setManualInputLat(initialLatitude.toFixed(6));
        setManualInputLng(initialLongitude.toFixed(6));
        setDraftSource(locationSource || 'MAP_SELECTION');
        setIsDraftUnsaved(false);
      } else {
        // Strict rule: No pre-filled or synthetic coordinates
        setSelectedLat(null);
        setSelectedLng(null);
        setManualInputLat('');
        setManualInputLng('');
        setDraftSource('NONE');
        setIsDraftUnsaved(false);
      }
    }
  }, [isOpen, initialLatitude, initialLongitude, locationSource]);

  // Layer Switcher Implementation
  const applyTileLayers = useCallback((map: L.Map, mode: MapLayerMode) => {
    // Clean up existing tile layers
    if (currentTileLayerRef.current) {
      map.removeLayer(currentTileLayerRef.current);
      currentTileLayerRef.current = null;
    }
    if (hybridOverlayLayerRef.current) {
      map.removeLayer(hybridOverlayLayerRef.current);
      hybridOverlayLayerRef.current = null;
    }

    if (mode === 'street') {
      const streetCfg = MAP_CONFIG.layers.street;
      const streetLayer = L.tileLayer(streetCfg.url, {
        maxZoom: streetCfg.maxZoom,
        minZoom: streetCfg.minZoom,
        attribution: streetCfg.attribution,
        subdomains: streetCfg.subdomains || ['a', 'b', 'c']
      });
      streetLayer.addTo(map);
      currentTileLayerRef.current = streetLayer;
    } else if (mode === 'satellite') {
      const satCfg = MAP_CONFIG.layers.satellite;
      const satLayer = L.tileLayer(satCfg.url, {
        maxZoom: satCfg.maxZoom,
        minZoom: satCfg.minZoom,
        attribution: satCfg.attribution
      });

      // Provider failure fallback to Street map
      satLayer.on('tileerror', () => {
        setSatelliteFallbackWarning('تعذر تحميل صور القمر الصناعي من المزود. تم التبديل تلقائياً إلى خريطة الشوارع.');
        setActiveLayerMode('street');
        applyTileLayers(map, 'street');
      });

      satLayer.addTo(map);
      currentTileLayerRef.current = satLayer;
    } else if (mode === 'hybrid') {
      // Base satellite layer + roads/labels overlay
      const satCfg = MAP_CONFIG.layers.satellite;
      const hybridCfg = MAP_CONFIG.layers.hybridOverlay;

      const baseLayer = L.tileLayer(satCfg.url, {
        maxZoom: satCfg.maxZoom,
        minZoom: satCfg.minZoom,
        attribution: satCfg.attribution
      });

      baseLayer.on('tileerror', () => {
        setSatelliteFallbackWarning('تعذر تحميل طبقة القمر الصناعي. تم التبديل تلقائياً إلى خريطة الشوارع.');
        setActiveLayerMode('street');
        applyTileLayers(map, 'street');
      });

      const overlayLayer = L.tileLayer(hybridCfg.url, {
        maxZoom: hybridCfg.maxZoom,
        minZoom: hybridCfg.minZoom,
        attribution: hybridCfg.attribution
      });

      baseLayer.addTo(map);
      overlayLayer.addTo(map);

      currentTileLayerRef.current = baseLayer;
      hybridOverlayLayerRef.current = overlayLayer;
    }
  }, []);

  // Update tile layer when activeLayerMode changes
  useEffect(() => {
    if (mapInstanceRef.current) {
      applyTileLayers(mapInstanceRef.current, activeLayerMode);
    }
  }, [activeLayerMode, applyTileLayers]);

  // Helper to place or move draggable pin on map
  const updateOrPlaceMarker = useCallback((lat: number, lng: number, source: LocationSource, markAsUnsaved = true) => {
    setSelectedLat(lat);
    setSelectedLng(lng);
    setManualInputLat(lat.toFixed(6));
    setManualInputLng(lng.toFixed(6));
    setDraftSource(source);
    if (markAsUnsaved) {
      setIsDraftUnsaved(true);
    }
    setValidationError(null);

    const map = mapInstanceRef.current;
    if (!map) return;

    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
      markerRef.current.setIcon(createCustomPinIcon(markAsUnsaved ? 'draft' : entityType));
    } else {
      const newMarker = L.marker([lat, lng], {
        draggable: !isReadOnly,
        icon: createCustomPinIcon(markAsUnsaved ? 'draft' : entityType)
      }).addTo(map);

      if (!isReadOnly) {
        newMarker.on('dragend', (e) => {
          const latLng = (e.target as L.Marker).getLatLng();
          const dLat = Number(latLng.lat.toFixed(6));
          const dLng = Number(latLng.lng.toFixed(6));
          setSelectedLat(dLat);
          setSelectedLng(dLng);
          setManualInputLat(dLat.toFixed(6));
          setManualInputLng(dLng.toFixed(6));
          setDraftSource('MAP_SELECTION');
          setIsDraftUnsaved(true);
          setValidationError(null);
        });
      }

      markerRef.current = newMarker;
    }
  }, [entityType, isReadOnly]);

  // Setup Leaflet map instance
  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return;

    // Viewport Center Priority:
    // 1. Initial coordinates if present
    // 2. Proposed coordinates if present
    // 3. Building reference coordinates if present (viewport only — does not save marker!)
    // 4. Default KSU center
    let initialCenter: [number, number] = MAP_CONFIG.defaultCenter;
    let initialZoom = MAP_CONFIG.defaultZoom;

    if (typeof initialLatitude === 'number' && typeof initialLongitude === 'number') {
      initialCenter = [initialLatitude, initialLongitude];
      initialZoom = MAP_CONFIG.detailedZoom;
    } else if (proposedCoordinates) {
      initialCenter = [proposedCoordinates.latitude, proposedCoordinates.longitude];
      initialZoom = MAP_CONFIG.detailedZoom;
    } else if (
      buildingReferenceCoords &&
      typeof buildingReferenceCoords.latitude === 'number' &&
      typeof buildingReferenceCoords.longitude === 'number'
    ) {
      initialCenter = [buildingReferenceCoords.latitude, buildingReferenceCoords.longitude];
      initialZoom = MAP_CONFIG.detailedZoom;
    }

    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: initialZoom,
      zoomControl: false // Using custom sleek zoom controls
    });
    mapInstanceRef.current = map;
    setCurrentZoom(initialZoom);

    // Apply configured initial tile layer
    applyTileLayers(map, activeLayerMode);

    // Track zoom level changes
    map.on('zoomend', () => {
      setCurrentZoom(map.getZoom());
    });

    // If initial coordinates exist, place official persisted marker
    if (typeof initialLatitude === 'number' && typeof initialLongitude === 'number') {
      const marker = L.marker([initialLatitude, initialLongitude], {
        draggable: !isReadOnly,
        icon: createCustomPinIcon(entityType)
      }).addTo(map);

      const label = entityType === 'building'
        ? `<strong>${displayTitle || 'موقع المبنى'}</strong><br/>إحداثيات المبنى المعتمدة`
        : `<strong>${displayTitle || 'موقع الماكينة'}</strong><br/>الموقع المعتمد حالياً`;

      marker.bindPopup(label);

      if (!isReadOnly) {
        marker.on('dragend', (e) => {
          const latLng = (e.target as L.Marker).getLatLng();
          const cleanLat = Number(latLng.lat.toFixed(6));
          const cleanLng = Number(latLng.lng.toFixed(6));
          setSelectedLat(cleanLat);
          setSelectedLng(cleanLng);
          setManualInputLat(cleanLat.toFixed(6));
          setManualInputLng(cleanLng.toFixed(6));
          setDraftSource('MAP_SELECTION');
          setIsDraftUnsaved(true);
          setValidationError(null);
          marker.setIcon(createCustomPinIcon('draft'));
        });
      }

      markerRef.current = marker;
    }

    // If building reference coords exist: show subtle reference marker (does NOT populate machine GPS!)
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
        <div style="font-size: 11px; direction: rtl; text-align: right;">
          <strong>🏢 ${buildingReferenceCoords.buildingName || 'موقع المبنى التابع'}</strong><br/>
          <span style="color: #64748b;">(مرجع المبنى فقط — انقر على الخريطة لتحديد الموقع الفعلي للماكينة)</span>
        </div>
      `);

      referenceMarkerRef.current = refMarker;
    }

    // If proposed coordinates exist (for inspection)
    if (proposedCoordinates) {
      const propMarker = L.marker([proposedCoordinates.latitude, proposedCoordinates.longitude], {
        draggable: false,
        icon: createCustomPinIcon('proposed')
      }).addTo(map);

      propMarker.bindPopup(`
        <div style="direction: rtl; text-align: right;">
          <strong>الموقع المقترح من الفني</strong><br/>
          الفني: ${proposedCoordinates.technicianName || 'فني الصيانة'}<br/>
          الإحداثيات: ${proposedCoordinates.latitude.toFixed(6)}, ${proposedCoordinates.longitude.toFixed(6)}
        </div>
      `);

      proposedMarkerRef.current = propMarker;
    }

    // Map Click Interaction (Places or moves draft marker; requires explicit confirmation before saving)
    if (!isReadOnly) {
      map.on('click', (e: L.LeafletMouseEvent) => {
        const cleanLat = Number(e.latlng.lat.toFixed(6));
        const cleanLng = Number(e.latlng.lng.toFixed(6));
        updateOrPlaceMarker(cleanLat, cleanLng, 'MAP_SELECTION', true);
      });
    }

    // Resize observer to ensure full container dimensions render correctly
    const resizeTimer = setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      clearTimeout(resizeTimer);
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
      proposedMarkerRef.current = null;
      referenceMarkerRef.current = null;
      currentTileLayerRef.current = null;
      hybridOverlayLayerRef.current = null;
    };
  }, [
    isOpen,
    initialLatitude,
    initialLongitude,
    isReadOnly,
    proposedCoordinates,
    displayTitle,
    entityType,
    buildingReferenceCoords,
    applyTileLayers,
    updateOrPlaceMarker
  ]);

  // Zoom helpers
  const handleZoomIn = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.zoomIn();
    }
  };

  const handleZoomOut = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.zoomOut();
    }
  };

  const handleFocusSelected = () => {
    if (mapInstanceRef.current && selectedLat !== null && selectedLng !== null) {
      mapInstanceRef.current.setView([selectedLat, selectedLng], MAP_CONFIG.detailedZoom);
    }
  };

  // Apply manual coordinate inputs
  const handleApplyManualInputs = () => {
    const valResult = validateCoordinates(manualInputLat, manualInputLng);
    if (!valResult.isValid || valResult.latitude === null || valResult.longitude === null) {
      setValidationError(valResult.error || 'يرجى إدخال إحداثيات صحيحة بين [-90, 90] و [-180, 180].');
      return;
    }

    const lat = valResult.latitude;
    const lng = valResult.longitude;

    updateOrPlaceMarker(lat, lng, 'MANUAL_ENTRY', true);

    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([lat, lng], MAP_CONFIG.detailedZoom);
    }
  };

  // Browser Geolocation capture ("Use My Current Location")
  const handleCaptureDeviceGps = () => {
    setGeoCaptureError(null);
    if (!navigator.geolocation) {
      setGeoCaptureError('خاصية تحديد الموقع الجغرافي غير مدعومة في هذا المتصفح أو البيئة.');
      return;
    }

    setIsLocatingDevice(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocatingDevice(false);
        const lat = Number(position.coords.latitude.toFixed(6));
        const lng = Number(position.coords.longitude.toFixed(6));
        const accuracy = Math.round(position.coords.accuracy);

        setDeviceGpsAccuracy(accuracy);
        setDeviceGpsQuality(getGpsAccuracyQuality(accuracy));

        // Update preview coordinates and fly to location
        updateOrPlaceMarker(lat, lng, 'DEVICE_GPS', true);

        if (mapInstanceRef.current) {
          mapInstanceRef.current.setView([lat, lng], MAP_CONFIG.detailedZoom);
        }
      },
      (error) => {
        setIsLocatingDevice(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setGeoCaptureError('تم رفض إذن الوصول إلى الموقع الجغرافي. يرجى تفعيل الإذن من إعدادات المتصفح.');
            break;
          case error.POSITION_UNAVAILABLE:
            setGeoCaptureError('معلومات الموقع الجغرافي غير متوفرة حالياً من نظام GPS.');
            break;
          case error.TIMEOUT:
            setGeoCaptureError('انتهت مهلة الحصول على إحداثيات الموقع.');
            break;
          default:
            setGeoCaptureError('تعذر تحديد الموقع الجغرافي.');
            break;
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  };

  // Clear GPS handler
  const handleConfirmClearGps = () => {
    setSelectedLat(null);
    setSelectedLng(null);
    setManualInputLat('');
    setManualInputLng('');
    setDraftSource('NONE');
    setIsDraftUnsaved(true);
    setDeviceGpsAccuracy(null);
    setDeviceGpsQuality(null);

    if (markerRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.removeLayer(markerRef.current);
      markerRef.current = null;
    }

    setIsClearConfirmOpen(false);
  };

  // Save / Confirm Location
  const handleConfirm = () => {
    if (selectedLat === null || selectedLng === null) {
      // If user cleared GPS and confirms, emit clear
      if (isDraftUnsaved && (initialLatitude !== null || initialLongitude !== null)) {
        onConfirm({ latitude: null, longitude: null, source: 'NONE' });
        onClose();
        return;
      }

      setValidationError(
        entityType === 'building'
          ? 'يرجى النقر على الخريطة لتحديد موقع المبنى أولاً أو إدخال الإحداثيات.'
          : 'يرجى النقر على الخريطة لتحديد موقع الماكينة أولاً أو إدخال الإحداثيات.'
      );
      return;
    }

    onConfirm({
      latitude: selectedLat,
      longitude: selectedLng,
      source: draftSource || 'MAP_SELECTION'
    });
    onClose();
  };

  if (!isOpen) return null;

  const headerTitle = displayTitle
    ? entityType === 'building'
      ? `تحديد موقع المبنى (${displayTitle}) بدقة`
      : `تحديد موقع الماكينة (${displayTitle}) بدقة`
    : entityType === 'building'
    ? 'تحديد موقع المبنى على الخريطة / Building Precision Location'
    : 'تحديد موقع الماكينة على الخريطة / Machine Precision Location';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl shadow-2xl flex flex-col overflow-hidden max-h-[95vh]">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-xl ${
                entityType === 'building'
                  ? 'bg-indigo-600/20 text-indigo-400 border-indigo-500/30'
                  : 'bg-blue-600/20 text-blue-400 border-blue-500/30'
              } border`}
            >
              {entityType === 'building' ? <Building2 className="w-5 h-5" /> : <MapPin className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-slate-100">
                  {headerTitle}
                </h3>
                {isDraftUnsaved && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
                    مسودة غير محفوظة / Draft
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                انقر على الخريطة لوضع المؤشر، أو اسحب الدبوس لتعديل الإحداثيات بدقة عالية
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
            title="إغلاق / Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Building Reference Guidance Notice (Machine view only — does not populate machine coordinates) */}
        {entityType === 'machine' && buildingReferenceCoords && (
          <div className="px-5 py-2 bg-indigo-500/10 border-b border-indigo-500/20 flex items-center justify-between text-xs text-indigo-300">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 shrink-0 text-indigo-400" />
              <span>
                مرجع الخريطة: تم التمركز عند موقع مبنى <strong>({buildingReferenceCoords.buildingName || 'المبنى'})</strong> لتسهيل التحديد.
              </span>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">
              {buildingReferenceCoords.latitude.toFixed(4)}, {buildingReferenceCoords.longitude.toFixed(4)}
            </span>
          </div>
        )}

        {/* Satellite Fallback Warning */}
        {satelliteFallbackWarning && (
          <div className="px-5 py-2 bg-amber-500/10 border-b border-amber-500/30 flex items-center justify-between gap-2 text-xs text-amber-300">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>{satelliteFallbackWarning}</span>
            </div>
            <button
              onClick={() => setSatelliteFallbackWarning(null)}
              className="text-amber-400 hover:text-amber-200 text-xs"
            >
              ✕
            </button>
          </div>
        )}

        {/* Geolocation Error Notice */}
        {geoCaptureError && (
          <div className="px-5 py-2 bg-rose-500/10 border-b border-rose-500/30 flex items-center justify-between gap-2 text-xs text-rose-300">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{geoCaptureError}</span>
            </div>
            <button
              onClick={() => setGeoCaptureError(null)}
              className="text-rose-400 hover:text-rose-200 text-xs"
            >
              ✕
            </button>
          </div>
        )}

        {/* Map Viewport Toolbar & Canvas Container */}
        <div className="relative flex-1 min-h-[460px] bg-slate-950 flex flex-col">
          {/* Top Floating Map Controls: Layer Selector & Accuracy / Status Badge */}
          <div className="absolute top-3 inset-x-3 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
            {/* Map Mode Switcher (Street, Satellite, Hybrid) */}
            <div className="flex items-center p-1 rounded-xl bg-slate-900/90 backdrop-blur border border-slate-700/80 shadow-lg pointer-events-auto">
              <button
                type="button"
                onClick={() => setActiveLayerMode('street')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  activeLayerMode === 'street'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <span>🗺</span>
                <span>شوارع / Street</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveLayerMode('satellite')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  activeLayerMode === 'satellite'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <span>🛰</span>
                <span>قمر صناعي / Satellite</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveLayerMode('hybrid')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  activeLayerMode === 'hybrid'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <span>🌐</span>
                <span>هجين / Hybrid</span>
              </button>
            </div>

            {/* Current Coordinate Status Banner */}
            <div className="bg-slate-900/90 backdrop-blur border border-slate-700/80 px-3 py-1.5 rounded-xl text-xs text-slate-200 shadow-lg pointer-events-auto flex items-center gap-3">
              {selectedLat !== null && selectedLng !== null ? (
                <div className="flex items-center gap-2 font-mono">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isDraftUnsaved ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'
                    }`}
                  />
                  <span>Lat: {selectedLat.toFixed(6)}</span>
                  <span className="text-slate-600">|</span>
                  <span>Lng: {selectedLng.toFixed(6)}</span>
                  {deviceGpsQuality && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${deviceGpsQuality.badgeBgClass} ${deviceGpsQuality.textClass} ${deviceGpsQuality.badgeBorderClass}`}
                    >
                      ±{deviceGpsAccuracy}م ({deviceGpsQuality.labelAr})
                    </span>
                  )}
                </div>
              ) : (
                <div className="text-amber-400 flex items-center gap-1.5 font-medium">
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                  <span>الموقع غير محدد / Location Not Configured</span>
                </div>
              )}
            </div>
          </div>

          {/* Map Canvas */}
          <div ref={mapContainerRef} className="w-full h-full min-h-[460px] z-10 flex-1" />

          {/* Right Floating Map Control: Zoom & Center Buttons */}
          <div className="absolute right-3 bottom-16 z-20 flex flex-col gap-1.5 pointer-events-auto">
            <button
              type="button"
              onClick={handleZoomIn}
              className="p-2 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700/80 shadow-md transition-colors"
              title="تكبير / Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleZoomOut}
              className="p-2 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700/80 shadow-md transition-colors"
              title="تصغير / Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            {selectedLat !== null && selectedLng !== null && (
              <button
                type="button"
                onClick={handleFocusSelected}
                className="p-2 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-blue-400 border border-slate-700/80 shadow-md transition-colors"
                title="التركيز على المؤشر / Center on Marker"
              >
                <Compass className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Footer: Device GPS, Manual Entry & Actions */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 space-y-3">
          {validationError && (
            <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{validationError}</span>
            </div>
          )}

          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            {/* Quick Capture & Manual Lat/Lng Fields */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Device GPS Button */}
              {!isReadOnly && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  icon={LocateFixed}
                  disabled={isLocatingDevice}
                  onClick={handleCaptureDeviceGps}
                  className="text-xs text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/10"
                >
                  {isLocatingDevice ? 'جاري الالتقاط...' : '📍 موقعي الحالي (GPS)'}
                </Button>
              )}

              {/* Manual Lat input */}
              <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1">
                <span className="text-[11px] text-slate-400">Lat:</span>
                <input
                  type="text"
                  placeholder="24.713600"
                  value={manualInputLat}
                  onChange={(e) => setManualInputLat(e.target.value)}
                  disabled={isReadOnly}
                  className="w-24 bg-transparent text-xs font-mono text-slate-200 focus:outline-none"
                />
              </div>

              {/* Manual Lng input */}
              <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1">
                <span className="text-[11px] text-slate-400">Lng:</span>
                <input
                  type="text"
                  placeholder="46.675300"
                  value={manualInputLng}
                  onChange={(e) => setManualInputLng(e.target.value)}
                  disabled={isReadOnly}
                  className="w-24 bg-transparent text-xs font-mono text-slate-200 focus:outline-none"
                />
              </div>

              {!isReadOnly && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleApplyManualInputs}
                  className="text-xs"
                >
                  تطبيق الإحداثيات
                </Button>
              )}

              {/* Clear Location option */}
              {!isReadOnly && (selectedLat !== null || hasPersistedCoords) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  icon={Trash2}
                  onClick={() => setIsClearConfirmOpen(true)}
                  className="text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                >
                  مسح الموقع
                </Button>
              )}
            </div>

            {/* Action Buttons */}
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
                  disabled={selectedLat === null && !isDraftUnsaved}
                  onClick={handleConfirm}
                >
                  تأكيد واعتماد الموقع / Confirm Location
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Clear GPS Confirmation Dialog */}
        {isClearConfirmOpen && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-md w-full shadow-2xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-rose-600/20 text-rose-400 border border-rose-500/30">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">
                    تأكيد مسح إحداثيات الموقع
                  </h3>
                  <p className="text-xs text-slate-400">
                    هل أنت متأكد من رغبتك في إزالة إحداثيات الموقع؟
                  </p>
                </div>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-3 rounded-lg border border-slate-800">
                سيتم ضبط الإحداثيات على <strong>NULL</strong> وتحديث الحالة إلى <strong>LOCATION_NOT_CONFIGURED</strong> دون حذف أي بيانات أخرى.
              </p>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsClearConfirmOpen(false)}
                >
                  إلغاء
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleConfirmClearGps}
                  className="bg-rose-600 hover:bg-rose-500 text-white"
                >
                  نعم، إزالة الإحداثيات
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
