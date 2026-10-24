export type TableCellValue = string | number | boolean | null | undefined;

export interface SheetData {
  headers: string[];
  rows: TableCellValue[][];
  totalRows?: number;
  totalColumns?: number;
}

export interface TableDocumentData {
  sheets: { [sheetName: string]: SheetData };
  activeSheet: string;
  sheetNames: string[];
  delimiter?: string;
  format: 'csv' | 'tsv' | 'excel' | 'sqlite';
  isReadOnly?: boolean;
  fileName?: string;
}

export interface SortConfig {
  columnIdx: number;
  direction: 'asc' | 'desc' | null;
}

export type FilterOperator = 
  | 'contains' 
  | 'notContains' 
  | 'equals' 
  | 'notEquals' 
  | 'startsWith' 
  | 'endsWith'
  | 'gt' 
  | 'gte' 
  | 'lt' 
  | 'lte' 
  | 'empty' 
  | 'notEmpty'
  | 'regex';

export interface ColumnFilter {
  columnIdx: number;
  operator: FilterOperator;
  value: string;
}

export interface ExtensionOptions {
  defaultPageSize: number;
  enableVirtualization: boolean;
  hasHeader: boolean;
  autoDetectDelimiter: boolean;
  allowEditing: boolean;
}

export interface ColumnStats {
  columnName: string;
  totalCount: number;
  nonEmptyCount: number;
  emptyCount: number;
  distinctCount: number;
  isNumeric: boolean;
  // Numeric metrics
  sum?: number;
  avg?: number;
  min?: number | string;
  max?: number | string;
  median?: number;
  // String metrics
  topValues?: { value: string; count: number }[];
}

export interface SelectionStats {
  count: number;
  numericCount: number;
  sum: number;
  avg: number;
  min: number | null;
  max: number | null;
}

// Communication Messages
export type HostToWebviewMessage =
  | { type: 'load'; payload: { data: TableDocumentData; options: ExtensionOptions; title: string } }
  | { type: 'externalChange'; payload: { data: TableDocumentData } }
  | { type: 'saveAck'; payload: { success: boolean; error?: string } };

export type WebviewToHostMessage =
  | { type: 'ready' }
  | { type: 'save'; payload: { sheets: { [sheetName: string]: SheetData }; activeSheet: string; delimiter?: string } }
  | { type: 'export'; payload: { format: 'csv' | 'tsv' | 'json' | 'xlsx' | 'html'; sheetName: string; headers: string[]; rows: TableCellValue[][] } }
  | { type: 'showInfo'; payload: { message: string } }
  | { type: 'showError'; payload: { message: string } };
