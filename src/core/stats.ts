import { ColumnStats, SelectionStats, TableCellValue } from '../types';

export class StatsCalculator {
  /**
   * Calculates comprehensive column statistics.
   */
  public static calculateColumnStats(colIdx: number, headerName: string, rows: TableCellValue[][]): ColumnStats {
    const totalCount = rows.length;
    let emptyCount = 0;
    const values: TableCellValue[] = [];
    const frequencyMap = new Map<string, number>();

    let numericValues: number[] = [];

    for (let r = 0; r < rows.length; r++) {
      const val = rows[r][colIdx];
      if (val === null || val === undefined || String(val).trim() === '') {
        emptyCount++;
      } else {
        values.push(val);
        const strVal = String(val).trim();
        frequencyMap.set(strVal, (frequencyMap.get(strVal) || 0) + 1);

        // Check if numeric
        const num = Number(strVal);
        if (!isNaN(num) && isFinite(num)) {
          numericValues.push(num);
        }
      }
    }

    const nonEmptyCount = values.length;
    const distinctCount = frequencyMap.size;
    const isNumeric = nonEmptyCount > 0 && (numericValues.length / nonEmptyCount) >= 0.75;

    const stats: ColumnStats = {
      columnName: headerName,
      totalCount,
      nonEmptyCount,
      emptyCount,
      distinctCount,
      isNumeric
    };

    if (isNumeric && numericValues.length > 0) {
      numericValues.sort((a, b) => a - b);
      const sum = numericValues.reduce((acc, v) => acc + v, 0);
      const avg = sum / numericValues.length;
      const min = numericValues[0];
      const max = numericValues[numericValues.length - 1];

      let median: number;
      const mid = Math.floor(numericValues.length / 2);
      if (numericValues.length % 2 === 0) {
        median = (numericValues[mid - 1] + numericValues[mid]) / 2;
      } else {
        median = numericValues[mid];
      }

      stats.sum = Math.round(sum * 1000) / 1000;
      stats.avg = Math.round(avg * 1000) / 1000;
      stats.min = min;
      stats.max = max;
      stats.median = Math.round(median * 1000) / 1000;
    }

    // Top frequent values
    const sortedFreq = Array.from(frequencyMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([value, count]) => ({ value, count }));

    stats.topValues = sortedFreq;

    return stats;
  }

  /**
   * Quick statistics for a selected set of cells.
   */
  public static calculateSelectionStats(cells: TableCellValue[]): SelectionStats {
    let numericCount = 0;
    let sum = 0;
    let min: number | null = null;
    let max: number | null = null;

    for (const cell of cells) {
      if (cell === null || cell === undefined || String(cell).trim() === '') {
        continue;
      }
      const num = Number(String(cell).trim());
      if (!isNaN(num) && isFinite(num)) {
        numericCount++;
        sum += num;
        if (min === null || num < min) {
          min = num;
        }
        if (max === null || num > max) {
          max = num;
        }
      }
    }

    return {
      count: cells.length,
      numericCount,
      sum: Math.round(sum * 1000) / 1000,
      avg: numericCount > 0 ? Math.round((sum / numericCount) * 1000) / 1000 : 0,
      min,
      max
    };
  }
}
