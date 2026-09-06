import { cloudConfig } from '../config/cloudConfig';
import { SanitizedCloudMachine } from '../db/cloudDb';

export interface GpsCoordinates {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
}

export interface GpsValidationResult {
  verified: boolean;
  status: 'VERIFIED' | 'FAILED_DISTANCE' | 'FAILED_ACCURACY' | 'COORDINATES_MISSING' | 'MANUAL_EXCEPTION';
  distanceMeters: number;
  accuracyMeters: number;
  allowedRadiusMeters: number;
  maxAccuracyMeters: number;
  message: string;
}

export class GpsService {
  /**
   * Calculate distance between two coordinates in meters using Haversine formula
   */
  public static calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Earth radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return Math.round(R * c);
  }

  /**
   * Authoritative backend GPS verification.
   * NEVER trust client-claimed `gpsVerified=true`.
   */
  public static validateFieldPresence(
    coords: GpsCoordinates | null | undefined,
    machine: SanitizedCloudMachine,
    manualException?: { approvedBy: string; reason: string; approverRole?: string }
  ): GpsValidationResult {
    const allowedRadius = cloudConfig.technicianCheckinRadiusMeters;
    const maxAccuracy = cloudConfig.technicianMaxGpsAccuracyMeters;

    // Handle Manual Operational Exception
    if (manualException && manualException.reason && manualException.reason.trim().length >= 10 && manualException.approvedBy) {
      return {
        verified: true,
        status: 'MANUAL_EXCEPTION',
        distanceMeters: -1,
        accuracyMeters: coords?.accuracyMeters || -1,
        allowedRadiusMeters: allowedRadius,
        maxAccuracyMeters: maxAccuracy,
        message: `تم اعتماد استثناء تشغيلي يدوي معتمد بواسطة ${manualException.approvedBy}: ${manualException.reason}`
      };
    }

    if (!coords || typeof coords.latitude !== 'number' || typeof coords.longitude !== 'number') {
      return {
        verified: false,
        status: 'COORDINATES_MISSING',
        distanceMeters: -1,
        accuracyMeters: -1,
        allowedRadiusMeters: allowedRadius,
        maxAccuracyMeters: maxAccuracy,
        message: 'GPS_UNAVAILABLE: لم يتم استلام إحداثيات موقع دقيقة من جهاز الفني.'
      };
    }

    const { latitude, longitude, accuracyMeters } = coords;

    // Validate coordinate ranges
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return {
        verified: false,
        status: 'COORDINATES_MISSING',
        distanceMeters: -1,
        accuracyMeters,
        allowedRadiusMeters: allowedRadius,
        maxAccuracyMeters: maxAccuracy,
        message: 'إحداثيات الـ GPS غير صالحة من الناحية الجغرافية.'
      };
    }

    // Validate GPS Accuracy
    if (accuracyMeters > maxAccuracy) {
      return {
        verified: false,
        status: 'FAILED_ACCURACY',
        distanceMeters: -1,
        accuracyMeters,
        allowedRadiusMeters: allowedRadius,
        maxAccuracyMeters: maxAccuracy,
        message: `دقة إشارة الموقع ضعيفة جداً (${accuracyMeters}م). الحد الأقصى المقبول للدقة الميدانية هو ${maxAccuracy}م. يرجى الخروج لمكان مفتوح.`
      };
    }

    // Machine must have configured coordinates
    if (typeof machine.latitude !== 'number' || typeof machine.longitude !== 'number') {
      // If machine location coordinates not set in fleet, require manual exception
      return {
        verified: false,
        status: 'COORDINATES_MISSING',
        distanceMeters: -1,
        accuracyMeters,
        allowedRadiusMeters: allowedRadius,
        maxAccuracyMeters: maxAccuracy,
        message: 'لم يتم ضبط الإحداثيات الجغرافية لهذه الماكينة في سجل الأسطول بعد. يلزم تسجيل استثناء معتمد لإتمام التحقق.'
      };
    }

    // Calculate actual distance
    const distance = this.calculateDistanceMeters(latitude, longitude, machine.latitude, machine.longitude);

    if (distance > allowedRadius) {
      return {
        verified: false,
        status: 'FAILED_DISTANCE',
        distanceMeters: distance,
        accuracyMeters,
        allowedRadiusMeters: allowedRadius,
        maxAccuracyMeters: maxAccuracy,
        message: `الفني خارج النطاق الجغرافي المسموح به للماكينة (المسافة: ${distance}م، الحد المسموح: ${allowedRadius}م).`
      };
    }

    return {
      verified: true,
      status: 'VERIFIED',
      distanceMeters: distance,
      accuracyMeters,
      allowedRadiusMeters: allowedRadius,
      maxAccuracyMeters: maxAccuracy,
      message: `تم التحقق من الحضور الميداني بنجاح (المسافة: ${distance}م، الدقة: ${accuracyMeters}م).`
    };
  }
}
