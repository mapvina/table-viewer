import {
  ColumnFilter,
  ExtensionOptions,
  HostToWebviewMessage,
  SheetData,
  SortConfig,
  TableCellValue,
  TableDocumentData,
  WebviewToHostMessage
} from '../types';
import { ChartRenderer } from './chart';
import { FilterEngine } from './filter';
import { VirtualGrid } from './grid';
import { StatsView } from './stats';

// VS Code Webview API bridge
declare function acquireVsCodeApi(): {
  postMessage: (message: WebviewToHostMessage) => void;
  getState: () => any;
  setState: (state: any) => void;
};

const vscode = acquireVsCodeApi();

class TableViewerApp {
  private documentData: TableDocumentData | null = null;
  private options: ExtensionOptions = {
    defaultPageSize: 100,
    enableVirtualization: true,
    hasHeader: true,
    autoDetectDelimiter: true,
    allowEditing: true,
    minColumnWidth: 80,
    maxColumnWidth: 320,
    rowHeight: 28
  };

  private activeSheetName = '';
  private grid!: VirtualGrid;
  private statsView!: StatsView;
  private chartRenderer!: ChartRenderer;

  // Filter & Search State
  private searchTerm = '';
  private searchCase = false;
  private searchRegex = false;
  private columnFilters: ColumnFilter[] = [];
  private sortConfig: SortConfig = { columnIdx: -1, direction: null };

  // Cached filtered and sorted rows
  private currentDisplayIndices: number[] = [];

  constructor() {
    this.initElements();
    this.attachEventListeners();
    this.notifyReady();
  }

  private notifyReady(): void {
    vscode.postMessage({ type: 'ready' });
  }

  private initElements(): void {
    const gridContainer = document.getElementById('grid-container')!;
    this.grid = new VirtualGrid(gridContainer, {
      rowHeight: this.options.rowHeight || 28,
      overscan: 15,
      allowEditing: this.options.allowEditing,
      minColumnWidth: this.options.minColumnWidth,
      maxColumnWidth: this.options.maxColumnWidth,
      onCellChange: (rowIdx, colIdx, newVal) => {
        this.handleCellChange(rowIdx, colIdx, newVal);
      },
      onSortChange: (colIdx) => {
        this.handleSortChange(colIdx);
      },
      onColumnHeaderClick: (colIdx) => {
        const sheet = this.getActiveSheetData();
        if (sheet) {
          this.statsView.renderColumnStats(colIdx, sheet.headers[colIdx], sheet.rows);
        }
      },
      onSelectionChange: (selectedCells, count) => {
        this.updateSelectionStatus(selectedCells);
      }
    });

    const statsDrawer = document.getElementById('stats-drawer')!;
    const statsContent = document.getElementById('stats-content')!;
    this.statsView = new StatsView(statsDrawer, statsContent);

    const canvas = document.getElementById('chart-canvas') as HTMLCanvasElement;
    this.chartRenderer = new ChartRenderer(canvas);
  }

  private getActiveSheetData(): SheetData | null {
    if (!this.documentData || !this.documentData.sheets) return null;
    return this.documentData.sheets[this.activeSheetName] || null;
  }

  public loadData(data: TableDocumentData, options: ExtensionOptions, title: string): void {
    this.documentData = data;
    this.options = options;
    if (this.grid) {
      this.grid.setColumnWidthBounds(options.minColumnWidth, options.maxColumnWidth);
      if (options.rowHeight) {
        this.grid.setRowHeight(options.rowHeight);
      }
    }
    this.activeSheetName = data.activeSheet || data.sheetNames[0] || 'Sheet1';

    // Update UI title and badges
    const titleEl = document.getElementById('file-name');
    if (titleEl) {
      titleEl.textContent = title;
      titleEl.title = title;
    }

    const iconEl = document.getElementById('file-icon');
    if (iconEl) {
      if (data.format === 'excel') {
        iconEl.textContent = '📗';
      } else if (data.format === 'sqlite') {
        iconEl.textContent = '🗄️';
      } else {
        iconEl.textContent = '📊';
      }
    }

    const delimEl = document.getElementById('status-delimiter');
    if (delimEl) {
      if (data.format === 'excel') {
        delimEl.style.display = 'none';
      } else if (data.format === 'sqlite') {
        delimEl.style.display = 'inline-block';
        delimEl.textContent = 'SQLite (Read-Only)';
      } else {
        delimEl.style.display = 'inline-block';
        const d = data.delimiter === '\t' ? 'TAB' : data.delimiter || ',';
        delimEl.textContent = `Delimiter: [ ${d} ]`;
      }
    }

    const addRowBtn = document.getElementById('btn-add-row');
    if (addRowBtn) {
      addRowBtn.style.display = data.isReadOnly ? 'none' : 'inline-flex';
    }

    this.renderSheetTabs();
    this.applyDataToView();
  }

