import readXlsxFile from 'read-excel-file/universal';
import writeXlsxFile, { type Row as WriteRow, type Sheet as WriteSheet } from 'write-excel-file/node';
import { SheetData, TableCellValue, TableDocumentData } from '../types';

export class ExcelParser {
  /**
   * Parses an Excel (.xlsx) buffer into TableDocumentData with all sheets.
   */
  public static async parse(data: Uint8Array, fileName: string): Promise<TableDocumentData> {
    const arrayBuffer = data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength
    ) as ArrayBuffer;

    const parsedSheets = await readXlsxFile(arrayBuffer);

    const sheetNames: string[] = [];
    const sheets: { [name: string]: SheetData } = {};

    for (const item of parsedSheets) {
      const name = item.sheet;
      sheetNames.push(name);

      // Filter out completely empty rows (simulating blankrows: false)
      const rawRows = (item.data || []).filter(row =>
        Array.isArray(row) && row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '')
      );

      let maxCols = 0;
      for (const r of rawRows) {
        if (Array.isArray(r) && r.length > maxCols) {
          maxCols = r.length;
        }
      }

      if (maxCols === 0) {
        maxCols = 1;
      }

      const headers: string[] = [];
      const rows: TableCellValue[][] = [];

      if (rawRows.length === 0) {
        headers.push('Column 1');
      } else {
        const firstRow = rawRows[0] || [];
        for (let i = 0; i < maxCols; i++) {
          const val = firstRow[i] !== undefined && firstRow[i] !== null ? String(firstRow[i]).trim() : '';
          headers.push(val.length > 0 ? val : `Column ${i + 1}`);
        }

        for (let r = 1; r < rawRows.length; r++) {
          const row = rawRows[r] || [];
          const normalizedRow: TableCellValue[] = [];
          for (let c = 0; c < maxCols; c++) {
            const cell = row[c];
            if (cell instanceof Date) {
              normalizedRow.push(cell.toISOString().split('T')[0]);
            } else if (cell !== undefined && cell !== null) {
              normalizedRow.push(cell as TableCellValue);
            } else {
              normalizedRow.push('');
            }
          }
          rows.push(normalizedRow);
        }
      }

      sheets[name] = {
        headers,
        rows,
        totalRows: rows.length,
        totalColumns: headers.length
      };
    }

    const activeSheet = sheetNames.length > 0 ? sheetNames[0] : 'Sheet1';
    if (!sheets[activeSheet]) {
      sheets[activeSheet] = {
        headers: ['Column 1'],
        rows: [],
        totalRows: 0,
        totalColumns: 1
      };
    }

    return {
      sheets,
      activeSheet,
      sheetNames: sheetNames.length > 0 ? sheetNames : [activeSheet],
      format: 'excel',
      fileName
    };
  }

  /**
   * Serializes all sheets back into an Excel (.xlsx) binary Uint8Array
   */
  public static async serialize(
    sheets: { [sheetName: string]: SheetData },
    _activeSheetName?: string
  ): Promise<Uint8Array> {
    const names = Object.keys(sheets);
    const writeSheets: WriteSheet<Buffer>[] = [];

    for (const name of names) {
      const sheetData = sheets[name];

      const headerRow: WriteRow = sheetData.headers.map(h => ({
        value: String(h ?? ''),
        type: String,
        fontWeight: 'bold'
      }));

      const dataRows: WriteRow[] = sheetData.rows.map(row =>
        sheetData.headers.map((_, colIdx) => {
          const cell = row[colIdx];
          if (cell === null || cell === undefined || cell === '') {
            return null;
          }
          if (typeof cell === 'number') {
            return { value: cell, type: Number };
          }
          if (typeof cell === 'boolean') {
            return { value: cell, type: Boolean };
          }
          return { value: String(cell), type: String };
        })
      );

      // Auto-fit column widths approximately
      const columns = sheetData.headers.map((h, colIdx) => {
        let maxLen = String(h).length;
        const sampleLimit = Math.min(sheetData.rows.length, 50);
        for (let r = 0; r < sampleLimit; r++) {
          const val = sheetData.rows[r]?.[colIdx];
          const len = val !== null && val !== undefined ? String(val).length : 0;
          if (len > maxLen) {
            maxLen = len;
          }
        }
        return { width: Math.min(Math.max(maxLen + 3, 10), 50) };
      });

      writeSheets.push({
        sheet: name.slice(0, 31), // Excel max sheet name is 31 chars
        data: [headerRow, ...dataRows],
        columns
      });
    }

    const buffer = await writeXlsxFile(writeSheets).toBuffer();
    return new Uint8Array(buffer);
  }
}
