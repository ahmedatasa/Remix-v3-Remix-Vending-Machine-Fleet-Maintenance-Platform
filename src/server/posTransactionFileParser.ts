import * as XLSX from 'xlsx';

import type {
  PosParsedFileColumn,
  PosParsedFileResponse
} from '../types/posTransaction';

export const MAX_POS_IMPORT_FILE_ROWS =
  5000;

export class PosTransactionFileParseError
  extends Error {
  constructor(
    public readonly code: string,
    public readonly httpStatus = 400,
    public readonly details?:
      Record<string, unknown>
  ) {
    super(code);
    this.name =
      'PosTransactionFileParseError';
  }
}

function cleanString(
  value: unknown
) {
  return String(
    value === undefined ||
    value === null
      ? ''
      : value
  ).trim();
}

function sourceTypeFromFileName(
  fileName: string
): 'CSV' | 'XLSX' {
  const normalized =
    fileName
      .trim()
      .toLowerCase();

  if (
    normalized.endsWith('.csv')
  ) {
    return 'CSV';
  }

  if (
    normalized.endsWith('.xlsx')
  ) {
    return 'XLSX';
  }

  throw new PosTransactionFileParseError(
    'POS_IMPORT_FILE_TYPE_UNSUPPORTED',
    415,
    {
      supportedExtensions: [
        '.csv',
        '.xlsx'
      ]
    }
  );
}

function cellIsEmpty(
  value: unknown
) {
  return cleanString(value) === '';
}

function rowHasData(
  row: unknown[]
) {
  return row.some(
    value =>
      !cellIsEmpty(value)
  );
}