  private renderSheetTabs(): void {
    const tabsContainer = document.getElementById('sheet-tabs')!;
    const tableSelectWrapper = document.getElementById('table-select-wrapper')!;
    const tableSelect = document.getElementById('table-select') as HTMLSelectElement;
    const tableIcon = document.getElementById('table-select-icon');

    if (!this.documentData || this.documentData.sheetNames.length <= 1) {
      tabsContainer.style.display = 'none';
      tableSelectWrapper.style.display = 'none';
      return;
    }

    const isSqlite = this.documentData.format === 'sqlite';
    const hasManySheets = this.documentData.sheetNames.length > 4;

    if (isSqlite || hasManySheets) {
      // Use clean, compact select dropdown
      tabsContainer.style.display = 'none';
      tableSelectWrapper.style.display = 'flex';
      tableSelect.innerHTML = '';
      if (tableIcon) {
        tableIcon.textContent = isSqlite ? '🗄️' : '📋';
      }

      for (const name of this.documentData.sheetNames) {
        const opt = document.createElement('option');
        opt.value = name;
        const totalRows = this.documentData.sheets[name]?.totalRows ?? this.documentData.sheets[name]?.rows.length ?? 0;
        opt.textContent = `${name} (${totalRows.toLocaleString()} rows)`;
        if (name === this.activeSheetName) {
          opt.selected = true;
        }
        tableSelect.appendChild(opt);
      }
    } else {
      // Use tabs for small sheet counts in Excel
      tableSelectWrapper.style.display = 'none';
      tabsContainer.style.display = 'flex';
      tabsContainer.innerHTML = '';

      for (const sheetName of this.documentData.sheetNames) {
        const tab = document.createElement('button');
        tab.className = `sheet-tab ${sheetName === this.activeSheetName ? 'active' : ''}`;
        tab.textContent = sheetName;
        tab.title = `Switch to sheet "${sheetName}"`;
        tab.addEventListener('click', () => {
          this.switchSheet(sheetName);
        });
        tabsContainer.appendChild(tab);
      }
    }
  }

  private switchSheet(sheetName: string): void {
    if (this.activeSheetName === sheetName) return;
    this.activeSheetName = sheetName;
    const tableSelect = document.getElementById('table-select') as HTMLSelectElement;
    if (tableSelect) {
      tableSelect.value = sheetName;
    }
    this.renderSheetTabs();
    this.applyDataToView();
  }

  private applyDataToView(): void {
    const sheet = this.getActiveSheetData();
    if (!sheet) return;

    // 1. Filter rows
    const filteredIndices = FilterEngine.filterRows(
      sheet.rows,
      this.searchTerm,
      this.searchCase,
      this.searchRegex,
      this.columnFilters
    );

    // 2. Sort rows if requested
    if (this.sortConfig.direction && this.sortConfig.columnIdx >= 0) {
      const col = this.sortConfig.columnIdx;
      const dir = this.sortConfig.direction === 'asc' ? 1 : -1;

      filteredIndices.sort((idxA, idxB) => {
        const valA = sheet.rows[idxA][col];
        const valB = sheet.rows[idxB][col];

        const strA = valA !== null && valA !== undefined ? String(valA).trim() : '';
        const strB = valB !== null && valB !== undefined ? String(valB).trim() : '';

        const numA = Number(strA);
        const numB = Number(strB);
        if (!isNaN(numA) && !isNaN(numB) && strA !== '' && strB !== '') {
          return (numA - numB) * dir;
        }

        return strA.localeCompare(strB, undefined, { numeric: true, sensitivity: 'base' }) * dir;
      });
    }

    this.currentDisplayIndices = filteredIndices;
    this.grid.setData(sheet.headers, sheet.rows, this.currentDisplayIndices, this.sortConfig);
    this.updateStatus();
    this.updateSearchCount();
  }

