<p align="center">
  <img src="assets/icon.png" width="128" height="128" alt="Table Viewer Logo" />
</p>

# Table Viewer

An interactive, high-performance tabular data viewer and editor for Visual Studio Code supporting CSV, TSV, Excel, and SQLite database files.

Published by **MapVina** • Licensed under **MIT**

---

## Overview

Table Viewer provides a unified, responsive interface to inspect, filter, visualize, and edit tabular datasets directly within VS Code without external dependencies or heavyweight database management tools.

### Supported File Formats

- **Delimited Text**: `.csv`, `.tsv`, `.tab` (with automatic delimiter detection for comma, semicolon, tab, and pipe)
- **Spreadsheets**: `.xlsx`, `.xls`, `.xlsm`, `.xlsb` (multi-sheet support)
- **Relational Databases**: `.db`, `.sqlite`, `.sqlite3` (multi-table and view support via WebAssembly engine)

---

## Key Capabilities

### 1. High-Performance Virtualized Grid
- Renders datasets with tens of thousands of rows smoothly at 60 FPS.
- Only visible cells and an overscan buffer are mounted to the DOM, ensuring minimal memory footprint.
- Sticky column headers and persistent index columns remain fixed during horizontal and vertical scrolling.

### 2. Multi-Sheet and Multi-Table Navigation
- **Excel**: Tabbed navigation for workbooks with multiple sheets.
- **SQLite**: Compact dropdown selector with row count metrics to easily switch between tables and views in large databases.

### 3. Search and Multi-Rule Filtering
- **Global Search (`Ctrl+F` / `Cmd+F`)**: Instant search across all columns with case sensitivity and Regular Expression support.
- **Column Filters**: Rule builder supporting text comparisons (`contains`, `equals`, `starts with`, `ends with`), numeric comparisons (`>`, `>=`, `<`, `<=`), empty checks, and regex matching.

### 4. Statistical Analysis
- Automated detection of column data types (Numeric vs. Text).
- Computation of summary statistics for numeric fields: Sum, Average, Median, Min, Max, and Row Counts.
- Frequency distribution and percentage breakdown for categorical text fields.
- Real-time selection metrics displayed in the status bar for highlighted cell ranges.

### 5. Data Visualization
- In-place HTML5 Canvas charting (Vertical Bar, Horizontal Bar, Line, Pie, and Donut charts).
- Built-in data aggregation: Sum, Average, Count (group-by frequency), Min, and Max.
- Value and label sorting options.
- Interactive hover tooltips displaying values and percentage shares with high-DPI canvas scaling.

### 6. Auto-Fit and Text Wrapping
- Configurable automatic column width calculation bounded by `minColumnWidth` and `maxColumnWidth` constraints.
- Double-click column header boundary to auto-fit individual columns to content width.
- Optional multi-line text wrapping (`Wrap`) for long text and descriptions.
- Alternating row styling (`Zebra`) for readability across wide screens.

### 7. In-Place Editing and Export
- Inline cell editing for CSV and Excel files with standard Undo/Redo integration.
- Safe read-only inspection mode for SQLite databases.
- Direct data export to CSV, TSV, Excel (.xlsx), JSON, Markdown Table, or HTML formats.

---

## Keyboard Shortcuts

| Shortcut | Description |
| --- | --- |
| `Ctrl + F` / `Cmd + F` | Focus global search input |
| `Arrow Keys` | Move active cell selection |
| `Shift + Arrow Keys` | Expand cell selection range |
| `Enter` / `F2` | Enter in-place cell editing mode |
| `Tab` | Commit cell edit and advance to next column |
| `Escape` | Cancel editing or clear selection |
| `Ctrl + C` / `Cmd + C` | Copy selected cells to clipboard in TSV format |
| `Delete` / `Backspace` | Clear contents of selected cells |

---

## Configuration Settings

The extension can be customized via VS Code `settings.json`:

```json
{
  "tableViewer.enableVirtualization": true,
  "tableViewer.defaultPageSize": 100,
  "tableViewer.hasHeader": true,
  "tableViewer.autoDetectDelimiter": true,
  "tableViewer.allowEditing": true,
  "tableViewer.minColumnWidth": 80,
  "tableViewer.maxColumnWidth": 320,
  "tableViewer.rowHeight": 28
}
```

---

## Build and Installation

### Build from source:
```bash
npm install
npm run build
```

### Run automated test suite:
```bash
npm test
```

### Package VSIX:
```bash
npm run package
```

### Install into VS Code:
```bash
code --install-extension table-viewer-1.0.0.vsix
```

---

## License

MIT License. Copyright (c) 2026 MapVina.