function safeCellValue(
  value: unknown
): unknown {
  if (
    value === null ||
    value === undefined
  ) {
    return '';
  }

  if (
    value instanceof Date
  ) {
    const ms =
      value.getTime();

    return Number.isFinite(ms)
      ? value.toISOString()
      : '';
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  return String(value);
}

function autoDetectHeaderIndex(
  matrix: unknown[][]
) {
  const inspectCount =
    Math.min(
      matrix.length,
      25
    );

  let bestIndex = -1;
  let bestCount = 0;

  for (
    let index = 0;
    index < inspectCount;
    index++
  ) {
    const row =
      matrix[index] || [];

    const nonEmptyCount =
      row.filter(
        value =>
          !cellIsEmpty(value)
      ).length;

    /*
     * Highest populated row wins.
     * In a tie the earliest row wins.
     * This handles exports that contain one or more
     * report-title rows before the actual header.
     */
    if (
      nonEmptyCount >
      bestCount
    ) {
      bestCount =
        nonEmptyCount;

      bestIndex =
        index;
    }
  }

  if (
    bestIndex < 0 ||
    bestCount === 0
  ) {
    throw new PosTransactionFileParseError(
      'POS_IMPORT_HEADER_NOT_FOUND'
    );
  }

  return bestIndex;
}

function makeUniqueColumns(
  headerRow: unknown[],
  columnCount: number
): PosParsedFileColumn[] {
  const used =
    new Set<string>();

  const result:
    PosParsedFileColumn[] = [];

  for (
    let index = 0;
    index < columnCount;
    index++
  ) {
    const originalHeader =
      cleanString(
        headerRow[index]
      );

    const base =
      originalHeader ||
      `Column ${index + 1}`;

    let key =
      base;

    let suffix = 2;

    while (
      used.has(
        key.toLowerCase()
      )
    ) {
      key =
        `${base} [${suffix}]`;

      suffix++;
    }

    used.add(
      key.toLowerCase()
    );

    result.push({
      key,
      originalHeader,
      columnIndex:
        index + 1
    });
  }

  return result;
}

export function parsePosTransactionFile(
  fileName: string,
  content: Buffer,
  options?: {
    sheetName?: string;
    headerRow?: number;
  }
): PosParsedFileResponse {
  const sourceFileName =
    cleanString(fileName);

  if (!sourceFileName) {
    throw new PosTransactionFileParseError(
      'POS_IMPORT_FILE_NAME_REQUIRED'
    );
  }

  if (
    !Buffer.isBuffer(content) ||
    content.length === 0
  ) {
    throw new PosTransactionFileParseError(
      'POS_IMPORT_FILE_BODY_REQUIRED'
    );
  }

  const sourceType =
    sourceTypeFromFileName(
      sourceFileName
    );

  let workbook:
    XLSX.WorkBook;

  try {
    if (
      sourceType === 'CSV'
    ) {
      /*
       * CSV is textual data.
       * Decode the uploaded bytes explicitly as UTF-8
       * before handing them to SheetJS. Passing UTF-8
       * CSV bytes as a generic binary buffer can turn
       * Arabic headers into mojibake.
       */
      const csvText =
        content
          .toString('utf8')
          .replace(/^\uFEFF/, '');

      workbook =
        XLSX.read(
          csvText,
          {
            type: 'string',
            cellDates: true,
            cellNF: false,
            cellHTML: false,
            bookVBA: false
          }
        );
    } else {
      workbook =
        XLSX.read(
          content,
          {
            type: 'buffer',
            cellDates: true,
            cellNF: false,
            cellHTML: false,
            bookVBA: false
          }
        );
    }
  } catch {
    throw new PosTransactionFileParseError(
      'POS_IMPORT_FILE_PARSE_FAILED'
    );
  }

  const sheetNames =
    Array.isArray(
      workbook.SheetNames
    )
      ? [...workbook.SheetNames]
      : [];

  if (
    sheetNames.length === 0
  ) {
    throw new PosTransactionFileParseError(
      'POS_IMPORT_FILE_HAS_NO_SHEETS'
    );
  }

  const requestedSheet =
    cleanString(
      options?.sheetName
    );

  const selectedSheet =
    requestedSheet ||
    sheetNames[0];

  if (
    !sheetNames.includes(
      selectedSheet
    )
  ) {
    throw new PosTransactionFileParseError(
      'POS_IMPORT_SHEET_NOT_FOUND',
      400,
      {
        requestedSheet:
          selectedSheet,

        sheetNames
      }
    );
  }

  const worksheet =
    workbook.Sheets[
      selectedSheet
    ];

  if (
    !worksheet ||
    !worksheet['!ref']
  ) {
    throw new PosTransactionFileParseError(
      'POS_IMPORT_SHEET_EMPTY'
    );
  }

  const range =
    XLSX.utils.decode_range(
      worksheet['!ref']
    );

  const physicalStartRow =
    range.s.r + 1;

  const matrix =
    XLSX.utils.sheet_to_json<
      unknown[]
    >(
      worksheet,
      {
        header: 1,
        defval: null,
        raw: true,
        blankrows: true
      }
    );

  if (
    matrix.length === 0
  ) {
    throw new PosTransactionFileParseError(
      'POS_IMPORT_SHEET_EMPTY'
    );
  }

  let headerIndex:
    number;

  if (
    options?.headerRow !== undefined
  ) {
    const requestedHeaderRow =
      Number(
        options.headerRow
      );

    if (
      !Number.isInteger(
        requestedHeaderRow
      ) ||
      requestedHeaderRow < 1
    ) {
      throw new PosTransactionFileParseError(
        'POS_IMPORT_HEADER_ROW_INVALID'
      );
    }

    headerIndex =
      requestedHeaderRow -
      physicalStartRow;

    if (
      headerIndex < 0 ||
      headerIndex >=
        matrix.length
    ) {
      throw new PosTransactionFileParseError(
        'POS_IMPORT_HEADER_ROW_OUT_OF_RANGE',
        400,
        {
          requestedHeaderRow,
          physicalStartRow,
          physicalEndRow:
            range.e.r + 1
        }
      );
    }
  } else {
    headerIndex =
      autoDetectHeaderIndex(
        matrix
      );
  }

  const rawHeader =
    matrix[headerIndex] || [];

  if (
    !rowHasData(rawHeader)
  ) {
    throw new PosTransactionFileParseError(
      'POS_IMPORT_HEADER_NOT_FOUND'
    );
  }

  const dataMatrix =
    matrix
      .slice(
        headerIndex + 1
      )
      .filter(
        row =>
          rowHasData(row)
      );

  if (
    dataMatrix.length >
    MAX_POS_IMPORT_FILE_ROWS
  ) {
    throw new PosTransactionFileParseError(
      'POS_IMPORT_FILE_TOO_MANY_ROWS',
      413,
      {
        maxRows:
          MAX_POS_IMPORT_FILE_ROWS,

        actualRows:
          dataMatrix.length
      }
    );
  }

  const columnCount =
    Math.max(
      rawHeader.length,
      ...dataMatrix.map(
        row =>
          row.length
      ),
      0
    );

  if (
    columnCount === 0
  ) {
    throw new PosTransactionFileParseError(
      'POS_IMPORT_HEADER_NOT_FOUND'
    );
  }

  const detectedColumns =
    makeUniqueColumns(
      rawHeader,
      columnCount
    );

  const rows =
    dataMatrix.map(
      sourceRow => {
        const row:
          Record<
            string,
            unknown
          > = {};

        for (
          let index = 0;
          index <
          detectedColumns.length;
          index++
        ) {
          row[
            detectedColumns[
              index
            ].key
          ] =
            safeCellValue(
              sourceRow[index]
            );
        }

        return row;
      }
    );

  return {
    sourceFileName,
    sourceType,

    fileSizeBytes:
      content.length,

    sheetNames,
    selectedSheet,

    headerRow:
      physicalStartRow +
      headerIndex,

    detectedColumns,

    rowCount:
      rows.length,

    rows,

    persisted:
      false
  };
}