  private handleSortChange(colIdx: number): void {
    if (this.sortConfig.columnIdx === colIdx) {
      if (this.sortConfig.direction === 'asc') {
        this.sortConfig.direction = 'desc';
      } else if (this.sortConfig.direction === 'desc') {
        this.sortConfig.direction = null;
        this.sortConfig.columnIdx = -1;
      }
    } else {
      this.sortConfig = { columnIdx: colIdx, direction: 'asc' };
    }
    this.applyDataToView();
  }

  private handleCellChange(rowIdx: number, colIdx: number, newVal: string): void {
    const sheet = this.getActiveSheetData();
    if (!sheet) return;

    sheet.rows[rowIdx][colIdx] = newVal;
    this.triggerSave();
  }

  private triggerSave(): void {
    if (!this.documentData) return;
    vscode.postMessage({
      type: 'save',
      payload: {
        sheets: this.documentData.sheets,
        activeSheet: this.activeSheetName,
        delimiter: this.documentData.delimiter
      }
    });
  }

  private addNewRow(): void {
    const sheet = this.getActiveSheetData();
    if (!sheet) return;

    const newRow: TableCellValue[] = new Array(sheet.headers.length).fill('');
    sheet.rows.push(newRow);
    sheet.totalRows = sheet.rows.length;

    this.applyDataToView();
    this.triggerSave();

    // Scroll to bottom
    const gridContainer = document.getElementById('grid-container');
    if (gridContainer) {
      gridContainer.scrollTop = gridContainer.scrollHeight;
    }
  }

  private updateStatus(): void {
    const sheet = this.getActiveSheetData();
    if (!sheet) return;

    const rowInfoEl = document.getElementById('status-row-info');
    if (rowInfoEl) {
      rowInfoEl.textContent = `${this.currentDisplayIndices.length.toLocaleString()} of ${sheet.rows.length.toLocaleString()} rows, ${sheet.headers.length} columns`;
    }

    const filterInfoEl = document.getElementById('status-filter-info');
    if (filterInfoEl) {
      const isFiltered = this.currentDisplayIndices.length < sheet.rows.length;
      filterInfoEl.style.display = isFiltered ? 'inline-block' : 'none';
      if (isFiltered) {
        filterInfoEl.textContent = `Filtered (${this.currentDisplayIndices.length} / ${sheet.rows.length})`;
      }
    }

    const sheetInfoEl = document.getElementById('status-active-sheet');
    if (sheetInfoEl) {
      sheetInfoEl.textContent = this.documentData?.format === 'sqlite' ? `Table: ${this.activeSheetName}` : `Sheet: ${this.activeSheetName}`;
    }

    const filterBadge = document.getElementById('filter-badge');
    if (filterBadge) {
      const activeCount = this.columnFilters.length;
      filterBadge.textContent = activeCount > 0 ? String(activeCount) : '';
      filterBadge.style.display = activeCount > 0 ? 'inline-block' : 'none';
    }
  }

  private updateSearchCount(): void {
    const countEl = document.getElementById('search-count');
    if (!countEl) return;

    if (!this.searchTerm) {
      countEl.textContent = '';
      return;
    }

    countEl.textContent = `${this.currentDisplayIndices.length} matches`;
  }

  private updateSelectionStatus(selectedCells: TableCellValue[]): void {
    const selectionInfoEl = document.getElementById('status-selection-info');
    if (!selectionInfoEl) return;

    if (selectedCells.length <= 1) {
      selectionInfoEl.textContent = '1 cell selected';
      return;
    }

    selectionInfoEl.textContent = StatsView.formatSelectionStats(selectedCells);
  }

