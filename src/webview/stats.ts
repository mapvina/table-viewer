import { ColumnStats, SelectionStats, TableCellValue } from '../types';
import { StatsCalculator } from '../core/stats';

export class StatsView {
  private drawerElement: HTMLElement;
  private contentElement: HTMLElement;

  constructor(drawerElement: HTMLElement, contentElement: HTMLElement) {
    this.drawerElement = drawerElement;
    this.contentElement = contentElement;
  }

  public show(): void {
    this.drawerElement.style.display = 'flex';
  }

  public hide(): void {
    this.drawerElement.style.display = 'none';
  }

  public toggle(): boolean {
    const isVisible = this.drawerElement.style.display !== 'none';
    if (isVisible) {
      this.hide();
      return false;
    } else {
      this.show();
      return true;
    }
  }

  public renderColumnStats(colIdx: number, headerName: string, rows: TableCellValue[][]): void {
    this.show();
    const stats: ColumnStats = StatsCalculator.calculateColumnStats(colIdx, headerName, rows);

    let html = `
      <div class="stats-card">
        <div class="stats-header">
          <span class="stats-col-name">${escapeHtml(stats.columnName)}</span>
          <span class="stats-type-tag ${stats.isNumeric ? 'tag-numeric' : 'tag-text'}">
            ${stats.isNumeric ? '123 Numeric' : 'Abc Text'}
          </span>
        </div>

        <div class="stats-grid">
          <div class="stat-box">
            <span class="stat-label">Total Rows</span>
            <span class="stat-val">${stats.totalCount.toLocaleString()}</span>
          </div>
          <div class="stat-box">
            <span class="stat-label">Non-Empty</span>
            <span class="stat-val">${stats.nonEmptyCount.toLocaleString()}</span>
          </div>
          <div class="stat-box">
            <span class="stat-label">Empty</span>
            <span class="stat-val">${stats.emptyCount.toLocaleString()}</span>
          </div>
          <div class="stat-box">
            <span class="stat-label">Distinct</span>
            <span class="stat-val">${stats.distinctCount.toLocaleString()}</span>
          </div>
        </div>
      </div>
    `;

    if (stats.isNumeric && stats.sum !== undefined) {
      html += `
        <div class="stats-card">
          <h4>Numeric Summary</h4>
          <table class="stats-table">
            <tr><td>Sum:</td><td><b>${stats.sum.toLocaleString()}</b></td></tr>
            <tr><td>Average (Mean):</td><td><b>${stats.avg?.toLocaleString()}</b></td></tr>
            <tr><td>Median:</td><td><b>${stats.median?.toLocaleString()}</b></td></tr>
            <tr><td>Min:</td><td><b>${stats.min?.toLocaleString()}</b></td></tr>
            <tr><td>Max:</td><td><b>${stats.max?.toLocaleString()}</b></td></tr>
          </table>
        </div>
      `;
    }

    if (stats.topValues && stats.topValues.length > 0) {
      html += `
        <div class="stats-card">
          <h4>Frequent Values</h4>
          <div class="freq-list">
      `;

      const maxFreq = stats.topValues[0].count || 1;
      for (const item of stats.topValues) {
        const pct = Math.round((item.count / (stats.nonEmptyCount || 1)) * 100);
        const barWidth = Math.max(Math.round((item.count / maxFreq) * 100), 5);
        html += `
          <div class="freq-item">
            <div class="freq-labels">
              <span class="freq-name" title="${escapeHtml(item.value)}">${escapeHtml(item.value || '(empty)')}</span>
              <span class="freq-count">${item.count} (${pct}%)</span>
            </div>
            <div class="freq-bar-bg">
              <div class="freq-bar" style="width: ${barWidth}%;"></div>
            </div>
          </div>
        `;
      }
      html += `</div></div>`;
    }

    this.contentElement.innerHTML = html;
  }

  public static formatSelectionStats(cells: TableCellValue[]): string {
    if (cells.length <= 1) {
      return '';
    }

    const s = StatsCalculator.calculateSelectionStats(cells);
    if (s.numericCount > 0) {
      return `Selected: ${s.count} cells | Sum: ${s.sum.toLocaleString()} | Avg: ${s.avg.toLocaleString()} | Min: ${s.min} | Max: ${s.max}`;
    } else {
      return `Selected: ${s.count} cells`;
    }
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
