import { SheetData, TableCellValue } from '../types';
import { CsvParser } from './csvParser';
import { ExcelParser } from './excelParser';

export class TableExporter {
  public static toCsv(data: SheetData, delimiter = ','): string {
    return CsvParser.serialize(data, delimiter, true);
  }

  public static toTsv(data: SheetData): string {
    return CsvParser.serialize(data, '\t', true);
  }

  public static toJson(data: SheetData): string {
    const list: Record<string, TableCellValue>[] = [];
    for (const row of data.rows) {
      const obj: Record<string, TableCellValue> = {};
      for (let i = 0; i < data.headers.length; i++) {
        const header = data.headers[i] || `Col${i + 1}`;
        obj[header] = row[i] !== undefined ? row[i] : null;
      }
      list.push(obj);
    }
    return JSON.stringify(list, null, 2);
  }

  public static toMarkdown(data: SheetData): string {
    if (data.headers.length === 0) return '';
    const headers = data.headers.map(h => String(h).replace(/\|/g, '\\|'));
    const divider = headers.map(() => '---');

    const lines: string[] = [];
    lines.push(`| ${headers.join(' | ')} |`);
    lines.push(`| ${divider.join(' | ')} |`);

    for (const row of data.rows) {
      const formatted = data.headers.map((_, i) => {
        const cell = row[i];
        const val = cell !== undefined && cell !== null ? String(cell) : '';
        return val.replace(/\|/g, '\\|').replace(/\n/g, '<br/>');
      });
      lines.push(`| ${formatted.join(' | ')} |`);
    }

    return lines.join('\n');
  }

  public static toHtml(data: SheetData): string {
    const headerHtml = data.headers.map(h => `<th>${escapeHtml(String(h))}</th>`).join('');
    const rowsHtml = data.rows.map(row => {
      const cols = data.headers.map((_, i) => {
        const val = row[i] !== undefined && row[i] !== null ? String(row[i]) : '';
        return `<td>${escapeHtml(val)}</td>`;
      }).join('');
      return `<tr>${cols}</tr>`;
    }).join('\n');

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  table { border-collapse: collapse; width: 100%; font-family: sans-serif; font-size: 13px; }
  th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; }
  th { background-color: #f2f2f2; font-weight: 600; }
  tr:nth-child(even) { background-color: #f9f9f9; }
</style>
</head>
<body>
<table>
<thead><tr>${headerHtml}</tr></thead>
<tbody>
${rowsHtml}
</tbody>
</table>
</body>
</html>`;
  }

  public static toExcel(sheetName: string, data: SheetData): Uint8Array {
    return ExcelParser.serialize({ [sheetName || 'Sheet1']: data }, sheetName);
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
