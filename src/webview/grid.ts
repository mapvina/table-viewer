import { SortConfig, TableCellValue } from '../types';

export interface GridOptions {
  rowHeight: number;
  overscan: number;
  allowEditing: boolean;
  minColumnWidth?: number;
  maxColumnWidth?: number;
  onCellChange?: (rowIdx: number, colIdx: number, newVal: string) => void;
  onSortChange?: (colIdx: number) => void;
  onColumnHeaderClick?: (colIdx: number) => void;
  onSelectionChange?: (selectedCells: TableCellValue[], count: number) => void;
  onDeleteRows?: (rowIndices: number[]) => void;
}

export interface SelectionRange {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

export class VirtualGrid {
  private container: HTMLElement;
  private options: GridOptions;

  private headers: string[] = [];
  private allRows: TableCellValue[][] = [];
  private visibleRowIndices: number[] = []; // maps display row index to allRows index
  private columnWidths: number[] = [];
  private sortConfig: SortConfig = { columnIdx: -1, direction: null };

  private baseRowHeight = 28;
  private wrappedRowHeight = 46;
  private rowHeight = 28;
  private indexColWidth = 55;
  private overscan = 15;
  private zebraStriping = true;
  private isWrapText = false;

  private minColWidth = 80;
  private maxColWidth = 320;

  private selection: SelectionRange | null = null;
  private activeCell: { row: number; col: number } | null = null;
  private editingCell: { row: number; col: number; input: HTMLInputElement } | null = null;

  // DOM elements
  private headerRowElement!: HTMLElement;
  private tableBodyElement!: HTMLElement;
  private spacerElement!: HTMLElement;
  private innerTableElement!: HTMLElement;

  private isDraggingColumn = false;
  private dragColIdx = -1;
  private dragStartX = 0;
  private dragStartWidth = 0;

  constructor(container: HTMLElement, options: Partial<GridOptions> = {}) {
    this.container = container;
    this.options = {
      rowHeight: options.rowHeight || 28,
      overscan: options.overscan || 15,
      allowEditing: options.allowEditing !== false,
      onCellChange: options.onCellChange,
      onSortChange: options.onSortChange,
      onColumnHeaderClick: options.onColumnHeaderClick,
      onSelectionChange: options.onSelectionChange,
      onDeleteRows: options.onDeleteRows
    };
    this.baseRowHeight = options.rowHeight || 28;
    this.wrappedRowHeight = Math.max(46, Math.round(this.baseRowHeight * 1.6));
    this.rowHeight = this.baseRowHeight;
    this.overscan = this.options.overscan;
    this.minColWidth = options.minColumnWidth ?? 80;
    this.maxColWidth = options.maxColumnWidth ?? 320;

    this.initDOM();
    this.attachEvents();
  }

  public setRowHeight(height?: number): void {
    if (typeof height === 'number' && height >= 18) {
      this.baseRowHeight = height;
      this.wrappedRowHeight = Math.max(height + 16, Math.round(height * 1.6));
      this.rowHeight = this.isWrapText ? this.wrappedRowHeight : this.baseRowHeight;
      this.updateDimensions();
      this.renderHeader();
      this.renderVisibleRows();
    }
  }

  public setColumnWidthBounds(minWidth?: number, maxWidth?: number): void {
    if (typeof minWidth === 'number' && minWidth > 0) {
      this.minColWidth = minWidth;
    }
    if (typeof maxWidth === 'number' && maxWidth >= this.minColWidth) {
      this.maxColWidth = maxWidth;
    }
  }

  private initDOM(): void {
    this.container.innerHTML = '';

    // Scroll wrapper
    this.spacerElement = document.createElement('div');
    this.spacerElement.className = 'grid-spacer';

    this.innerTableElement = document.createElement('div');
    this.innerTableElement.className = 'grid-table';

    this.headerRowElement = document.createElement('div');
    this.headerRowElement.className = 'grid-header-row';

    this.tableBodyElement = document.createElement('div');
    this.tableBodyElement.className = 'grid-body';

    this.innerTableElement.appendChild(this.headerRowElement);
    this.innerTableElement.appendChild(this.tableBodyElement);
    this.spacerElement.appendChild(this.innerTableElement);
    this.container.appendChild(this.spacerElement);
  }

