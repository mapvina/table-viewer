import Papa from 'papaparse';
import { SheetData, TableCellValue, TableDocumentData } from '../types';

export interface CsvParseOptions {
  delimiter?: string;
  hasHeader?: boolean;
  autoDetectDelimiter?: boolean;
}

export class CsvParser {
  /**
   * Cleans UTF-8 Byte Order Mark (BOM) if present.
   */
  public static stripBOM(content: string): string {
    if (content.charCodeAt(0) === 0xFEFF) {
      return content.slice(1);
    }
    return content;
  }

  /**
   * Detects delimiter from raw content snippet.
   */
  public static detectDelimiter(content: string): string {
    const sample = content.slice(0, 4096);
    const delimiters = [',', ';', '\t', '|'];
    let bestDelimiter = ',';
    let maxConsistency = -1;

    for (const d of delimiters) {
      try {
        const result = Papa.parse(sample, {
          delimiter: d,
          preview: 10,
          skipEmptyLines: true
        });

        if (result.data && result.data.length > 1) {
          const lengths = (result.data as any[]).map(r => (Array.isArray(r) ? r.length : 0));
          const allSame = lengths.every(l => l > 1 && l === lengths[0]);
          if (allSame && lengths[0] > maxConsistency) {
            maxConsistency = lengths[0];
            bestDelimiter = d;
          }
        }
      } catch {
        // Continue fallback
      }
    }

    return bestDelimiter;
  }

  /**
   * Parses CSV or TSV text into a structured TableDocumentData
   */
  public static parse(rawContent: string, fileName: string, options: CsvParseOptions = {}): TableDocumentData {
    const cleanedContent = this.stripBOM(rawContent);
    const isTsv = fileName.toLowerCase().endsWith('.tsv') || fileName.toLowerCase().endsWith('.tab');
    
    let delimiter = options.delimiter;
    if (!delimiter) {
      if (isTsv) {
        delimiter = '\t';
      } else if (options.autoDetectDelimiter !== false) {
        delimiter = this.detectDelimiter(cleanedContent);
      } else {
        delimiter = ',';
      }
    }

    const parsed = Papa.parse<string[]>(cleanedContent, {
      delimiter: delimiter,
      skipEmptyLines: false,
      dynamicTyping: false // keep raw strings for exact user fidelity
    });

    const rawRows = (parsed.data || []) as string[][];

    // Find maximum column length
    let maxCols = 0;
    for (const r of rawRows) {
      if (Array.isArray(r) && r.length > maxCols) {
        maxCols = r.length;
      }
    }

    if (maxCols === 0) {
      maxCols = 1;
    }

    let headers: string[] = [];
    let rows: TableCellValue[][] = [];

    const hasHeader = options.hasHeader ?? true;

    if (rawRows.length === 0) {
      headers = ['Column 1'];
      rows = [];
    } else if (hasHeader && rawRows.length >= 1) {
      const firstRow = rawRows[0] || [];
      for (let i = 0; i < maxCols; i++) {
        const val = firstRow[i] !== undefined && firstRow[i] !== null ? String(firstRow[i]).trim() : '';
        headers.push(val.length > 0 ? val : `Column ${i + 1}`);
      }

      for (let r = 1; r < rawRows.length; r++) {
        const row = rawRows[r];
        // Skip trailing completely empty row from ending newline
        if (r === rawRows.length - 1 && row.length <= 1 && (row[0] === '' || row[0] === undefined)) {
          continue;
        }
        const normalizedRow: TableCellValue[] = [];
        for (let c = 0; c < maxCols; c++) {
          normalizedRow.push(row[c] !== undefined ? row[c] : '');
        }
        rows.push(normalizedRow);
      }
    } else {
      for (let i = 0; i < maxCols; i++) {
        headers.push(`Column ${i + 1}`);
      }
      for (const row of rawRows) {
        const normalizedRow: TableCellValue[] = [];
        for (let c = 0; c < maxCols; c++) {
          normalizedRow.push(row[c] !== undefined ? row[c] : '');
        }
        rows.push(normalizedRow);
      }
    }

    const sheetName = 'Sheet1';
    const sheetData: SheetData = {
      headers,
      rows,
      totalRows: rows.length,
      totalColumns: headers.length
    };

    return {
      sheets: { [sheetName]: sheetData },
      activeSheet: sheetName,
      sheetNames: [sheetName],
      delimiter,
      format: isTsv ? 'tsv' : 'csv',
      fileName
    };
  }

  /**
   * Serializes headers and rows back to CSV text.
   */
  public static serialize(sheetData: SheetData, delimiter: string = ',', includeHeader: boolean = true): string {
    const allData: any[] = [];
    if (includeHeader) {
      allData.push(sheetData.headers);
    }
    for (const row of sheetData.rows) {
      allData.push(row.map(cell => (cell === null || cell === undefined ? '' : String(cell))));
    }

    return Papa.unparse(allData, {
      delimiter: delimiter,
      newline: '\n',
      quotes: false,
      quoteChar: '"',
      escapeChar: '"'
    });
  }
}
