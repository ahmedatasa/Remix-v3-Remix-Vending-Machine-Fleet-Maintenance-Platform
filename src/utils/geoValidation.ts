/**
 * KSU Fleet Management System — Geographic Coordinate Validation Utilities
 * Shared validation rules across Machines, Buildings, and Field Operations.
 */

export interface GeoCoordinatesValidationResult {
  isValid: boolean;
  latitude: number | null;
  longitude: number | null;
  error?: string;
}

/**
 * Validates latitude and longitude coordinate inputs.
 * Rules:
 * - Both null/empty string/undefined: Valid (GPS is optional) -> { isValid: true, latitude: null, longitude: null }
 * - Only one field present: Invalid (Reject partial pairs)
 * - Latitude must be a valid number between -90 and 90 (0 is valid)
 * - Longitude must be a valid number between -180 and 180 (0 is valid)
 */
export function validateCoordinates(
  latInput: string | number | null | undefined,
  lngInput: string | number | null | undefined
): GeoCoordinatesValidationResult {
  const isLatEmpty = latInput === null || latInput === undefined || String(latInput).trim() === '';
  const isLngEmpty = lngInput === null || lngInput === undefined || String(lngInput).trim() === '';

  // Both empty: perfectly valid optional GPS state
  if (isLatEmpty && isLngEmpty) {
    return {
      isValid: true,
      latitude: null,
      longitude: null
    };
  }

  // Reject partial coordinate pairs
  if (isLatEmpty || isLngEmpty) {
    return {
      isValid: false,
      latitude: null,
      longitude: null,
      error: 'يجب إدخال كل من خط العرض وخط الطول معاً، أو تركهما فارغين لحفظ الموقع بدون GPS.'
    };
  }

  const latNum = Number(String(latInput).trim());
  const lngNum = Number(String(lngInput).trim());

  if (isNaN(latNum) || latNum < -90 || latNum > 90) {
    return {
      isValid: false,
      latitude: null,
      longitude: null,
      error: 'خط العرض يجب أن يكون رقماً صحيحاً بين -90 و 90 درجة.'
    };
  }

  if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
    return {
      isValid: false,
      latitude: null,
      longitude: null,
      error: 'خط الطول يجب أن يكون رقماً صحيحاً بين -180 و 180 درجة.'
    };
  }

  return {
    isValid: true,
    latitude: Number(latNum.toFixed(6)),
    longitude: Number(lngNum.toFixed(6))
  };
}

/**
 * Validates individual latitude.
 */
export function validateLatitude(lat: any): { valid: boolean; error?: string } {
  if (lat === null || lat === undefined || String(lat).trim() === '') {
    return { valid: true };
  }
  const num = Number(lat);
  if (isNaN(num) || num < -90 || num > 90) {
    return { valid: false, error: 'خط العرض يجب أن يكون رقماً بين -90 و 90 درجة.' };
  }
  return { valid: true };
}

/**
 * Validates individual longitude.
 */
export function validateLongitude(lng: any): { valid: boolean; error?: string } {
  if (lng === null || lng === undefined || String(lng).trim() === '') {
    return { valid: true };
  }
  const num = Number(lng);
  if (isNaN(num) || num < -180 || num > 180) {
    return { valid: false, error: 'خط الطول يجب أن يكون رقماً بين -180 و 180 درجة.' };
  }
  return { valid: true };
}

/**
 * Normalizes coordinates to 6 decimal precision.
 */
export function normalizeCoordinates(lat: number, lng: number): { latitude: number; longitude: number } {
  return {
    latitude: Number(lat.toFixed(6)),
    longitude: Number(lng.toFixed(6))
  };
}