  public setData(
    headers: string[],
    rows: TableCellValue[][],
    visibleRowIndices?: number[],
    sortConfig?: SortConfig
  ): void {
    this.headers = headers;
    this.allRows = rows;
    this.visibleRowIndices = visibleRowIndices || rows.map((_, i) => i);
    if (sortConfig) {
      this.sortConfig = sortConfig;
    }

    // Initialize column widths if needed by auto-fitting to content
    if (this.columnWidths.length !== headers.length) {
      this.calculateAutoFitWidths();
    }

    this.renderHeader();
    this.updateDimensions();
    this.renderVisibleRows();
  }

  public autoFitColumn(colIdx: number): void {
    const header = this.headers[colIdx] || '';
    let maxLen = String(header).length;
    const checkLimit = Math.min(this.allRows.length, 1000);
    for (let r = 0; r < checkLimit; r++) {
      const val = this.allRows[r]?.[colIdx];
      if (val !== null && val !== undefined) {
        const lines = String(val).split('\n');
        for (const line of lines) {
          if (line.length > maxLen) maxLen = line.length;
        }
      }
    }
    const idealWidth = Math.min(Math.max(Math.ceil(maxLen * 8.5) + 30, this.minColWidth), this.maxColWidth);
    this.columnWidths[colIdx] = idealWidth;
    this.updateDimensions();
    this.renderHeader();
    this.renderVisibleRows();
  }

  public autoFitAllColumns(): void {
    this.calculateAutoFitWidths();
    this.updateDimensions();
    this.renderHeader();
    this.renderVisibleRows();
  }

  private calculateAutoFitWidths(): void {
    const checkLimit = Math.min(this.allRows.length, 1000);
    this.columnWidths = this.headers.map((h, colIdx) => {
      let maxLen = String(h).length;
      for (let r = 0; r < checkLimit; r++) {
        const val = this.allRows[r]?.[colIdx];
        if (val !== null && val !== undefined) {
          const lines = String(val).split('\n');
          for (const line of lines) {
            if (line.length > maxLen) maxLen = line.length;
          }
        }
      }
      return Math.min(Math.max(Math.ceil(maxLen * 8.5) + 30, this.minColWidth), this.maxColWidth);
    });
  }

  public toggleWrapText(): boolean {
    this.isWrapText = !this.isWrapText;
    this.rowHeight = this.isWrapText ? this.wrappedRowHeight : this.baseRowHeight;
    this.container.classList.toggle('grid-wrap-text', this.isWrapText);
    this.updateDimensions();
    this.renderVisibleRows();
    return this.isWrapText;
  }

  public toggleZebraStriping(): boolean {
    this.zebraStriping = !this.zebraStriping;
    this.renderVisibleRows();
    return this.zebraStriping;
  }

  public setVisibleRowIndices(indices: number[]): void {
    this.visibleRowIndices = indices;
    this.updateDimensions();
    this.renderVisibleRows();
  }

  public setSortConfig(config: SortConfig): void {
    this.sortConfig = config;
    this.renderHeader();
  }

  private updateDimensions(): void {
    const totalRowHeight = this.visibleRowIndices.length * this.rowHeight;
    const totalColWidth = this.columnWidths.reduce((a, b) => a + b, 0) + this.indexColWidth;

    this.spacerElement.style.height = `${totalRowHeight + this.rowHeight}px`;
    this.spacerElement.style.width = `${totalColWidth}px`;
    this.innerTableElement.style.width = `${totalColWidth}px`;
  }