  private attachEventListeners(): void {
    // Search input
    const searchInput = document.getElementById('search-input') as HTMLInputElement;
    let searchDebounceTimer: any;
    searchInput?.addEventListener('input', () => {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        this.searchTerm = searchInput.value.trim();
        this.applyDataToView();
      }, 150);
    });

    // Search toggles
    const caseBtn = document.getElementById('search-case-btn');
    caseBtn?.addEventListener('click', () => {
      this.searchCase = !this.searchCase;
      caseBtn.classList.toggle('active', this.searchCase);
      this.applyDataToView();
    });

    const regexBtn = document.getElementById('search-regex-btn');
    regexBtn?.addEventListener('click', () => {
      this.searchRegex = !this.searchRegex;
      regexBtn.classList.toggle('active', this.searchRegex);
      this.applyDataToView();
    });

    // Global keyboard shortcut: Ctrl+F / Cmd+F to focus search
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        searchInput?.focus();
        searchInput?.select();
      }
    });

    // Table / Sheet Dropdown Selector
    const tableSelect = document.getElementById('table-select') as HTMLSelectElement;
    tableSelect?.addEventListener('change', () => {
      this.switchSheet(tableSelect.value);
    });

    // Add Row button
    document.getElementById('btn-add-row')?.addEventListener('click', () => {
      this.addNewRow();
    });

    // Auto-fit all columns button
    document.getElementById('btn-autofit')?.addEventListener('click', () => {
      this.grid.autoFitAllColumns();
    });

    // Text wrap toggle button
    const wrapBtn = document.getElementById('btn-wrap');
    wrapBtn?.addEventListener('click', () => {
      const active = this.grid.toggleWrapText();
      wrapBtn.classList.toggle('active', active);
    });

    // Zebra striping toggle button
    const zebraBtn = document.getElementById('btn-zebra');
    zebraBtn?.addEventListener('click', () => {
      const active = this.grid.toggleZebraStriping();
      zebraBtn.classList.toggle('active', active);
    });

    // Stats Drawer Toggle
    document.getElementById('btn-stats')?.addEventListener('click', () => {
      const sheet = this.getActiveSheetData();
      if (sheet && sheet.headers.length > 0) {
        this.statsView.renderColumnStats(0, sheet.headers[0], sheet.rows);
      } else {
        this.statsView.toggle();
      }
    });

    document.getElementById('close-stats-drawer')?.addEventListener('click', () => {
      this.statsView.hide();
    });

    // Export Dropdown
    const exportBtn = document.getElementById('btn-export');
    const exportMenu = document.getElementById('export-dropdown');

    exportBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = exportMenu?.style.display !== 'none';
      if (exportMenu) {
        exportMenu.style.display = isVisible ? 'none' : 'block';
      }
    });

    window.addEventListener('click', () => {
      if (exportMenu) {
        exportMenu.style.display = 'none';
      }
    });

    document.querySelectorAll('.dropdown-item[data-export]').forEach(item => {
      item.addEventListener('click', (e) => {
        const format = (e.currentTarget as HTMLElement).dataset.export as any;
        this.exportData(format);
      });
    });

    // Filter Modal
    const filterModal = document.getElementById('filter-modal')!;
    document.getElementById('btn-filter')?.addEventListener('click', () => {
      this.openFilterModal();
    });

    document.getElementById('close-filter-modal')?.addEventListener('click', () => {
      filterModal.style.display = 'none';
    });

    document.getElementById('btn-add-filter-rule')?.addEventListener('click', () => {
      this.addFilterRuleRow();
    });

    document.getElementById('btn-clear-filters')?.addEventListener('click', () => {
      this.columnFilters = [];
      filterModal.style.display = 'none';
      this.applyDataToView();
    });

    document.getElementById('btn-apply-filters')?.addEventListener('click', () => {
      this.saveFiltersFromModal();
      filterModal.style.display = 'none';
      this.applyDataToView();
    });

    // Chart Modal
    const chartModal = document.getElementById('chart-modal')!;
    document.getElementById('btn-charts')?.addEventListener('click', () => {
      this.openChartModal();
    });

    document.getElementById('close-chart-modal')?.addEventListener('click', () => {
      chartModal.style.display = 'none';
    });

    const chartTypeSelect = document.getElementById('chart-type-select') as HTMLSelectElement;
    const chartXSelect = document.getElementById('chart-x-select') as HTMLSelectElement;
    const chartAggSelect = document.getElementById('chart-agg-select') as HTMLSelectElement;
    const chartYSelect = document.getElementById('chart-y-select') as HTMLSelectElement;
    const chartSortSelect = document.getElementById('chart-sort-select') as HTMLSelectElement;
    const chartLimitSelect = document.getElementById('chart-limit-select') as HTMLSelectElement;

    const onChartConfigChange = () => {
      const isCount = chartAggSelect?.value === 'count';
      const groupY = document.getElementById('group-chart-y');
      if (groupY) {
        groupY.style.display = isCount ? 'none' : 'flex';
      }
      this.updateChartPreview();
    };

    chartTypeSelect?.addEventListener('change', onChartConfigChange);
    chartXSelect?.addEventListener('change', onChartConfigChange);
    chartAggSelect?.addEventListener('change', onChartConfigChange);
    chartYSelect?.addEventListener('change', onChartConfigChange);
    chartSortSelect?.addEventListener('change', onChartConfigChange);
    chartLimitSelect?.addEventListener('change', onChartConfigChange);

    // Settings Modal
    const settingsModal = document.getElementById('settings-modal')!;
    document.getElementById('btn-settings')?.addEventListener('click', () => {
      settingsModal.style.display = 'flex';
      const delimSelect = document.getElementById('setting-delimiter') as HTMLSelectElement;
      if (delimSelect && this.documentData) {
        delimSelect.value = this.documentData.delimiter || ',';
      }
    });

    document.getElementById('close-settings-modal')?.addEventListener('click', () => {
      settingsModal.style.display = 'none';
    });

    document.getElementById('btn-save-settings')?.addEventListener('click', () => {
      const delimSelect = document.getElementById('setting-delimiter') as HTMLSelectElement;
      if (delimSelect && this.documentData) {
        this.documentData.delimiter = delimSelect.value;
        this.triggerSave();
      }
      settingsModal.style.display = 'none';
    });

    // Listen to messages from extension host
    window.addEventListener('message', (event) => {
      const message: HostToWebviewMessage = event.data;
      switch (message.type) {
        case 'load':
          this.loadData(message.payload.data, message.payload.options, message.payload.title);
          break;
        case 'externalChange':
          this.loadData(message.payload.data, this.options, message.payload.data.fileName || 'Table');
          break;
        case 'saveAck':
          if (!message.payload.success) {
            console.error('Save failed:', message.payload.error);
          }
          break;
      }
    });
  }

  private exportData(format: 'csv' | 'tsv' | 'json' | 'xlsx' | 'html'): void {
    const sheet = this.getActiveSheetData();
    if (!sheet) return;

    // Export current filtered rows
    const exportRows: TableCellValue[][] = [];
    for (const idx of this.currentDisplayIndices) {
      exportRows.push(sheet.rows[idx]);
    }

    vscode.postMessage({
      type: 'export',
      payload: {
        format,
        sheetName: this.activeSheetName,
        headers: sheet.headers,
        rows: exportRows
      }
    });
  }

  private openFilterModal(): void {
    const modal = document.getElementById('filter-modal')!;
    modal.style.display = 'flex';

    const rulesList = document.getElementById('filter-rules-list')!;
    rulesList.innerHTML = '';

    if (this.columnFilters.length === 0) {
      this.addFilterRuleRow();
    } else {
      for (const filter of this.columnFilters) {
        this.addFilterRuleRow(filter);
      }
    }
  }

  private addFilterRuleRow(initial?: ColumnFilter): void {
    const rulesList = document.getElementById('filter-rules-list')!;
    const sheet = this.getActiveSheetData();
    if (!sheet) return;

    const row = document.createElement('div');
    row.className = 'filter-rule-row';

    // Column select
    const colSelect = document.createElement('select');
    colSelect.className = 'filter-col-select';
    sheet.headers.forEach((h, idx) => {
      const opt = document.createElement('option');
      opt.value = String(idx);
      opt.textContent = h || `Column ${idx + 1}`;
      if (initial && initial.columnIdx === idx) opt.selected = true;
      colSelect.appendChild(opt);
    });

    // Operator select
    const opSelect = document.createElement('select');
    opSelect.className = 'filter-op-select';
    const operators = [
      { val: 'contains', label: 'contains' },
      { val: 'notContains', label: 'does not contain' },
      { val: 'equals', label: 'equals (=)' },
      { val: 'notEquals', label: 'not equals (!=)' },
      { val: 'startsWith', label: 'starts with' },
      { val: 'endsWith', label: 'ends with' },
      { val: 'gt', label: 'greater than (>)' },
      { val: 'gte', label: 'greater or equal (>=)' },
      { val: 'lt', label: 'less than (<)' },
      { val: 'lte', label: 'less or equal (<=)' },
      { val: 'empty', label: 'is empty' },
      { val: 'notEmpty', label: 'is not empty' },
      { val: 'regex', label: 'regex match' }
    ];

    operators.forEach(op => {
      const opt = document.createElement('option');
      opt.value = op.val;
      opt.textContent = op.label;
      if (initial && initial.operator === op.val) opt.selected = true;
      opSelect.appendChild(opt);
    });

    // Value input
    const valInput = document.createElement('input');
    valInput.type = 'text';
    valInput.className = 'filter-val-input';
    valInput.placeholder = 'Value...';
    if (initial) valInput.value = initial.value;

    // Delete rule button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'icon-btn';
    deleteBtn.textContent = '✕';
    deleteBtn.title = 'Remove rule';
    deleteBtn.addEventListener('click', () => {
      row.remove();
    });

    row.appendChild(colSelect);
    row.appendChild(opSelect);
    row.appendChild(valInput);
    row.appendChild(deleteBtn);

    rulesList.appendChild(row);
  }

  private saveFiltersFromModal(): void {
    const rulesList = document.getElementById('filter-rules-list')!;
    const rows = rulesList.querySelectorAll('.filter-rule-row');

    const newFilters: ColumnFilter[] = [];
    rows.forEach(r => {
      const colSelect = r.querySelector('.filter-col-select') as HTMLSelectElement;
      const opSelect = r.querySelector('.filter-op-select') as HTMLSelectElement;
      const valInput = r.querySelector('.filter-val-input') as HTMLInputElement;

      if (colSelect && opSelect && valInput) {
        newFilters.push({
          columnIdx: parseInt(colSelect.value, 10),
          operator: opSelect.value as any,
          value: valInput.value
        });
      }
    });

    this.columnFilters = newFilters;
  }

  private openChartModal(): void {
    const sheet = this.getActiveSheetData();
    if (!sheet || sheet.headers.length === 0) return;

    const modal = document.getElementById('chart-modal')!;
    modal.style.display = 'flex';

    const xSelect = document.getElementById('chart-x-select') as HTMLSelectElement;
    const ySelect = document.getElementById('chart-y-select') as HTMLSelectElement;
    const aggSelect = document.getElementById('chart-agg-select') as HTMLSelectElement;

    xSelect.innerHTML = '';
    ySelect.innerHTML = '';

    // Detect numeric columns
    const numericCols = new Set<number>();
    sheet.headers.forEach((_, colIdx) => {
      let numCount = 0;
      const checkLimit = Math.min(sheet.rows.length, 30);
      for (let r = 0; r < checkLimit; r++) {
        const val = sheet.rows[r]?.[colIdx];
        if (val !== null && val !== undefined && String(val).trim() !== '') {
          const num = Number(String(val).trim());
          if (!isNaN(num) && isFinite(num)) {
            numCount++;
          }
        }
      }
      if (checkLimit > 0 && numCount / checkLimit >= 0.5) {
        numericCols.add(colIdx);
      }
    });

    let firstNumericCol = -1;
    let firstCategoryCol = -1;

    sheet.headers.forEach((h, idx) => {
      const isNum = numericCols.has(idx);
      const title = h || `Column ${idx + 1}`;

      // X options
      const optX = document.createElement('option');
      optX.value = String(idx);
      optX.textContent = `${isNum ? '123' : 'Abc'} ${title}`;
      xSelect.appendChild(optX);

      // Y options
      const optY = document.createElement('option');
      optY.value = String(idx);
      optY.textContent = `${isNum ? '★ 123' : 'Abc'} ${title}`;
      ySelect.appendChild(optY);

      if (isNum && firstNumericCol === -1) {
        firstNumericCol = idx;
      }
      if (!isNum && firstCategoryCol === -1) {
        firstCategoryCol = idx;
      }
    });

    // Default intelligent selections
    if (firstCategoryCol !== -1) {
      xSelect.value = String(firstCategoryCol);
    } else {
      xSelect.value = '0';
    }

    if (firstNumericCol !== -1) {
      ySelect.value = String(firstNumericCol);
      if (aggSelect) aggSelect.value = 'sum';
    } else {
      ySelect.value = '0';
      if (aggSelect) aggSelect.value = 'count';
    }

    const isCount = aggSelect?.value === 'count';
    const groupY = document.getElementById('group-chart-y');
    if (groupY) {
      groupY.style.display = isCount ? 'none' : 'flex';
    }

    this.updateChartPreview();
  }

  private updateChartPreview(): void {
    const sheet = this.getActiveSheetData();
    if (!sheet) return;

    const chartType = ((document.getElementById('chart-type-select') as HTMLSelectElement)?.value || 'bar') as any;
    const xCol = parseInt((document.getElementById('chart-x-select') as HTMLSelectElement)?.value || '0', 10);
    const agg = ((document.getElementById('chart-agg-select') as HTMLSelectElement)?.value || 'sum') as string;
    const yCol = parseInt((document.getElementById('chart-y-select') as HTMLSelectElement)?.value || '0', 10);
    const sortBy = (document.getElementById('chart-sort-select') as HTMLSelectElement)?.value || 'val-desc';
    const limitVal = (document.getElementById('chart-limit-select') as HTMLSelectElement)?.value || '20';
    const limit = limitVal === 'all' ? Infinity : (parseInt(limitVal, 10) || 20);

    const xHeader = sheet.headers[xCol] || `Col ${xCol + 1}`;
    const yHeader = sheet.headers[yCol] || `Col ${yCol + 1}`;

    let items: { label: string; value: number }[] = [];

    if (agg === 'none') {
      // Raw unaggregated rows
      for (const r of this.currentDisplayIndices) {
        const row = sheet.rows[r];
        if (!row) continue;
        const xVal = row[xCol] !== null && row[xCol] !== undefined ? String(row[xCol]).trim() : '';
        const yNum = Number(row[yCol]);
        items.push({
          label: xVal || `Row ${r + 1}`,
          value: !isNaN(yNum) ? yNum : 0
        });
      }
    } else if (agg === 'count') {
      // Group by Category and COUNT rows
      const counts = new Map<string, number>();
      for (const r of this.currentDisplayIndices) {
        const row = sheet.rows[r];
        if (!row) continue;
        const xVal = row[xCol] !== null && row[xCol] !== undefined && String(row[xCol]).trim() !== ''
          ? String(row[xCol]).trim()
          : '(Blank)';
        counts.set(xVal, (counts.get(xVal) || 0) + 1);
      }
      for (const [label, count] of counts.entries()) {
        items.push({ label, value: count });
      }
    } else {
      // Numerical Aggregations: sum, avg, min, max
      const groups = new Map<string, { sum: number; count: number; min: number; max: number }>();
      for (const r of this.currentDisplayIndices) {
        const row = sheet.rows[r];
        if (!row) continue;
        const xVal = row[xCol] !== null && row[xCol] !== undefined && String(row[xCol]).trim() !== ''
          ? String(row[xCol]).trim()
          : '(Blank)';
        const num = Number(row[yCol]);
        if (!isNaN(num) && isFinite(num)) {
          const entry = groups.get(xVal) || { sum: 0, count: 0, min: num, max: num };
          entry.sum += num;
          entry.count += 1;
          if (num < entry.min) entry.min = num;
          if (num > entry.max) entry.max = num;
          groups.set(xVal, entry);
        } else {
          if (!groups.has(xVal)) {
            groups.set(xVal, { sum: 0, count: 0, min: 0, max: 0 });
          }
        }
      }

      for (const [label, g] of groups.entries()) {
        let finalVal = 0;
        if (agg === 'sum') {
          finalVal = Math.round(g.sum * 100) / 100;
        } else if (agg === 'avg') {
          finalVal = g.count > 0 ? Math.round((g.sum / g.count) * 100) / 100 : 0;
        } else if (agg === 'min') {
          finalVal = g.count > 0 ? g.min : 0;
        } else if (agg === 'max') {
          finalVal = g.count > 0 ? g.max : 0;
        }
        items.push({ label, value: finalVal });
      }
    }

    // Sort items
    if (sortBy === 'val-desc') {
      items.sort((a, b) => b.value - a.value);
    } else if (sortBy === 'val-asc') {
      items.sort((a, b) => a.value - b.value);
    } else if (sortBy === 'label-asc') {
      items.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }));
    }

    // Apply limit
    if (items.length > limit) {
      items = items.slice(0, limit);
    }

    const labels = items.map(it => it.label);
    const values = items.map(it => it.value);

    const xTitle = xHeader;
    const yTitle = agg === 'count' ? 'Count (Rows)' : `${agg.toUpperCase()}: ${yHeader}`;

    this.chartRenderer.render(chartType, labels, values, xTitle, yTitle);
  }
}

// Start application when DOM loaded
window.addEventListener('DOMContentLoaded', () => {
  new TableViewerApp();
});
