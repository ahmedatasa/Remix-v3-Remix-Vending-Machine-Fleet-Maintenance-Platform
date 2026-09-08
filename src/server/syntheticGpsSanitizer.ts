/**
 * PHASE 5.4.5: Synthetic GPS Sanitizer & Version Normalization
 * 
 * Provides deterministic detection and remediation for legacy formula-generated GPS:
 *   expectedLat = round6(24.7136 + ((machineNumber % 40) * 0.00035))
 *   expectedLng = round6(46.6753 + (((machineNumber * 7) % 40) * 0.00035))
 * 
 * Strict Invariants:
 *  1. UNKNOWN GPS = NULL (never default coordinates)
 *  2. Dual-field pair invariant: latitude === machineLatitude && longitude === machineLongitude
 *  3. Real GPS is ALWAYS preserved (manual entry, device GPS, map selection, approved proposals)
 *  4. Idempotent execution
 */

export interface GpsSanitizationSummary {
  totalMachines: number;
  syntheticCleared: number;
  realGpsPreserved: number;
  unconfiguredCount: number;
}

/**
 * Checks whether a machine record contains the legacy synthetic formula GPS coordinates.
 * Positive evidence requires BOTH:
 *  - Numeric machineNumber > 0
 *  - Coordinates match the historical campus dispersion formula within floating epsilon
 *  - Absence of explicit trusted user/field provenance
 */
export function isLegacySyntheticGps(machine: any): boolean {
  if (!machine || typeof machine !== 'object') return false;

  // 1. Check explicit trusted provenance: Real coordinates with verified source must NEVER be cleared
  const source = machine.locationSource;
  const TRUSTED_SOURCES = [
    'MANUAL_ENTRY',
    'DEVICE_GPS',
    'MAP_SELECTION',
    'APPROVED_LOCATION_PROPOSAL',
    'AUTHORIZED_IMPORT',
    'FIELD_CHECKIN'
  ];
  if (source && TRUSTED_SOURCES.includes(source)) {
    return false;
  }

  // 2. Numeric machineNumber is required for formula evaluation
  const num = parseInt(machine.machineNumber, 10);
  if (isNaN(num) || num <= 0) {
    return false;
  }

  // 3. Resolve existing coordinates across canonical and legacy pairs
  const lat = typeof machine.latitude === 'number'
    ? machine.latitude
    : (typeof machine.machineLatitude === 'number' ? machine.machineLatitude : null);
  const lng = typeof machine.longitude === 'number'
    ? machine.longitude
    : (typeof machine.machineLongitude === 'number' ? machine.machineLongitude : null);

  if (lat === null || lng === null) {
    return false;
  }

  // 4. Calculate exact formula coordinates
  const expLat = Number((24.7136 + ((num % 40) * 0.00035)).toFixed(6));
  const expLng = Number((46.6753 + (((num * 7) % 40) * 0.00035)).toFixed(6));

  const latMatches = Math.abs(lat - expLat) < 0.000005;
  const lngMatches = Math.abs(lng - expLng) < 0.000005;

  return latMatches && lngMatches;
}

/**
 * Sanitizes a single machine record.
 * If synthetic: clears coordinates to null, sets locationStatus to LOCATION_NOT_CONFIGURED.
 * If legitimate: preserves real GPS and aligns dual-field pair invariant.
 */
export function sanitizeMachineGps(machine: any): any {
  if (!machine || typeof machine !== 'object') return machine;

  if (isLegacySyntheticGps(machine)) {
    // Proven synthetic GPS -> Clear to null
    return {
      ...machine,
      latitude: null,
      longitude: null,
      machineLatitude: null,
      machineLongitude: null,
      locationSource: 'NONE',
      locationStatus: 'LOCATION_NOT_CONFIGURED',
      locationUpdatedAt: null,
      legacySyntheticGpsRemovedAt: machine.legacySyntheticGpsRemovedAt || new Date().toISOString(),
      locationDataQuality: 'UNCONFIGURED'
    };
  }

  // Legitimate or already unconfigured: enforce dual-field pair equality
  const lat = typeof machine.latitude === 'number' && !isNaN(machine.latitude)
    ? Number(machine.latitude.toFixed(6))
    : (typeof machine.machineLatitude === 'number' && !isNaN(machine.machineLatitude) ? Number(machine.machineLatitude.toFixed(6)) : null);
  const lng = typeof machine.longitude === 'number' && !isNaN(machine.longitude)
    ? Number(machine.longitude.toFixed(6))
    : (typeof machine.machineLongitude === 'number' && !isNaN(machine.machineLongitude) ? Number(machine.machineLongitude.toFixed(6)) : null);

  const hasCoords = lat !== null && lng !== null;

  return {
    ...machine,
    latitude: lat,
    longitude: lng,
    machineLatitude: lat,
    machineLongitude: lng,
    locationStatus: hasCoords ? (machine.locationStatus || 'GPS_CONFIGURED') : 'LOCATION_NOT_CONFIGURED',
    locationSource: hasCoords ? (machine.locationSource || 'MANUAL_ENTRY') : 'NONE',
    locationUpdatedAt: hasCoords ? (machine.locationUpdatedAt || null) : null
  };
}

/**
 * Batch sanitizes fleet machines and reports metrics.
 */
export function sanitizeFleetMachines(machines: any[]): {
  machines: any[];
  summary: GpsSanitizationSummary;
} {
  if (!Array.isArray(machines)) {
    return {
      machines: [],
      summary: { totalMachines: 0, syntheticCleared: 0, realGpsPreserved: 0, unconfiguredCount: 0 }
    };
  }

  let syntheticCleared = 0;
  let realGpsPreserved = 0;
  let unconfiguredCount = 0;

  const sanitized = machines.map(m => {
    const isSynthetic = isLegacySyntheticGps(m);
    const cleaned = sanitizeMachineGps(m);

    if (isSynthetic) {
      syntheticCleared++;
      unconfiguredCount++;
    } else if (cleaned.latitude !== null && cleaned.longitude !== null) {
      realGpsPreserved++;
    } else {
      unconfiguredCount++;
    }

    return cleaned;
  });

  return {
    machines: sanitized,
    summary: {
      totalMachines: machines.length,
      syntheticCleared,
      realGpsPreserved,
      unconfiguredCount
    }
  };
}

/**
 * Normalizes entity revisions to integer baseline >= 1.
 * Does NOT alter IDs or updatedAt timestamps.
 */
export function normalizeEntityRevisions(entities: any[]): any[] {
  if (!Array.isArray(entities)) return [];
  return entities.map(item => {
    if (!item || typeof item !== 'object') return item;
    const rev = item.revision;
    // Strict positive integer: must be integer >= 1, and NOT epoch-like (e.g. timestamp >= 10^9)
    const isStrictIntRev =
      typeof rev === 'number' &&
      !isNaN(rev) &&
      isFinite(rev) &&
      Number.isInteger(rev) &&
      rev >= 1 &&
      rev < 1000000000;

    return {
      ...item,
      revision: isStrictIntRev ? rev : 1
    };
  });
}
