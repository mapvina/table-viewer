# Change Log

All notable changes to the "Table Viewer" extension will be documented in this file.

## [1.1.0] - 2026-10-24

### Improvements & Dependencies
- **Upgraded to TypeScript 7 (`7.0.2`)**:
  - Migrated compiler options to `"module": "ESNext"` and `"moduleResolution": "bundler"`.
  - Upgraded build targets to Node 20 and Chrome 120 with faster native Go compiler type-checking.
- **Lightweight & Secure Excel Engine**:
  - Replaced monolithic `xlsx` (SheetJS) with zero-vulnerability, lightweight `read-excel-file` (`9.3.12`) and `write-excel-file` (`4.1.1`).
  - Focused on standard, modern `.xlsx` format with multi-sheet reading, editing, and exporting.
  - Reduced extension bundle size by ~78% (from 2.0 MB down to 442 KB).
- **Security Hardening**:
  - Added dependency override for `@azure/msal-node` (`^7.1.1`), resolving `GHSA-xcx6-jx8p-x3h5` for **0 npm audit vulnerabilities**.
- **Tooling Upgrades**:
  - Updated `esbuild` to `^0.28.2`, `@types/node` to `^24.0.0`, `papaparse` to `^5.7.0`.

## [1.0.0] - 2026-10-24

### Features Added
- **Multi-Format Support**:
  - Delimited text files (`.csv`, `.tsv`, `.tab`) with automatic delimiter detection (comma, semicolon, tab, pipe) and BOM stripping.
  - Microsoft Excel spreadsheets (`.xlsx`) with tabbed multi-sheet navigation.
  - SQLite databases (`.db`, `.sqlite`, `.sqlite3`) with table and view dropdown selection powered by WebAssembly (`sql.js`).
- **High-Performance Grid**:
  - Virtualized rendering capable of loading tens of thousands of rows at 60 FPS.
  - Sticky column headers and sticky row index column.
  - Configurable pagination or smooth virtual scrolling.
- **Search & Filtering**:
  - Instant global search (`Ctrl+F` / `Cmd+F`) with match case and Regular Expression options.
  - Multi-condition column filters (`contains`, `equals`, `starts with`, `ends with`, numeric comparisons `>`, `>=`, `<`, `<=`, regex).
- **Interactive Visualization & Statistics**:
  - In-place HTML5 Canvas charting (Vertical Bar, Horizontal Bar, Line, Pie, and Donut charts).
  - Summary metrics for numeric columns (Sum, Average, Median, Min, Max, Count).
  - Frequency distribution analysis for categorical text columns.
  - Real-time cell range selection metrics in status bar.
- **Editing & Data Export**:
  - In-place cell editing with keyboard navigation and undo/redo support.
  - Multi-format export: CSV, TSV, Excel (.xlsx), JSON, Markdown, and HTML table formats.
- **Grid Layout Controls**:
  - Double-click column border to auto-fit content width.
  - Global auto-fit toggle with configurable bounds (`tableViewer.minColumnWidth`, `tableViewer.maxColumnWidth`).
  - Configurable row height (`tableViewer.rowHeight`).
  - Text wrapping and zebra row striping toggles.
