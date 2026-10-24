# Change Log

All notable changes to the "Table Viewer" extension will be documented in this file.

## [1.0.0] - 2026-10-24

### Features Added
- **Multi-Format Support**:
  - Delimited text files (`.csv`, `.tsv`, `.tab`) with automatic delimiter detection (comma, semicolon, tab, pipe) and BOM stripping.
  - Microsoft Excel spreadsheets (`.xlsx`, `.xls`, `.xlsm`, `.xlsb`) with tabbed multi-sheet navigation.
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
  - Text wrapping and zebra row striping toggles.
