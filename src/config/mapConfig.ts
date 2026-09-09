/**
 * KSU Fleet Management Platform — Map & Geolocation Configuration (Phase 5.4.6)
 *
 * Centralizes configuration for map layers (Street, Satellite, Hybrid),
 * tile providers, attributions, coordinate defaults, and geolocation accuracy thresholds.
 *
 * All external endpoints and provider URLs are abstracted here and configurable
 * via environment variables without hardcoding secret keys.
 */

export type MapLayerMode = 'street' | 'satellite' | 'hybrid';

export interface TileLayerConfig {
  id: string;
  name: string;
  nameAr: string;
  url: string;
  attribution: string;
  maxZoom: number;
  minZoom: number;
  subdomains?: string | string[];
}

export interface MapConfig {
  defaultLayer: MapLayerMode;
  defaultCenter: [number, number]; // [lat, lng] — Riyadh / KSU Campus
  defaultZoom: number;
  detailedZoom: number;
  maxZoom: number;
  minZoom: number;
  layers: {
    street: TileLayerConfig;
    satellite: TileLayerConfig;
    hybridOverlay: TileLayerConfig;
  };
  accuracyThresholds: {
    excellent: number; // <= 10m
    good: number;      // <= 25m
    fair: number;      // <= 50m
  };
}

// Read optional environment variables (Vite client-side)
const meta = import.meta as unknown as { env?: Record<string, string | undefined> };
const env = meta?.env || {};

const defaultLayerEnv = (env.VITE_MAP_DEFAULT_LAYER || 'street').toLowerCase();
const validDefaultLayer: MapLayerMode =
  defaultLayerEnv === 'satellite' || defaultLayerEnv === 'hybrid' ? defaultLayerEnv : 'street';

export const MAP_CONFIG: MapConfig = {
  defaultLayer: validDefaultLayer,
  // Riyadh KSU default center coordinates (King Saud University main campus)
  defaultCenter: [24.7136, 46.6753],
  defaultZoom: 14,
  detailedZoom: 17,
  maxZoom: 19,
  minZoom: 3,
  layers: {
    street: {
      id: 'street',
      name: 'Street',
      nameAr: 'شوارع',
      url: env.VITE_MAP_STREET_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: env.VITE_MAP_STREET_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
      maxZoom: 19,
      minZoom: 3,
      subdomains: ['a', 'b', 'c']
    },
    satellite: {
      id: 'satellite',
      name: 'Satellite',
      nameAr: 'قمر صناعي',
      // Permitted Esri World Imagery (ArcGIS Online) or custom configured provider URL
      url: env.VITE_MAP_SATELLITE_URL || 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: env.VITE_MAP_SATELLITE_ATTRIBUTION || 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
      maxZoom: 19,
      minZoom: 3
    },
    hybridOverlay: {
      id: 'hybridOverlay',
      name: 'Boundaries & Roads',
      nameAr: 'حدود وشوارع',
      // Permitted reference overlay (Esri World Boundaries and Places)
      url: env.VITE_MAP_HYBRID_OVERLAY_URL || 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      attribution: env.VITE_MAP_HYBRID_ATTRIBUTION || 'Tiles &copy; Esri &mdash; Boundaries & Places',
      maxZoom: 19,
      minZoom: 3
    }
  },
  accuracyThresholds: {
    excellent: 10,
    good: 25,
    fair: 50
  }
};

export interface GpsAccuracyQuality {
  level: 'excellent' | 'good' | 'fair' | 'low';
  labelEn: string;
  labelAr: string;
  colorClass: string;
  badgeBgClass: string;
  badgeBorderClass: string;
  textClass: string;
  description: string;
}

/**
 * Returns a human-friendly accuracy assessment based on GPS accuracy in meters.
 * UX indicator only — does not reject legitimate GPS coordinates.
 */
export function getGpsAccuracyQuality(accuracyMeters: number | null | undefined): GpsAccuracyQuality {
  if (accuracyMeters === null || accuracyMeters === undefined || isNaN(accuracyMeters)) {
    return {
      level: 'fair',
      labelEn: 'Unknown',
      labelAr: 'غير محدد',
      colorClass: 'text-slate-400',
      badgeBgClass: 'bg-slate-500/15',
      badgeBorderClass: 'border-slate-500/30',
      textClass: 'text-slate-300',
      description: 'دقة الإشارة غير محددة'
    };
  }

  if (accuracyMeters <= MAP_CONFIG.accuracyThresholds.excellent) {
    return {
      level: 'excellent',
      labelEn: 'Excellent',
      labelAr: 'ممتازة',
      colorClass: 'text-emerald-400',
      badgeBgClass: 'bg-emerald-500/15',
      badgeBorderClass: 'border-emerald-500/30',
      textClass: 'text-emerald-300',
      description: `دقة ممتازة عالية (±${accuracyMeters}م)`
    };
  }

  if (accuracyMeters <= MAP_CONFIG.accuracyThresholds.good) {
    return {
      level: 'good',
      labelEn: 'Good',
      labelAr: 'جيدة',
      colorClass: 'text-blue-400',
      badgeBgClass: 'bg-blue-500/15',
      badgeBorderClass: 'border-blue-500/30',
      textClass: 'text-blue-300',
      description: `دقة جيدة للتحقق الميداني (±${accuracyMeters}م)`
    };
  }

  if (accuracyMeters <= MAP_CONFIG.accuracyThresholds.fair) {
    return {
      level: 'fair',
      labelEn: 'Fair',
      labelAr: 'مقبولة',
      colorClass: 'text-amber-400',
      badgeBgClass: 'bg-amber-500/15',
      badgeBorderClass: 'border-amber-500/30',
      textClass: 'text-amber-300',
      description: `دقة مقبولة (±${accuracyMeters}م)`
    };
  }

  return {
    level: 'low',
    labelEn: 'Low accuracy',
    labelAr: 'دقة منخفضة',
    colorClass: 'text-rose-400',
    badgeBgClass: 'bg-rose-500/15',
    badgeBorderClass: 'border-rose-500/30',
    textClass: 'text-rose-300',
    description: `دقة منخفضة (±${accuracyMeters}م). يُفضل إعادة المحاولة في مكان مكشوف`
  };
}