  private renderHeader(): void {
    this.headerRowElement.innerHTML = '';
    this.headerRowElement.style.height = `${this.rowHeight}px`;

    // Corner header for row indices
    const corner = document.createElement('div');
    corner.className = 'grid-header-cell grid-corner-cell';
    corner.style.width = `${this.indexColWidth}px`;
    corner.textContent = '#';
    corner.title = 'Select All';
    corner.addEventListener('click', () => {
      this.selectAll();
    });
    this.headerRowElement.appendChild(corner);

    // Column headers
    for (let c = 0; c < this.headers.length; c++) {
      const colWidth = this.columnWidths[c];
      const th = document.createElement('div');
      th.className = 'grid-header-cell';
      th.style.width = `${colWidth}px`;
      th.dataset.col = String(c);

      const titleSpan = document.createElement('span');
      titleSpan.className = 'grid-header-title';
      titleSpan.textContent = this.headers[c] || `Col ${c + 1}`;
      titleSpan.title = `${this.headers[c]} (Click to sort, double-click for stats)`;
      th.appendChild(titleSpan);

      // Sort indicator
      if (this.sortConfig.columnIdx === c && this.sortConfig.direction) {
        const sortIcon = document.createElement('span');
        sortIcon.className = 'grid-sort-icon';
        sortIcon.textContent = this.sortConfig.direction === 'asc' ? ' ▲' : ' ▼';
        th.appendChild(sortIcon);
      }

      // Click to sort
      titleSpan.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.options.onSortChange) {
          this.options.onSortChange(c);
        }
      });

      // Context click or double click for stats
      th.addEventListener('dblclick', () => {
        if (this.options.onColumnHeaderClick) {
          this.options.onColumnHeaderClick(c);
        }
      });

