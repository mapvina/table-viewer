import * as vscode from 'vscode';

export function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri, title: string): string {
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js'));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'style.css'));
  const nonce = getNonce();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${styleUri}">
  <title>${title}</title>
</head>
<body>
  <div id="app">
    <!-- Header / Toolbar -->
    <header id="toolbar" class="toolbar">
      <div class="toolbar-section toolbar-left">
        <div class="file-badge">
          <span id="file-icon" class="badge-icon">📊</span>
          <span id="file-name" class="file-name">Table Viewer</span>
        </div>
        <!-- Sheet Selector Tabs for Excel -->
        <div id="sheet-tabs" class="sheet-tabs" style="display: none;"></div>
        <!-- Table / Sheet Dropdown Selector -->
        <div id="table-select-wrapper" class="table-select-wrapper" style="display: none;">
          <span id="table-select-icon" class="table-select-icon">🗄️</span>
          <select id="table-select" class="table-select" title="Select table to view"></select>
        </div>
      </div>

      <div class="toolbar-section toolbar-center">
        <!-- Quick Search -->
        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input type="text" id="search-input" placeholder="Search table... (Ctrl+F)" autocomplete="off" spellcheck="false" />
          <button id="search-case-btn" class="icon-btn tool-toggle" title="Match Case">Aa</button>
          <button id="search-regex-btn" class="icon-btn tool-toggle" title="Use Regular Expression">.*</button>
          <span id="search-count" class="search-count"></span>
        </div>
      </div>

      <div class="toolbar-section toolbar-right">
        <button id="btn-autofit" class="btn" title="Auto-fit all columns to content width">Auto Fit ↔</button>
        <button id="btn-wrap" class="btn tool-toggle" title="Toggle text wrapping">Wrap ↵</button>
        <button id="btn-zebra" class="btn tool-toggle active" title="Toggle alternating row colors">Zebra 🦓</button>
        <button id="btn-add-row" class="btn" title="Add New Row at the end">+ Row</button>
        <button id="btn-filter" class="btn" title="Column Filters">Filter <span id="filter-badge" class="badge"></span></button>
        <button id="btn-charts" class="btn" title="Visualize Data with Charts">Chart 📈</button>
        <button id="btn-stats" class="btn" title="Column Statistics & Summary">Stats ℹ️</button>
        <button id="btn-export" class="btn btn-primary" title="Export Data">Export ▾</button>
        <div id="export-dropdown" class="dropdown-menu" style="display: none;">
          <button class="dropdown-item" data-export="csv">Export as CSV (.csv)</button>
          <button class="dropdown-item" data-export="tsv">Export as TSV (.tsv)</button>
          <button class="dropdown-item" data-export="xlsx">Export as Excel (.xlsx)</button>
          <button class="dropdown-item" data-export="json">Export as JSON (.json)</button>
          <button class="dropdown-item" data-export="markdown">Export as Markdown (.md)</button>
          <button class="dropdown-item" data-export="html">Export as HTML (.html)</button>
        </div>
        <button id="btn-settings" class="icon-btn" title="Settings">⚙️</button>
      </div>
    </header>

    <!-- Main Content Area: Table Grid & Side Panels -->
    <main id="main-content" class="main-content">
      <div id="grid-container" class="grid-container" tabindex="0">
        <!-- Virtualized Table Elements generated dynamically -->
      </div>

      <!-- Stats Sidebar Drawer -->
      <aside id="stats-drawer" class="stats-drawer" style="display: none;">
        <div class="drawer-header">
          <h3>Column Insights</h3>
          <button id="close-stats-drawer" class="icon-btn">✕</button>
        </div>
        <div id="stats-content" class="drawer-content">
          <p class="placeholder-text">Click on any column header to view detailed statistical analysis.</p>
        </div>
      </aside>
    </main>

    <!-- Status Bar -->
    <footer id="statusbar" class="statusbar">
      <div class="status-left">
        <span id="status-row-info">0 rows, 0 columns</span>
        <span id="status-filter-info" style="display:none;" class="status-pill">Filtered</span>
        <span id="status-delimiter" class="status-pill"></span>
      </div>
      <div class="status-right">
        <span id="status-selection-info">No selection</span>
        <span id="status-active-sheet" class="status-pill"></span>
      </div>
    </footer>

    <!-- Filter Modal Dialog -->
    <div id="filter-modal" class="modal-backdrop" style="display: none;">
      <div class="modal">
        <div class="modal-header">
          <h3>Filter Data</h3>
          <button id="close-filter-modal" class="icon-btn">✕</button>
        </div>
        <div class="modal-body">
          <div id="filter-rules-list" class="filter-rules-list"></div>
          <button id="btn-add-filter-rule" class="btn btn-secondary">+ Add Rule</button>
        </div>
        <div class="modal-footer">
          <button id="btn-clear-filters" class="btn">Clear All</button>
          <button id="btn-apply-filters" class="btn btn-primary">Apply Filters</button>
        </div>
      </div>
    </div>

    <!-- Chart Visualization Modal -->
    <div id="chart-modal" class="modal-backdrop" style="display: none;">
      <div class="modal modal-lg">
        <div class="modal-header">
          <h3>Quick Data Visualization</h3>
          <button id="close-chart-modal" class="icon-btn">✕</button>
        </div>
        <div class="modal-body">
          <div class="chart-controls">
            <div class="control-group">
              <label>Chart Type:</label>
              <select id="chart-type-select">
                <option value="bar">Bar (Vertical)</option>
                <option value="horizontal-bar">Bar (Horizontal)</option>
                <option value="line">Line Chart</option>
                <option value="pie">Pie Chart</option>
                <option value="donut">Donut Chart</option>
              </select>
            </div>
            <div class="control-group">
              <label>Category (X-Axis):</label>
              <select id="chart-x-select"></select>
            </div>
            <div class="control-group">
              <label>Aggregation:</label>
              <select id="chart-agg-select">
                <option value="sum" selected>Sum (Tổng)</option>
                <option value="avg">Average (TB)</option>
                <option value="count">Count (Số dòng)</option>
                <option value="min">Min</option>
                <option value="max">Max</option>
                <option value="none">None (Raw Rows)</option>
              </select>
            </div>
            <div class="control-group" id="group-chart-y">
              <label>Value (Y-Axis):</label>
              <select id="chart-y-select"></select>
            </div>
            <div class="control-group">
              <label>Sort By:</label>
              <select id="chart-sort-select">
                <option value="val-desc" selected>Value: High → Low</option>
                <option value="val-asc">Value: Low → High</option>
                <option value="label-asc">Label: A → Z</option>
                <option value="none">Original Order</option>
              </select>
            </div>
            <div class="control-group">
              <label>Limit:</label>
              <select id="chart-limit-select">
                <option value="5">Top 5</option>
                <option value="10">Top 10</option>
                <option value="20" selected>Top 20</option>
                <option value="50">Top 50</option>
                <option value="all">All Items</option>
              </select>
            </div>
          </div>
          <div class="chart-canvas-container" style="position: relative;">
            <canvas id="chart-canvas" width="700" height="380"></canvas>
            <div id="chart-tooltip" class="chart-tooltip" style="display: none;"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Settings Modal -->
    <div id="settings-modal" class="modal-backdrop" style="display: none;">
      <div class="modal">
        <div class="modal-header">
          <h3>Table Settings</h3>
          <button id="close-settings-modal" class="icon-btn">✕</button>
        </div>
        <div class="modal-body">
          <div class="setting-item">
            <label for="setting-delimiter">Delimiter:</label>
            <select id="setting-delimiter">
              <option value=",">Comma (,)</option>
              <option value=";">Semicolon (;)</option>
              <option value="&#9;">Tab (\t)</option>
              <option value="|">Pipe (|)</option>
            </select>
          </div>
          <div class="setting-item checkbox-item">
            <input type="checkbox" id="setting-has-header" checked />
            <label for="setting-has-header">First row is Header</label>
          </div>
          <div class="setting-item checkbox-item">
            <input type="checkbox" id="setting-editable" checked />
            <label for="setting-editable">Enable In-Place Cell Editing</label>
          </div>
        </div>
        <div class="modal-footer">
          <button id="btn-save-settings" class="btn btn-primary">Apply</button>
        </div>
      </div>
    </div>

    <!-- Context Menu for Cell / Header -->
    <div id="context-menu" class="context-menu" style="display: none;"></div>
  </div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
