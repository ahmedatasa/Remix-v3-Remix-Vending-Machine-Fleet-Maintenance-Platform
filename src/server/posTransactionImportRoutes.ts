import express from 'express';
import crypto from 'crypto';

import {
  createRequireEnterpriseRole
} from './authSecurity';

import type {
  RuntimeStoreData
} from './runtimeStoreTypes';

import type {
  PosTransactionColumnMapping,
  PosTransactionPreviewResponse,
  PosTransactionPreviewRow,
  PosTransactionPreviewStatus
} from '../types/posTransaction';

interface PosTransactionImportRouteDeps {
  getStore: () => RuntimeStoreData;
}

const ADMIN_ROLES = [
  'SUPER_ADMIN',
  'ADMIN'
];

const MAX_PREVIEW_ROWS = 5000;

function nextPreviewId() {
  return (
    `pos-prev-${Date.now()}-` +
    crypto.randomBytes(4).toString('hex')
  );
}

function cleanString(value: any) {
  return String(
    value === undefined ||
    value === null
      ? ''
      : value
  ).trim();
}

function normalizeTerminalReference(
  value: any
) {
  return cleanString(value)
    .toUpperCase();
}

function normalizeTransactionReference(
  value: any
) {
  return cleanString(value);
}

function mappedValue(
  row: Record<string, unknown>,
  sourceColumn?: string
) {
  const column =
    cleanString(sourceColumn);

  if (!column) {
    return undefined;
  }

  return row[column];
}

function parseTimestamp(
  value: any
): string | null {
  const raw =
    cleanString(value);

  if (!raw) {
    return null;
  }

  const date =
    new Date(raw);

  const ms =
    date.getTime();

  if (!Number.isFinite(ms)) {
    return null;
  }

  return date.toISOString();
}

/*
 * Conservative generic amount parser.
 *
 * Supported before provider-specific profiles exist:
 *   12
 *   12.50
 *   -12.50
 *   1,234.50
 *   12,50
 *
 * Ambiguous/unrecognized formatting is rejected rather
 * than silently guessing.
 */
function parseAmount(
  value: any
): number | null {
  if (
    typeof value === 'number'
  ) {
    return Number.isFinite(value)
      ? value
      : null;
  }

  let raw =
    cleanString(value);

  if (!raw) {
    return null;
  }

  raw =
    raw.replace(/\s+/g, '');

  if (
    /^[+-]?\d+(?:\.\d+)?$/.test(raw)
  ) {
    const parsed =
      Number(raw);

    return Number.isFinite(parsed)
      ? parsed
      : null;
  }

  // Decimal comma, e.g. 12,50
  if (
    /^[+-]?\d+,\d{1,2}$/.test(raw)
  ) {
    const parsed =
      Number(
        raw.replace(',', '.')
      );

    return Number.isFinite(parsed)
      ? parsed
      : null;
  }

  // Thousands comma, optional decimal point.
  if (
    /^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/
      .test(raw)
  ) {
    const parsed =
      Number(
        raw.replace(/,/g, '')
      );

    return Number.isFinite(parsed)
      ? parsed
      : null;
  }

  return null;
}

function timestampMs(
  value: any
) {
  const ms =
    new Date(
      String(value || '')
    ).getTime();

  return Number.isFinite(ms)
    ? ms
    : Number.NaN;
}

