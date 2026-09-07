import React from 'react';
import { GeoLocationFormSection, GeoLocationFormSectionProps } from './GeoLocationFormSection';
import { LocationSource } from '../../types';

export interface MachineGpsFormSectionProps {
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
  machineTitle?: string;
  buildingReferenceCoords?: { latitude: number; longitude: number; buildingName?: string } | null;
}

/**
 * MachineGpsFormSection - Specialized wrapper around the generic GeoLocationFormSection.
 * Preserves full backward compatibility for all Machine views and forms.
 */
export const MachineGpsFormSection: React.FC<MachineGpsFormSectionProps> = ({
  latitude,
  longitude,
  locationSource,
  locationNote,
  onCoordinatesChange,
  onLocationNoteChange,
  machineTitle,
  buildingReferenceCoords
}) => {
  return (
    <GeoLocationFormSection
      latitude={latitude}
      longitude={longitude}
      locationSource={locationSource}
      locationNote={locationNote}
      onCoordinatesChange={onCoordinatesChange}
      onLocationNoteChange={onLocationNoteChange}
      entityType="machine"
      entityTitle={machineTitle}
      buildingReferenceCoords={buildingReferenceCoords}
    />
  );
};

export { GeoLocationFormSection };
