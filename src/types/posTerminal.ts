import type { Machine } from './database';

export interface PosTerminal {
  id: string;
  terminalReference: string;
  normalizedReference: string;
  displayName: string;
  providerName?: string;
  notes?: string;
  isActive: boolean;

  createdAt: string;
  updatedAt: string;

  createdById?: string;
  createdByName?: string;
  updatedById?: string;
  updatedByName?: string;

  currentMapping?: PosTerminalMapping | null;
}

export interface PosTerminalMapping {
  id: string;
  terminalId: string;
  machineId: string;

  // Half-open interval:
  // effectiveFrom <= transaction time < effectiveTo.
  effectiveFrom: string;
  effectiveTo?: string | null;

  notes?: string;

  createdAt: string;
  updatedAt: string;

  createdById?: string;
  createdByName?: string;
  closedById?: string;
  closedByName?: string;

  machine?: Machine;
  terminal?: PosTerminal;
}

export interface PosTerminalCreateInput {
  terminalReference: string;
  displayName?: string;
  providerName?: string;
  notes?: string;
}

export interface PosTerminalUpdateInput {
  displayName?: string;
  providerName?: string;
  notes?: string;
  isActive?: boolean;
}

export interface PosTerminalAssignInput {
  machineId: string;
  effectiveFrom?: string;
  notes?: string;
}

export interface PosTerminalUnassignInput {
  effectiveTo?: string;
  notes?: string;
}

export interface PosTerminalSummary {
  totalTerminals: number;
  activeTerminals: number;
  inactiveTerminals: number;
  mappedNow: number;
  unmappedNow: number;
  mappingHistoryCount: number;
}

export type PosTerminalResolutionStatus =
  | 'MAPPED'
  | 'UNMAPPED'
  | 'UNREGISTERED_TERMINAL'
  | 'AMBIGUOUS';

export interface PosTerminalResolution {
  status: PosTerminalResolutionStatus;
  terminalReference: string;
  resolvedAt: string;
  terminal?: PosTerminal;
  mapping?: PosTerminalMapping;
  machine?: Machine;
}