function resolveTerminalAt(
  store: RuntimeStoreData,
  terminalReference: string,
  transactionAt: string
) {
  const normalizedReference =
    normalizeTerminalReference(
      terminalReference
    );

  const terminal =
    (store.posTerminals || [])
      .find(
        (row: any) =>
          normalizeTerminalReference(
            row.normalizedReference ||
            row.terminalReference
          ) === normalizedReference
      );

  if (!terminal) {
    return {
      status: 'UNREGISTERED_TERMINAL' as const
    };
  }

  const atMs =
    timestampMs(transactionAt);

  const matches =
    (store.posTerminalMappings || [])
      .filter(
        (mapping: any) => {
          if (
            mapping.terminalId !==
            terminal.id
          ) {
            return false;
          }

          const fromMs =
            timestampMs(
              mapping.effectiveFrom
            );

          const toMs =
            mapping.effectiveTo
              ? timestampMs(
                  mapping.effectiveTo
                )
              : Number.POSITIVE_INFINITY;

          return (
            Number.isFinite(fromMs) &&
            fromMs <= atMs &&
            atMs < toMs
          );
        }
      );

  if (
    matches.length > 1
  ) {
    return {
      status:
        'AMBIGUOUS' as const,
      terminal
    };
  }

  if (
    matches.length === 0
  ) {
    return {
      status:
        'UNMAPPED' as const,
      terminal
    };
  }

  const mapping =
    matches[0];

  const machine =
    (store.machines || [])
      .find(
        (row: any) =>
          row.id === mapping.machineId
      );

  return {
    status:
      'MAPPED' as const,

    terminal,
    mapping,
    machine
  };
}

function buildDuplicateKey(
  normalizedTerminalReference:
    string,
  transactionReference:
    string
) {
  return (
    normalizedTerminalReference +
    '::' +
    transactionReference
      .trim()
      .toUpperCase()
  );
}

function existingDuplicateKeys(
  store: RuntimeStoreData
) {
  const result =
    new Set<string>();

  for (
    const transaction
    of (store.posTransactions || [])
  ) {
    const stored =
      cleanString(
        transaction.duplicateKey
      );

    if (stored) {
      result.add(stored);
      continue;
    }

    const terminal =
      normalizeTerminalReference(
        transaction.terminalReference
      );

    const reference =
      normalizeTransactionReference(
        transaction.transactionReference
      );

    if (
      terminal &&
      reference
    ) {
      result.add(
        buildDuplicateKey(
          terminal,
          reference
        )
      );
    }
  }

  return result;
}

function detectedColumns(
  rows:
    Array<Record<string, unknown>>
) {
  const columns =
    new Set<string>();

  for (const row of rows) {
    for (
      const key
      of Object.keys(row || {})
    ) {
      columns.add(key);
    }
  }

  return Array.from(columns)
    .sort(
      (a, b) =>
        a.localeCompare(b)
    );
}

function validateMapping(
  value: any
):
  PosTransactionColumnMapping | null {
  if (
    !value ||
    typeof value !== 'object'
  ) {
    return null;
  }

  const mapping:
    PosTransactionColumnMapping = {
      transactionDateTime:
        cleanString(
          value.transactionDateTime
        ),

      terminalReference:
        cleanString(
          value.terminalReference
        ),

      transactionReference:
        cleanString(
          value.transactionReference
        ),

      amount:
        cleanString(
          value.amount
        ),

      currency:
        cleanString(
          value.currency
        ) || undefined,

      status:
        cleanString(
          value.status
        ) || undefined
    };

  if (
    !mapping.transactionDateTime ||
    !mapping.terminalReference ||
    !mapping.transactionReference ||
    !mapping.amount
  ) {
    return null;
  }

  return mapping;
}

function primaryStatus(
  conditions: {
    missing: boolean;
    invalidDate: boolean;
    invalidAmount: boolean;
    duplicate: boolean;
    terminalMapped: boolean;
  }
):
  PosTransactionPreviewStatus {
  if (conditions.missing) {
    return 'MISSING_REQUIRED_FIELD';
  }

  if (
    conditions.invalidDate
  ) {
    return 'INVALID_DATE';
  }

  if (
    conditions.invalidAmount
  ) {
    return 'INVALID_AMOUNT';
  }

  if (
    conditions.duplicate
  ) {
    return 'DUPLICATE';
  }

  if (
    !conditions.terminalMapped
  ) {
    return 'UNMAPPED_TERMINAL';
  }

  return 'VALID';
}

