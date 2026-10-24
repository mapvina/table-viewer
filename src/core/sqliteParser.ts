import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import * as path from 'path';
import * as fs from 'fs';
import { SheetData, TableCellValue, TableDocumentData } from '../types';

export class SqliteParser {
  private static sqlInstance: SqlJsStatic | null = null;

  public static async getSql(wasmDir?: string): Promise<SqlJsStatic> {
    if (!this.sqlInstance) {
      this.sqlInstance = await initSqlJs({
        locateFile: (file: string) => {
          if (wasmDir && fs.existsSync(path.join(wasmDir, file))) {
            return path.join(wasmDir, file);
          }
          const currentDirFile = path.join(__dirname, file);
          if (fs.existsSync(currentDirFile)) {
            return currentDirFile;
          }
          const nodeModulesDist = path.resolve(__dirname, '../node_modules/sql.js/dist', file);
          if (fs.existsSync(nodeModulesDist)) {
            return nodeModulesDist;
          }
          const rootDist = path.resolve(__dirname, '../dist', file);
          if (fs.existsSync(rootDist)) {
            return rootDist;
          }
          return file;
        }
      });
    }
    return this.sqlInstance;
  }

  /**
   * Parses an SQLite database file into TableDocumentData.
   */
  public static async parse(
    data: Uint8Array,
    fileName: string,
    wasmDir?: string,
    rowLimit: number = 5000
  ): Promise<TableDocumentData> {
    const SQL = await this.getSql(wasmDir);
    const db: Database = new SQL.Database(data);

    const sheets: { [tableName: string]: SheetData } = {};
    const sheetNames: string[] = [];

    try {
      // Get all tables and views
      const tableQuery = db.exec(`
        SELECT name, type FROM sqlite_master 
        WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' 
        ORDER BY type DESC, name ASC;
      `);

      if (tableQuery.length > 0 && tableQuery[0].values) {
        for (const row of tableQuery[0].values) {
          const tableName = String(row[0]);
          sheetNames.push(tableName);

          // Get total row count
          let totalCount = 0;
          try {
            const countRes = db.exec(`SELECT COUNT(*) FROM "${tableName}";`);
            if (countRes.length > 0 && countRes[0].values.length > 0) {
              totalCount = Number(countRes[0].values[0][0]) || 0;
            }
          } catch {
            totalCount = 0;
          }

          // Query table rows up to rowLimit
          let headers: string[] = [];
          const rows: TableCellValue[][] = [];

          try {
            const dataRes = db.exec(`SELECT * FROM "${tableName}" LIMIT ${rowLimit};`);
            if (dataRes.length > 0) {
              headers = dataRes[0].columns || [];
              const rawValues = dataRes[0].values || [];

              for (const r of rawValues) {
                const normalizedRow: TableCellValue[] = [];
                for (let c = 0; c < headers.length; c++) {
                  const cell = r[c];
                  if (cell === null || cell === undefined) {
                    normalizedRow.push('');
                  } else if (cell instanceof Uint8Array) {
                    // BLOB representation
                    normalizedRow.push(`[BLOB ${cell.length} bytes]`);
                  } else {
                    normalizedRow.push(cell as TableCellValue);
                  }
                }
                rows.push(normalizedRow);
              }
            } else {
              // Table is empty, retrieve columns from table_info
              const infoRes = db.exec(`PRAGMA table_info("${tableName}");`);
              if (infoRes.length > 0 && infoRes[0].values) {
                headers = infoRes[0].values.map(col => String(col[1]));
              }
            }
          } catch {
            headers = ['Column 1'];
          }

          if (headers.length === 0) {
            headers = ['Column 1'];
          }

          sheets[tableName] = {
            headers,
            rows,
            totalRows: totalCount > 0 ? totalCount : rows.length,
            totalColumns: headers.length
          };
        }
      }

      if (sheetNames.length === 0) {
        const defaultSheet = 'Empty Database';
        sheetNames.push(defaultSheet);
        sheets[defaultSheet] = {
          headers: ['Notice'],
          rows: [['This SQLite database does not contain any user tables or views.']],
          totalRows: 1,
          totalColumns: 1
        };
      }

      const activeSheet = sheetNames[0];

      return {
        sheets,
        activeSheet,
        sheetNames,
        format: 'sqlite',
        isReadOnly: true,
        fileName
      };
    } finally {
      db.close();
    }
  }
}
