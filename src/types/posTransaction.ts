import type { Machine } from './database';
import type {
  PosTerminal,
  PosTerminalResolutionStatus
} from './posTerminal';

export type PosTransactionPreviewStatus =
  | 'VALID'
  | 'UNMAPPED_TERMINAL'
  | 'DUPLICATE'
  | 'INVALID_DATE'
  | 'INVALID_AMOUNT'
  | 'MISSING_REQUIRED_FIELD';

export type PosImportSourceType =
  | 'CSV'
  | 'XLSX'
  | 'UNKNOWN';

export interface PosTransactionColumnMapping {
  transactionDateTime: string;
  terminalReference: string;
  transactionReference: string;
  amount: string;

  currency?: string;
  status?: string;
}

export interface PosTransactionPreviewRequest {
  sourceFileName?: string;
  sourceType?: PosImportSourceType;
  sheetName?: string;

  columnMapping:
    PosTransactionColumnMapping;

  rows: Array<Record<string, unknown>>;
}

export interface PosTransactionPreviewNormalized {
  transactionAt?: string;

  terminalReference?: string;
  normalizedTerminalReference?: string;

  transactionReference?: string;

  amount?: number;

  currency?: string;
  transactionStatus?: string;

  duplicateKey?: string;
}

export interface PosTransactionPreviewRow {
  rowNumber: number;

  previewStatus:
    PosTransactionPreviewStatus;

  errors: string[];

  sourceValues: {
    transactionDateTime?: unknown;
    terminalReference?: unknown;
    transactionReference?: unknown;
    amount?: unknown;
    currency?: unknown;
    status?: unknown;
  };

  normalized:
    PosTransactionPreviewNormalized;

  terminalResolutionStatus?:
    PosTerminalResolutionStatus;

  terminalId?: string;

  machineId?: string;
  machineNumber?: string;

  terminal?: PosTerminal;
  machine?: Machine;
}

export interface PosTransactionPreviewSummary {
  totalRows: number;

  validCount: number;
  unmappedTerminalCount: number;
  duplicateCount: number;
  invalidDateCount: number;
  invalidAmountCount: number;
  missingRequiredFieldCount: number;
}

export interface PosImportPreviewBatch {
  id: string;

  status: 'PREVIEW';

  sourceFileName?: string;
  sourceType: PosImportSourceType;
  sheetName?: string;

  detectedColumns: string[];

  columnMapping:
    PosTransactionColumnMapping;

  rowCount: number;

  createdAt: string;

  // Preview is intentionally never persisted.
  persisted: false;
}

export interface PosTransactionPreviewResponse {
  batch: PosImportPreviewBatch;

  summary:
    PosTransactionPreviewSummary;

  rows:
    PosTransactionPreviewRow[];
}