      // Resize handle
      const resizeHandle = document.createElement('div');
      resizeHandle.className = 'grid-col-resizer';
      resizeHandle.title = 'Drag to resize, double-click to auto-fit';
      resizeHandle.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.startColumnResize(c, e.clientX);
      });
      resizeHandle.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.autoFitColumn(c);
      });
      th.appendChild(resizeHandle);

      this.headerRowElement.appendChild(th);
    }
  }

  private startColumnResize(colIdx: number, startX: number): void {
    this.isDraggingColumn = true;
    this.dragColIdx = colIdx;
    this.dragStartX = startX;
    this.dragStartWidth = this.columnWidths[colIdx];

    document.body.classList.add('grid-resizing');

    const onMouseMove = (e: MouseEvent) => {
      if (!this.isDraggingColumn) return;
      const delta = e.clientX - this.dragStartX;
      const newWidth = Math.max(this.dragStartWidth + delta, Math.min(this.minColWidth, 30));
      this.columnWidths[this.dragColIdx] = newWidth;
      this.updateDimensions();
      this.renderHeader();
      this.renderVisibleRows();
    };

    const onMouseUp = () => {
      this.isDraggingColumn = false;
      document.body.classList.remove('grid-resizing');
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  public renderVisibleRows(): void {
    const scrollTop = this.container.scrollTop;
    const viewportHeight = this.container.clientHeight || 500;

    const totalVisible = this.visibleRowIndices.length;
    if (totalVisible === 0) {
      this.tableBodyElement.innerHTML = `
        <div class="grid-empty-message">No matching records found</div>
      `;
      return;
    }

    const startVisibleIdx = Math.max(0, Math.floor(scrollTop / this.rowHeight) - this.overscan);
    const endVisibleIdx = Math.min(totalVisible, Math.ceil((scrollTop + viewportHeight) / this.rowHeight) + this.overscan);

    this.tableBodyElement.innerHTML = '';

    for (let i = startVisibleIdx; i < endVisibleIdx; i++) {
      const actualRowIdx = this.visibleRowIndices[i];
      const rowData = this.allRows[actualRowIdx] || [];

      const rowEl = document.createElement('div');
      rowEl.className = 'grid-row';
      if (this.zebraStriping) {
        rowEl.classList.add(i % 2 === 1 ? 'grid-row-even' : 'grid-row-odd');
      }
      rowEl.style.top = `${i * this.rowHeight}px`;
      rowEl.style.height = `${this.rowHeight}px`;
      rowEl.dataset.visualRow = String(i);
      rowEl.dataset.actualRow = String(actualRowIdx);

      // Row Index Cell
      const indexCell = document.createElement('div');
      indexCell.className = 'grid-cell grid-index-cell';
      indexCell.style.width = `${this.indexColWidth}px`;
      indexCell.textContent = String(actualRowIdx + 1);
      indexCell.addEventListener('click', (e) => {
        this.selectRow(i, e.shiftKey);
      });
      rowEl.appendChild(indexCell);

      // Data Cells
      for (let c = 0; c < this.headers.length; c++) {
        const cellEl = document.createElement('div');
        cellEl.className = 'grid-cell';
        cellEl.style.width = `${this.columnWidths[c]}px`;
        cellEl.dataset.row = String(i);
        cellEl.dataset.col = String(c);

        const val = rowData[c];
        const strVal = val !== null && val !== undefined ? String(val) : '';
        cellEl.textContent = strVal;
        cellEl.title = strVal;

        // Check if numeric for right alignment
        if (strVal !== '' && !isNaN(Number(strVal))) {
          cellEl.classList.add('cell-number');
        }

        // Selection styling
        if (this.isCellSelected(i, c)) {
          cellEl.classList.add('cell-selected');
        }
        if (this.activeCell && this.activeCell.row === i && this.activeCell.col === c) {
          cellEl.classList.add('cell-active');
        }

        // Cell Click
        cellEl.addEventListener('mousedown', (e) => {
          if (e.button === 0) { // left click
            this.handleCellMouseDown(i, c, e.shiftKey);
          }
        });

        // Double click to edit
        cellEl.addEventListener('dblclick', () => {
          if (this.options.allowEditing) {
            this.startEditing(i, c, cellEl);
          }
        });

        rowEl.appendChild(cellEl);
      }

      this.tableBodyElement.appendChild(rowEl);
    }
  }

  private isCellSelected(visualRow: number, col: number): boolean {
    if (!this.selection) return false;
    const minRow = Math.min(this.selection.startRow, this.selection.endRow);
    const maxRow = Math.max(this.selection.startRow, this.selection.endRow);
    const minCol = Math.min(this.selection.startCol, this.selection.endCol);
    const maxCol = Math.max(this.selection.startCol, this.selection.endCol);

    return visualRow >= minRow && visualRow <= maxRow && col >= minCol && col <= maxCol;
  }

  private handleCellMouseDown(visualRow: number, col: number, isShift: boolean): void {
    if (this.editingCell) {
      this.commitEdit();
    }

    if (isShift && this.activeCell) {
      this.selection = {
        startRow: this.activeCell.row,
        startCol: this.activeCell.col,
        endRow: visualRow,
        endCol: col
      };
    } else {
      this.activeCell = { row: visualRow, col };
      this.selection = {
        startRow: visualRow,
        startCol: col,
        endRow: visualRow,
        endCol: col
      };
    }

    this.renderVisibleRows();
    this.notifySelectionChange();
  }

  public selectRow(visualRow: number, isShift: boolean): void {
    if (this.editingCell) this.commitEdit();

    if (isShift && this.activeCell) {
      this.selection = {
        startRow: this.activeCell.row,
        startCol: 0,
        endRow: visualRow,
        endCol: this.headers.length - 1
      };
    } else {
      this.activeCell = { row: visualRow, col: 0 };
      this.selection = {
        startRow: visualRow,
        startCol: 0,
        endRow: visualRow,
        endCol: this.headers.length - 1
      };
    }

    this.renderVisibleRows();
    this.notifySelectionChange();
  }

  public selectAll(): void {
    if (this.visibleRowIndices.length === 0) return;
    this.activeCell = { row: 0, col: 0 };
    this.selection = {
      startRow: 0,
      startCol: 0,
      endRow: this.visibleRowIndices.length - 1,
      endCol: this.headers.length - 1
    };
    this.renderVisibleRows();
    this.notifySelectionChange();
  }

  private notifySelectionChange(): void {
    if (!this.selection || !this.options.onSelectionChange) return;

    const minRow = Math.min(this.selection.startRow, this.selection.endRow);
    const maxRow = Math.max(this.selection.startRow, this.selection.endRow);
    const minCol = Math.min(this.selection.startCol, this.selection.endCol);
    const maxCol = Math.max(this.selection.startCol, this.selection.endCol);

    const cells: TableCellValue[] = [];
    for (let r = minRow; r <= maxRow; r++) {
      const actualRow = this.visibleRowIndices[r];
      if (actualRow !== undefined && this.allRows[actualRow]) {
        for (let c = minCol; c <= maxCol; c++) {
          cells.push(this.allRows[actualRow][c]);
        }
      }
    }

    this.options.onSelectionChange(cells, cells.length);
  }

  private startEditing(visualRow: number, col: number, cellEl: HTMLElement): void {
    const actualRow = this.visibleRowIndices[visualRow];
    if (actualRow === undefined) return;

    const currentVal = this.allRows[actualRow][col];
    const initialText = currentVal !== null && currentVal !== undefined ? String(currentVal) : '';

    cellEl.innerHTML = '';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'grid-cell-editor';
    input.value = initialText;

    this.editingCell = { row: visualRow, col, input };
    cellEl.appendChild(input);

    input.focus();
    input.select();

    const finish = (commit: boolean) => {
      if (!this.editingCell) return;
      if (commit) {
        const newVal = input.value;
        const oldVal = this.allRows[actualRow][col];
        if (newVal !== oldVal) {
          this.allRows[actualRow][col] = newVal;
          if (this.options.onCellChange) {
            this.options.onCellChange(actualRow, col, newVal);
          }
        }
      }
      this.editingCell = null;
      this.renderVisibleRows();
      this.container.focus();
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finish(true);
        // Move to next row
        if (visualRow + 1 < this.visibleRowIndices.length) {
          this.activeCell = { row: visualRow + 1, col };
          this.selection = { startRow: visualRow + 1, startCol: col, endRow: visualRow + 1, endCol: col };
          this.renderVisibleRows();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        finish(true);
        // Move to next column
        const nextCol = (col + 1) % this.headers.length;
        const nextRow = col + 1 >= this.headers.length ? Math.min(visualRow + 1, this.visibleRowIndices.length - 1) : visualRow;
        this.activeCell = { row: nextRow, col: nextCol };
        this.selection = { startRow: nextRow, startCol: nextCol, endRow: nextRow, endCol: nextCol };
        this.renderVisibleRows();
      }
    });

    input.addEventListener('blur', () => {
      finish(true);
    });
  }

  public commitEdit(): void {
    if (this.editingCell) {
      const { row, col, input } = this.editingCell;
      const actualRow = this.visibleRowIndices[row];
      if (actualRow !== undefined) {
        const newVal = input.value;
        this.allRows[actualRow][col] = newVal;
        if (this.options.onCellChange) {
          this.options.onCellChange(actualRow, col, newVal);
        }
      }
      this.editingCell = null;
      this.renderVisibleRows();
    }
  }

  private attachEvents(): void {
    // Scroll listener for virtual rendering
    this.container.addEventListener('scroll', () => {
      requestAnimationFrame(() => {
        this.renderVisibleRows();
      });
    });

    // Keyboard Shortcuts
    this.container.addEventListener('keydown', (e) => {
      if (this.editingCell) return;

      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
        this.copySelectionToClipboard();
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        this.clearSelectedCells();
        return;
      }

      if (e.key === 'Enter' || e.key === 'F2') {
        if (this.activeCell && this.options.allowEditing) {
          const cellEl = this.container.querySelector(`.grid-cell[data-row="${this.activeCell.row}"][data-col="${this.activeCell.col}"]`) as HTMLElement;
          if (cellEl) {
            this.startEditing(this.activeCell.row, this.activeCell.col, cellEl);
          }
        }
        return;
      }

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        this.navigateWithArrowKey(e.key, e.shiftKey);
      }
    });
  }

  private navigateWithArrowKey(key: string, isShift: boolean): void {
    if (!this.activeCell) {
      this.activeCell = { row: 0, col: 0 };
    }

    let { row, col } = this.activeCell;
    const maxRow = this.visibleRowIndices.length - 1;
    const maxCol = this.headers.length - 1;

    switch (key) {
      case 'ArrowUp':
        row = Math.max(0, row - 1);
        break;
      case 'ArrowDown':
        row = Math.min(maxRow, row + 1);
        break;
      case 'ArrowLeft':
        col = Math.max(0, col - 1);
        break;
      case 'ArrowRight':
        col = Math.min(maxCol, col + 1);
        break;
    }

    if (isShift && this.selection) {
      this.selection.endRow = row;
      this.selection.endCol = col;
    } else {
      this.activeCell = { row, col };
      this.selection = { startRow: row, startCol: col, endRow: row, endCol: col };
    }

    // Scroll into view if needed
    const targetY = row * this.rowHeight;
    if (targetY < this.container.scrollTop) {
      this.container.scrollTop = targetY;
    } else if (targetY + this.rowHeight > this.container.scrollTop + this.container.clientHeight) {
      this.container.scrollTop = targetY + this.rowHeight - this.container.clientHeight;
    }

    this.renderVisibleRows();
    this.notifySelectionChange();
  }

  private copySelectionToClipboard(): void {
    if (!this.selection) return;

    const minRow = Math.min(this.selection.startRow, this.selection.endRow);
    const maxRow = Math.max(this.selection.startRow, this.selection.endRow);
    const minCol = Math.min(this.selection.startCol, this.selection.endCol);
    const maxCol = Math.max(this.selection.startCol, this.selection.endCol);

    const lines: string[] = [];
    for (let r = minRow; r <= maxRow; r++) {
      const actualRow = this.visibleRowIndices[r];
      if (actualRow !== undefined && this.allRows[actualRow]) {
        const rowVals: string[] = [];
        for (let c = minCol; c <= maxCol; c++) {
          const val = this.allRows[actualRow][c];
          rowVals.push(val !== null && val !== undefined ? String(val) : '');
        }
        lines.push(rowVals.join('\t'));
      }
    }

    const tsvData = lines.join('\n');
    navigator.clipboard.writeText(tsvData).then(() => {
      // Feedback or toast can be handled by controller
    });
  }

  private clearSelectedCells(): void {
    if (!this.selection || !this.options.allowEditing) return;

    const minRow = Math.min(this.selection.startRow, this.selection.endRow);
    const maxRow = Math.max(this.selection.startRow, this.selection.endRow);
    const minCol = Math.min(this.selection.startCol, this.selection.endCol);
    const maxCol = Math.max(this.selection.startCol, this.selection.endCol);

    for (let r = minRow; r <= maxRow; r++) {
      const actualRow = this.visibleRowIndices[r];
      if (actualRow !== undefined && this.allRows[actualRow]) {
        for (let c = minCol; c <= maxCol; c++) {
          this.allRows[actualRow][c] = '';
          if (this.options.onCellChange) {
            this.options.onCellChange(actualRow, c, '');
          }
        }
      }
    }

    this.renderVisibleRows();
    this.notifySelectionChange();
  }

  public getSelectedRows(): number[] {
    if (!this.selection) return [];
    const minRow = Math.min(this.selection.startRow, this.selection.endRow);
    const maxRow = Math.max(this.selection.startRow, this.selection.endRow);
    const result: number[] = [];
    for (let r = minRow; r <= maxRow; r++) {
      const actual = this.visibleRowIndices[r];
      if (actual !== undefined) {
        result.push(actual);
      }
    }
    return result;
  }
}