export function
createPosTransactionImportRouter(
  deps:
    PosTransactionImportRouteDeps
) {
  const router =
    express.Router();

  const requireAdmin =
    createRequireEnterpriseRole(
      ADMIN_ROLES
    );

  /*
   * Phase 6C-A:
   * Preview only.
   *
   * No batch is persisted.
   * No POS transaction is persisted.
   * No machine/terminal data is modified.
   */
  router.use(requireAdmin);

  router.post(
    '/preview',
    (req, res) => {
      const store =
        deps.getStore();

      const rows =
        req.body?.rows;

      if (
        !Array.isArray(rows) ||
        rows.length === 0
      ) {
        return res.status(400).json({
          error:
            'POS_IMPORT_ROWS_REQUIRED'
        });
      }

      if (
        rows.length >
        MAX_PREVIEW_ROWS
      ) {
        return res.status(413).json({
          error:
            'POS_IMPORT_PREVIEW_TOO_LARGE',

          maxRows:
            MAX_PREVIEW_ROWS
        });
      }

      if (
        rows.some(
          row =>
            !row ||
            typeof row !== 'object' ||
            Array.isArray(row)
        )
      ) {
        return res.status(400).json({
          error:
            'POS_IMPORT_ROW_INVALID'
        });
      }

      const columnMapping =
        validateMapping(
          req.body?.columnMapping
        );

      if (!columnMapping) {
        return res.status(400).json({
          error:
            'POS_IMPORT_COLUMN_MAPPING_INVALID',

          requiredMappings: [
            'transactionDateTime',
            'terminalReference',
            'transactionReference',
            'amount'
          ]
        });
      }

      const sourceFileName =
        cleanString(
          req.body?.sourceFileName
        ) || undefined;

      const requestedSourceType =
        cleanString(
          req.body?.sourceType
        ).toUpperCase();

      const sourceType =
        requestedSourceType === 'CSV' ||
        requestedSourceType === 'XLSX'
          ? requestedSourceType
          : 'UNKNOWN';

      const sheetName =
        cleanString(
          req.body?.sheetName
        ) || undefined;

      const existingKeys =
        existingDuplicateKeys(
          store
        );

      const previewSeenKeys =
        new Set<string>();

      const previewRows:
        PosTransactionPreviewRow[] = [];

      for (
        let index = 0;
        index < rows.length;
        index++
      ) {
        const sourceRow =
          rows[index] as
            Record<string, unknown>;

        const rawDate =
          mappedValue(
            sourceRow,
            columnMapping.transactionDateTime
          );

        const rawTerminal =
          mappedValue(
            sourceRow,
            columnMapping.terminalReference
          );

        const rawReference =
          mappedValue(
            sourceRow,
            columnMapping.transactionReference
          );

        const rawAmount =
          mappedValue(
            sourceRow,
            columnMapping.amount
          );

        const rawCurrency =
          mappedValue(
            sourceRow,
            columnMapping.currency
          );

        const rawStatus =
          mappedValue(
            sourceRow,
            columnMapping.status
          );

        const terminalReference =
          cleanString(
            rawTerminal
          );

        const normalizedTerminalReference =
          normalizeTerminalReference(
            rawTerminal
          );

        const transactionReference =
          normalizeTransactionReference(
            rawReference
          );

        const rawDateString =
          cleanString(rawDate);

        const rawAmountString =
          cleanString(rawAmount);

        const missingFields:
          string[] = [];

        if (!rawDateString) {
          missingFields.push(
            'transactionDateTime'
          );
        }

        if (
          !terminalReference
        ) {
          missingFields.push(
            'terminalReference'
          );
        }

        if (
          !transactionReference
        ) {
          missingFields.push(
            'transactionReference'
          );
        }

        if (
          !rawAmountString
        ) {
          missingFields.push(
            'amount'
          );
        }

        const transactionAt =
          rawDateString
            ? parseTimestamp(
                rawDate
              )
            : null;

        const amount =
          rawAmountString
            ? parseAmount(
                rawAmount
              )
            : null;

        const duplicateKey =
          normalizedTerminalReference &&
          transactionReference
            ? buildDuplicateKey(
                normalizedTerminalReference,
                transactionReference
              )
            : '';

        const duplicate =
          !!duplicateKey &&
          (
            existingKeys.has(
              duplicateKey
            ) ||
            previewSeenKeys.has(
              duplicateKey
            )
          );

        if (
          duplicateKey &&
          !previewSeenKeys.has(
            duplicateKey
          )
        ) {
          previewSeenKeys.add(
            duplicateKey
          );
        }

        const resolution =
          (
            transactionAt &&
            normalizedTerminalReference
          )
            ? resolveTerminalAt(
                store,
                normalizedTerminalReference,
                transactionAt
              )
            : null;

        const terminalMapped =
          resolution?.status ===
          'MAPPED';

        const status =
          primaryStatus({
            missing:
              missingFields.length > 0,

            invalidDate:
              !!rawDateString &&
              !transactionAt,

            invalidAmount:
              !!rawAmountString &&
              amount === null,

            duplicate,

            terminalMapped
          });

        const errors:
          string[] = [];

        if (
          missingFields.length
        ) {
          errors.push(
            `MISSING:${missingFields.join(',')}`
          );
        }

        if (
          rawDateString &&
          !transactionAt
        ) {
          errors.push(
            'INVALID_DATE'
          );
        }

        if (
          rawAmountString &&
          amount === null
        ) {
          errors.push(
            'INVALID_AMOUNT'
          );
        }

        if (duplicate) {
          errors.push(
            'DUPLICATE'
          );
        }

        if (
          resolution &&
          resolution.status !==
          'MAPPED'
        ) {
          errors.push(
            `TERMINAL_${resolution.status}`
          );
        }

        const previewRow:
          PosTransactionPreviewRow = {
            rowNumber:
              index + 1,

            previewStatus:
              status,

            errors,

            sourceValues: {
              transactionDateTime:
                rawDate,

              terminalReference:
                rawTerminal,

              transactionReference:
                rawReference,

              amount:
                rawAmount,

              currency:
                rawCurrency,

              status:
                rawStatus
            },

            normalized: {
              transactionAt:
                transactionAt ||
                undefined,

              terminalReference:
                terminalReference ||
                undefined,

              normalizedTerminalReference:
                normalizedTerminalReference ||
                undefined,

              transactionReference:
                transactionReference ||
                undefined,

              amount:
                amount === null
                  ? undefined
                  : amount,

              currency:
                cleanString(
                  rawCurrency
                ).toUpperCase() ||
                undefined,

              transactionStatus:
                cleanString(
                  rawStatus
                ).toUpperCase() ||
                undefined,

              duplicateKey:
                duplicateKey ||
                undefined
            },

            terminalResolutionStatus:
              resolution?.status,

            terminalId:
              resolution &&
              'terminal' in resolution
                ? resolution.terminal?.id
                : undefined,

            machineId:
              resolution?.status ===
                'MAPPED'
                ? resolution.mapping
                    ?.machineId
                : undefined,

            machineNumber:
              resolution?.status ===
                'MAPPED'
                ? resolution.machine
                    ?.machineNumber
                : undefined,

            terminal:
              resolution &&
              'terminal' in resolution
                ? resolution.terminal
                : undefined,

            machine:
              resolution?.status ===
                'MAPPED'
                ? resolution.machine
                : undefined
          };

        previewRows.push(
          previewRow
        );
      }

      const count =
        (
          status:
            PosTransactionPreviewStatus
        ) =>
          previewRows.filter(
            row =>
              row.previewStatus ===
              status
          ).length;

      const response:
        PosTransactionPreviewResponse = {
          batch: {
            id:
              nextPreviewId(),

            status:
              'PREVIEW',

            sourceFileName,
            sourceType,
            sheetName,

            detectedColumns:
              detectedColumns(rows),

            columnMapping,

            rowCount:
              previewRows.length,

            createdAt:
              new Date()
                .toISOString(),

            persisted:
              false
          },

          summary: {
            totalRows:
              previewRows.length,

            validCount:
              count('VALID'),

            unmappedTerminalCount:
              count(
                'UNMAPPED_TERMINAL'
              ),

            duplicateCount:
              count('DUPLICATE'),

            invalidDateCount:
              count('INVALID_DATE'),

            invalidAmountCount:
              count('INVALID_AMOUNT'),

            missingRequiredFieldCount:
              count(
                'MISSING_REQUIRED_FIELD'
              )
          },

          rows:
            previewRows
        };

      return res.json(
        response
      );
    }
  );

  return router;
}
