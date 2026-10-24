import { ColumnFilter, TableCellValue } from '../types';

export class FilterEngine {
  /**
   * Tests a single cell against a filter rule
   */
  public static testCell(val: TableCellValue, filter: ColumnFilter): boolean {
    const strVal = val === null || val === undefined ? '' : String(val);
    const target = filter.value.trim();

    switch (filter.operator) {
      case 'contains':
        return strVal.toLowerCase().includes(target.toLowerCase());
      case 'notContains':
        return !strVal.toLowerCase().includes(target.toLowerCase());
      case 'equals':
        return strVal.toLowerCase() === target.toLowerCase();
      case 'notEquals':
        return strVal.toLowerCase() !== target.toLowerCase();
      case 'startsWith':
        return strVal.toLowerCase().startsWith(target.toLowerCase());
      case 'endsWith':
        return strVal.toLowerCase().endsWith(target.toLowerCase());
      case 'empty':
        return strVal.trim() === '';
      case 'notEmpty':
        return strVal.trim() !== '';
      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte': {
        const numCell = Number(strVal);
        const numTarget = Number(target);
        if (isNaN(numCell) || isNaN(numTarget)) return false;
        if (filter.operator === 'gt') return numCell > numTarget;
        if (filter.operator === 'gte') return numCell >= numTarget;
        if (filter.operator === 'lt') return numCell < numTarget;
        if (filter.operator === 'lte') return numCell <= numTarget;
        return false;
      }
      case 'regex': {
        try {
          const re = new RegExp(target, 'i');
          return re.test(strVal);
        } catch {
          return false;
        }
      }
      default:
        return true;
    }
  }

  /**
   * Filters row indices based on global search term and column filter rules.
   */
  public static filterRows(
    rows: TableCellValue[][],
    searchTerm: string,
    searchCase: boolean,
    searchRegex: boolean,
    columnFilters: ColumnFilter[]
  ): number[] {
    const resultIndices: number[] = [];

    let regex: RegExp | null = null;
    if (searchTerm) {
      if (searchRegex) {
        try {
          regex = new RegExp(searchTerm, searchCase ? 'g' : 'gi');
        } catch {
          regex = null;
        }
      }
    }

    const lowerSearch = searchTerm && !searchCase ? searchTerm.toLowerCase() : searchTerm;

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];

      // 1. Check Column Filters
      let passColumnFilters = true;
      for (const filter of columnFilters) {
        if (!this.testCell(row[filter.columnIdx], filter)) {
          passColumnFilters = false;
          break;
        }
      }
      if (!passColumnFilters) {
        continue;
      }

      // 2. Check Global Search Term
      if (searchTerm) {
        let matchGlobal = false;
        for (let c = 0; c < row.length; c++) {
          const cellStr = row[c] !== null && row[c] !== undefined ? String(row[c]) : '';
          if (regex) {
            regex.lastIndex = 0;
            if (regex.test(cellStr)) {
              matchGlobal = true;
              break;
            }
          } else {
            const cmpStr = searchCase ? cellStr : cellStr.toLowerCase();
            if (cmpStr.includes(lowerSearch)) {
              matchGlobal = true;
              break;
            }
          }
        }
        if (!matchGlobal) {
          continue;
        }
      }

      resultIndices.push(r);
    }

    return resultIndices;
  }
}
