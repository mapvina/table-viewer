import * as XLSX from 'xlsx';
import { SheetData, TableCellValue, TableDocumentData } from '../types';

export class ExcelParser {
  /**
   * Parses an Excel buffer into TableDocumentData with all sheets.
   */
  public static parse(data: Uint8Array, fileName: string): TableDocumentData {
    const workbook = XLSX.read(data, {
      type: 'array',
      cellDates: true,
      dense: false
    });

    const sheetNames = workbook.SheetNames || [];
    const sheets: { [name: string]: SheetData } = {};

    for (const name of sheetNames) {
      const worksheet = workbook.Sheets[name];
      if (!worksheet) {
        continue;
      }

      // Convert sheet to array of arrays
      const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: '',
        blankrows: false
      });

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
              normalizedRow.push(cell);
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
   * Serializes all sheets or active sheet back into an Excel binary Uint8Array
   */
  public static serialize(sheets: { [sheetName: string]: SheetData }, activeSheetName?: string): Uint8Array {
    const workbook = XLSX.utils.book_new();

    const names = Object.keys(sheets);
    for (const name of names) {
      const sheetData = sheets[name];
      const aoa: any[][] = [sheetData.headers, ...sheetData.rows];
      const worksheet = XLSX.utils.aoa_to_sheet(aoa);

      // Auto-fit column widths approximately
      const colWidths = sheetData.headers.map((h, colIdx) => {
        let maxLen = String(h).length;
        const sampleLimit = Math.min(sheetData.rows.length, 50);
        for (let r = 0; r < sampleLimit; r++) {
          const val = sheetData.rows[r][colIdx];
          const len = val !== null && val !== undefined ? String(val).length : 0;
          if (len > maxLen) {
            maxLen = len;
          }
        }
        return { wch: Math.min(Math.max(maxLen + 3, 10), 50) };
      });
      worksheet['!cols'] = colWidths;

      XLSX.utils.book_append_sheet(workbook, worksheet, name.slice(0, 31)); // Excel max sheet name is 31 chars
    }

    const buffer = XLSX.write(workbook, {
      bookType: 'xlsx',
      type: 'buffer'
    });

    return new Uint8Array(buffer);
  }
}
