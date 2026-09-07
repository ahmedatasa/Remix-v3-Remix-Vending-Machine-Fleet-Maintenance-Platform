import React from 'react';
import { GeoLocationMapPicker, GeoLocationMapPickerProps } from './GeoLocationMapPicker';

export type MachineLocationPickerProps = GeoLocationMapPickerProps;

/**
 * MachineLocationPicker - Reusable Leaflet map picker specialized for machines.
 * Delegates to the unified GeoLocationMapPicker component.
 */
export const MachineLocationPicker: React.FC<MachineLocationPickerProps> = (props) => {
  return <GeoLocationMapPicker {...props} entityType={props.entityType || 'machine'} />;
};

export { GeoLocationMapPicker };
