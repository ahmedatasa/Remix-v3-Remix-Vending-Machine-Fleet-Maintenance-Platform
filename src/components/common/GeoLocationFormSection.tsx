import React, { useState, useEffect } from 'react';
import { MapPin, LocateFixed, Trash2, AlertTriangle, CheckCircle2, Info, Building2 } from 'lucide-react';
import { Button } from './Button';
import { GeoLocationMapPicker } from './GeoLocationMapPicker';
import { validateCoordinates } from '../../utils/geoValidation';
import { LocationSource } from '../../types';
import { getGpsAccuracyQuality } from '../../config/mapConfig';

export interface GeoLocationFormSectionProps {
  latitude: number | null;
  longitude: number | null;
  locationSource?: string;
  locationNote: string;
  onCoordinatesChange: (coords: {
    latitude: number | null;
    longitude: number | null;
    source: LocationSource;
  }) => void;
  onLocationNoteChange: (note: string) => void;
  entityType?: 'machine' | 'building';
  entityTitle?: string;
  buildingReferenceCoords?: { latitude: number; longitude: number; buildingName?: string } | null;
  onUseBuildingLocation?: () => void;
  // Legacy prop alias
  machineTitle?: string;
}

export const GeoLocationFormSection: React.FC<GeoLocationFormSectionProps> = ({
  latitude,
  longitude,
  locationSource = 'NONE',
  locationNote,
  onCoordinatesChange,
  onLocationNoteChange,
  entityType = 'machine',
  entityTitle,
  buildingReferenceCoords,
  machineTitle
}) => {
  const displayTitle = entityTitle || machineTitle;

  // String inputs for direct manual typing
  const [latInput, setLatInput] = useState<string>(
    latitude !== null && latitude !== undefined ? String(latitude) : ''
  );
  const [lngInput, setLngInput] = useState<string>(
    longitude !== null && longitude !== undefined ? String(longitude) : ''
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  // Modals state
  const [isMapPickerOpen, setIsMapPickerOpen] = useState(false);
  const [isLocatingDevice, setIsLocatingDevice] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  // Device GPS preview state before confirmation
  const [deviceGpsPreview, setDeviceGpsPreview] = useState<{
    lat: number;
    lng: number;
    accuracy: number;
  } | null>(null);

  // Building reference preview modal state
  const [isBuildingRefModalOpen, setIsBuildingRefModalOpen] = useState(false);

  // Clear confirmation modal state
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);

  // Synchronize internal input strings if parent updates (e.g. from map or reset)
  useEffect(() => {
    setLatInput(latitude !== null && latitude !== undefined ? String(latitude) : '');
    setLngInput(longitude !== null && longitude !== undefined ? String(longitude) : '');
    setValidationError(null);
  }, [latitude, longitude]);

  const isConfigured = latitude !== null && longitude !== null && !isNaN(Number(latitude)) && !isNaN(Number(longitude));

  // Validate manual input strings using shared validator
  const validateAndEmitManual = (newLatStr: string, newLngStr: string) => {
    const valResult = validateCoordinates(newLatStr, newLngStr);
    if (!valResult.isValid) {
      setValidationError(valResult.error || 'إحداثيات غير صحيحة.');
      return false;
    }

    setValidationError(null);
    if (valResult.latitude === null && valResult.longitude === null) {
      onCoordinatesChange({ latitude: null, longitude: null, source: 'NONE' });
    } else {
      onCoordinatesChange({
        latitude: valResult.latitude,
        longitude: valResult.longitude,
        source: 'MANUAL_ENTRY'
      });
    }
    return true;
  };

  const handleLatChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLatInput(val);
    validateAndEmitManual(val, lngInput);
  };

  const handleLngChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLngInput(val);
    validateAndEmitManual(latInput, val);
  };

  // Browser Geolocation capture with accuracy preview
  const handleCaptureDeviceGps = () => {
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError('خاصية تحديد الموقع الجغرافي غير مدعومة في متصفحك.');
      return;
    }

    setIsLocatingDevice(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocatingDevice(false);
        const lat = Number(position.coords.latitude.toFixed(6));
        const lng = Number(position.coords.longitude.toFixed(6));
        const accuracy = Math.round(position.coords.accuracy);

        setDeviceGpsPreview({
          lat,
          lng,
          accuracy
        });
      },
      (error) => {
        setIsLocatingDevice(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setGeoError('تم رفض إذن الوصول إلى الموقع الجغرافي. يرجى تفعيل الإذن من إعدادات المتصفح.');
            break;
          case error.POSITION_UNAVAILABLE:
            setGeoError('معلومات الموقع الجغرافي غير متوفرة حالياً.');
            break;
          case error.TIMEOUT:
            setGeoError('انتهت مهلة الحصول على الموقع الجغرافي.');
            break;
          default:
            setGeoError('تعذر تحديد الموقع الجغرافي.');
            break;
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  };

  // Explicit confirmation of Device GPS
  const handleConfirmDeviceGps = () => {
    if (!deviceGpsPreview) return;
    setLatInput(String(deviceGpsPreview.lat));
    setLngInput(String(deviceGpsPreview.lng));
    setValidationError(null);
    onCoordinatesChange({
      latitude: deviceGpsPreview.lat,
      longitude: deviceGpsPreview.lng,
      source: 'DEVICE_GPS'
    });
    setDeviceGpsPreview(null);
  };

  // Explicit confirmation of Building Reference Coordinates (Section 16)
  const handleConfirmBuildingReference = () => {
    if (!buildingReferenceCoords) return;
    const { latitude: bLat, longitude: bLng } = buildingReferenceCoords;
    setLatInput(String(bLat));
    setLngInput(String(bLng));
    setValidationError(null);
    onCoordinatesChange({
      latitude: bLat,
      longitude: bLng,
      source: 'BUILDING_LOCATION_REFERENCE'
    });
    setIsBuildingRefModalOpen(false);
  };

  // Explicit confirmation of clearing GPS
  const handleConfirmClearGps = () => {
    setLatInput('');
    setLngInput('');
    setValidationError(null);
    onCoordinatesChange({
      latitude: null,
      longitude: null,
      source: 'NONE'
    });
    setIsClearConfirmOpen(false);
  };

  const sectionTitle = entityType === 'building'
    ? 'الموقع الجغرافي للمبنى / Geographic Location'
    : 'الموقع الجغرافي للماكينة / Geographic Location';

  const sectionSubtitle = entityType === 'building'
    ? 'إحداثيات المبنى الجغرافية ونقطة التمركز المرجعية (اختياري / Optional GPS)'
    : 'إحداثيات الموقع الدقيقة للماكينة ونطاق التحقق الميداني (اختياري / Optional GPS)';

  const entityLabel = entityType === 'building' ? 'المبنى' : 'الماكينة';

  return (
    <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-4">
      {/* Section Header with GPS Status Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          {entityType === 'building' ? (
            <Building2 className="w-4 h-4 text-indigo-400" />
          ) : (
            <MapPin className="w-4 h-4 text-blue-400" />
          )}
          <div>
            <h4 className="text-xs font-bold text-slate-200">
              {sectionTitle}
            </h4>
            <p className="text-[11px] text-slate-400">
              {sectionSubtitle}
            </p>
          </div>
        </div>

        <div>
          {isConfigured ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              ✓ GPS_CONFIGURED
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
              ⚠ LOCATION_NOT_CONFIGURED
            </span>
          )}
        </div>
      </div>

      {/* Geolocation Browser Error Notice */}
      {geoError && (
        <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center gap-2 text-xs text-amber-300">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
          <span>{geoError}</span>
        </div>
      )}

      {/* Validation Error Message */}
      {validationError && (
        <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center gap-2 text-xs text-rose-300">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{validationError}</span>
        </div>
      )}

      {/* Coordinate Input Fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-semibold text-slate-300 flex items-center justify-between mb-1">
            <span>خط العرض / Latitude</span>
            <span className="text-[10px] text-slate-500 font-mono">[-90 to 90]</span>
          </label>
          <div className="relative">
            <input
              type="text"
              placeholder="مثال: 24.713600"
              value={latInput}
              onChange={handleLatChange}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>
        </div>

        <div>
          <label className="text-[11px] font-semibold text-slate-300 flex items-center justify-between mb-1">
            <span>خط الطول / Longitude</span>
            <span className="text-[10px] text-slate-500 font-mono">[-180 to 180]</span>
          </label>
          <div className="relative">
            <input
              type="text"
              placeholder="مثال: 46.675300"
              value={lngInput}
              onChange={handleLngChange}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>
        </div>
      </div>

      {/* Location Source & Status Metadata Display */}
      {isConfigured && (
        <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-lg bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400 font-mono">
          <div className="flex items-center gap-2">
            <span>المصدر / Source:</span>
            <span className="text-blue-400 font-bold">{locationSource || 'MANUAL_ENTRY'}</span>
          </div>
          <div className="flex items-center gap-2 text-[10px]">
            <span>الإحداثيات الحالية:</span>
            <span className="text-slate-200">{Number(latitude).toFixed(6)}, {Number(longitude).toFixed(6)}</span>
          </div>
        </div>
      )}

      {/* Action Buttons: Geolocation, Map Picker, Use Building Location, Clear GPS */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          icon={LocateFixed}
          disabled={isLocatingDevice}
          onClick={handleCaptureDeviceGps}
          className="text-xs"
        >
          {isLocatingDevice ? 'جاري التقاط الإحداثيات...' : '📍 استخدام موقعي الحالي'}
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          icon={MapPin}
          onClick={() => setIsMapPickerOpen(true)}
          className="text-xs"
        >
          🗺 تحديد الموقع على الخريطة
        </Button>

        {/* Optional Action: Use Building Location for Machine (Section 16) */}
        {entityType === 'machine' &&
          buildingReferenceCoords &&
          typeof buildingReferenceCoords.latitude === 'number' &&
          typeof buildingReferenceCoords.longitude === 'number' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={Building2}
              onClick={() => setIsBuildingRefModalOpen(true)}
              className="text-xs text-indigo-300 border-indigo-500/40 hover:bg-indigo-500/10"
              title="نسخ إحداثيات المبنى كمرجع للماكينة"
            >
              🏢 استخدام موقع المبنى
            </Button>
          )}

        {isConfigured && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon={Trash2}
            onClick={() => setIsClearConfirmOpen(true)}
            className="text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 ml-auto"
          >
            ✖ مسح الموقع
          </Button>
        )}
      </div>

      {/* Internal Location Note */}
      <div>
        <label className="text-[11px] font-semibold text-slate-300 flex items-center justify-between mb-1">
          <span>{entityType === 'building' ? 'وصف موقع المبنى / Location Note' : 'وصف الموقع الداخلي للماكينة / Internal Location Note'}</span>
          <span className="text-[10px] text-slate-500 font-normal">اختياري - للاستخدام الداخلي فقط</span>
        </label>
        <input
          type="text"
          placeholder={
            entityType === 'building'
              ? 'مثال: البوابة الرئيسية - الجهة الشرقية، بجانب مجمع كليات الهندسة'
              : 'مثال: بجوار المصعد الرئيسي في الدور الأرضي، مدخل بهو الطلاب'
          }
          value={locationNote}
          onChange={(e) => onLocationNoteChange(e.target.value)}
          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Unified Leaflet Map Picker Modal */}
      <GeoLocationMapPicker
        isOpen={isMapPickerOpen}
        onClose={() => setIsMapPickerOpen(false)}
        initialLatitude={latitude}
        initialLongitude={longitude}
        entityTitle={displayTitle}
        entityType={entityType}
        buildingReferenceCoords={buildingReferenceCoords}
        onConfirm={(coords) => {
          if (coords.latitude === null || coords.longitude === null) {
            setLatInput('');
            setLngInput('');
            setValidationError(null);
            onCoordinatesChange({
              latitude: null,
              longitude: null,
              source: 'NONE'
            });
          } else {
            setLatInput(coords.latitude.toFixed(6));
            setLngInput(coords.longitude.toFixed(6));
            setValidationError(null);
            onCoordinatesChange({
              latitude: coords.latitude,
              longitude: coords.longitude,
              source: coords.source || 'MAP_SELECTION'
            });
          }
        }}
      />

      {/* Device GPS Confirmation Preview Modal */}
      {deviceGpsPreview && (() => {
        const quality = getGpsAccuracyQuality(deviceGpsPreview.accuracy);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-md w-full shadow-2xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">
                    تأكيد التقاط موقع الجهاز المباشر (GPS)
                  </h3>
                  <p className="text-xs text-slate-400">
                    تم قراءة إحداثيات جهازك الحالية بنجاح عبر نظام GPS
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400">خط العرض (Latitude):</span>
                  <span className="text-emerald-400 font-bold">{deviceGpsPreview.lat}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">خط الطول (Longitude):</span>
                  <span className="text-emerald-400 font-bold">{deviceGpsPreview.lng}</span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
                  <span className="text-slate-400">دقة الإشارة (Accuracy):</span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-200">± {deviceGpsPreview.accuracy} متر</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${quality.badgeBgClass} ${quality.textClass} ${quality.badgeBorderClass}`}>
                      {quality.labelAr}
                    </span>
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-slate-400">
                بالنقر على "تأكيد واستخدام"، سيتم اعتماد هذه الإحداثيات وتوثيق المصدر كـ <strong>DEVICE_GPS</strong>.
              </p>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDeviceGpsPreview(null)}
                >
                  إلغاء
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  icon={CheckCircle2}
                  onClick={handleConfirmDeviceGps}
                >
                  تأكيد واستخدام هذا الموقع
                </Button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Building Reference Location Confirmation Modal (Section 16) */}
      {isBuildingRefModalOpen && buildingReferenceCoords && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-100">
                  تأكيد استخدام موقع المبنى كمرجع للماكينة
                </h3>
                <p className="text-xs text-slate-400">
                  المبنى: {buildingReferenceCoords.buildingName || 'المبنى المحدد'}
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-slate-400">خط العرض (Latitude):</span>
                <span className="text-indigo-400 font-bold">{buildingReferenceCoords.latitude}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">خط الطول (Longitude):</span>
                <span className="text-indigo-400 font-bold">{buildingReferenceCoords.longitude}</span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 space-y-1">
              <p className="font-semibold">تنبيه هام حول مرجعية الموقع:</p>
              <p className="text-[11px] leading-relaxed">
                هذه الإحداثيات تعبر عن الموقع الجغرافي للمبنى ككل وليس الموقع الدقيق للماكينة بداخله. سيتم توثيق المصدر رسمياً كـ <strong>BUILDING_LOCATION_REFERENCE</strong>.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsBuildingRefModalOpen(false)}
              >
                إلغاء
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                icon={CheckCircle2}
                onClick={handleConfirmBuildingReference}
              >
                تأكيد واعتماد إحداثيات المبنى
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Clear GPS Confirmation Modal */}
      {isClearConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-600/20 text-rose-400 border border-rose-500/30">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-100">
                  تأكيد مسح إحداثيات موقع {entityLabel}
                </h3>
                <p className="text-xs text-slate-400">
                  هل أنت متأكد من رغبتك في إزالة الإحداثيات الجغرافية المسجلة؟
                </p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 leading-relaxed">
              {entityType === 'building' ? (
                <>
                  سيتم إرجاع حالة موقع المبنى إلى <strong>LOCATION_NOT_CONFIGURED</strong> دون حذف المبنى أو التأثير على أي طوابق أو مواقع أو ماكينات تابعة له.
                </>
              ) : (
                <>
                  سيتم إرجاع حالة موقع الماكينة إلى <strong>LOCATION_NOT_CONFIGURED</strong> دون حذف الماكينة أو تعديل رمز الاستجابة السريعة (QR) أو التأثير على السجل التاريخي.
                </>
              )}
            </div>

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
                نعم، مسح الإحداثيات
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
