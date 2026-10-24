import * as vscode from 'vscode';
import * as path from 'path';
import { SqliteParser } from '../core/sqliteParser';
import { TableExporter } from '../core/exporter';
import { ExtensionOptions, HostToWebviewMessage, TableCellValue, WebviewToHostMessage } from '../types';
import { getWebviewHtml } from './htmlUtils';

export class SqliteDocument implements vscode.CustomDocument {
  constructor(public readonly uri: vscode.Uri, public readonly data: Uint8Array) {}

  public dispose(): void {}
}

export class SqliteEditorProvider implements vscode.CustomReadonlyEditorProvider<SqliteDocument> {
  public static readonly viewType = 'tableViewer.sqliteEditor';

  constructor(private readonly context: vscode.ExtensionContext) {}

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new SqliteEditorProvider(context);
    return vscode.window.registerCustomEditorProvider(SqliteEditorProvider.viewType, provider, {
      webviewOptions: {
        retainContextWhenHidden: true
      },
      supportsMultipleEditorsPerDocument: false
    });
  }

  public async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken
  ): Promise<SqliteDocument> {
    const data = await vscode.workspace.fs.readFile(uri);
    return new SqliteDocument(uri, data);
  }

  public async resolveCustomEditor(
    document: SqliteDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const webview = webviewPanel.webview;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    };

    webview.html = getWebviewHtml(webview, this.context.extensionUri, document.uri.fsPath);

    const getOptions = (): ExtensionOptions => {
      const config = vscode.workspace.getConfiguration('tableViewer');
      return {
        defaultPageSize: config.get<number>('defaultPageSize', 100),
        enableVirtualization: config.get<boolean>('enableVirtualization', true),
        hasHeader: true,
        autoDetectDelimiter: false,
        allowEditing: false, // Read-only for SQLite
        minColumnWidth: config.get<number>('minColumnWidth', 80),
        maxColumnWidth: config.get<number>('maxColumnWidth', 320),
        rowHeight: config.get<number>('rowHeight', 28)
      };
    };

    const loadData = async () => {
      try {
        const wasmDir = path.join(this.context.extensionPath, 'dist');
        const data = await SqliteParser.parse(document.data, document.uri.fsPath, wasmDir);
        const options = getOptions();

        const message: HostToWebviewMessage = {
          type: 'load',
          payload: {
            data,
            options,
            title: document.uri.fsPath.split(/[\\/]/).pop() || 'SQLite'
          }
        };
        webview.postMessage(message);
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to open SQLite database: ${err?.message || err}`);
      }
    };

    const messageSub = webview.onDidReceiveMessage(async (msg: WebviewToHostMessage) => {
      switch (msg.type) {
        case 'ready': {
          await loadData();
          break;
        }

        case 'export': {
          await this.handleExport(msg.payload);
          break;
        }

        case 'showInfo': {
          vscode.window.showInformationMessage(msg.payload.message);
          break;
        }

        case 'showError': {
          vscode.window.showErrorMessage(msg.payload.message);
          break;
        }

        case 'updateSettings': {
          try {
            const config = vscode.workspace.getConfiguration('tableViewer');
            if (msg.payload.rowHeight !== undefined) {
              await config.update('rowHeight', msg.payload.rowHeight, vscode.ConfigurationTarget.Global);
            }
            if (msg.payload.minColumnWidth !== undefined) {
              await config.update('minColumnWidth', msg.payload.minColumnWidth, vscode.ConfigurationTarget.Global);
            }
            if (msg.payload.maxColumnWidth !== undefined) {
              await config.update('maxColumnWidth', msg.payload.maxColumnWidth, vscode.ConfigurationTarget.Global);
            }
          } catch (err) {
            console.error('Failed to persist settings:', err);
          }
          break;
        }
      }
    });

    webviewPanel.onDidDispose(() => {
      messageSub.dispose();
    });
  }

  private async handleExport(payload: {
    format: 'csv' | 'tsv' | 'json' | 'xlsx' | 'html';
    sheetName: string;
    headers: string[];
    rows: TableCellValue[][];
  }) {
    const sheetData = {
      headers: payload.headers,
      rows: payload.rows
    };

    let ext = 'csv';
    let content: Uint8Array;
    let filters: { [name: string]: string[] } = {};

    switch (payload.format) {
      case 'csv':
        ext = 'csv';
        filters = { 'CSV Files': ['csv'] };
        content = new TextEncoder().encode(TableExporter.toCsv(sheetData, ','));
        break;
      case 'tsv':
        ext = 'tsv';
        filters = { 'TSV Files': ['tsv'] };
        content = new TextEncoder().encode(TableExporter.toTsv(sheetData));
        break;
      case 'json':
        ext = 'json';
        filters = { 'JSON Files': ['json'] };
        content = new TextEncoder().encode(TableExporter.toJson(sheetData));
        break;
      case 'html':
        ext = 'html';
        filters = { 'HTML Files': ['html'] };
        content = new TextEncoder().encode(TableExporter.toHtml(sheetData));
        break;
      case 'xlsx':
        ext = 'xlsx';
        filters = { 'Excel Files': ['xlsx'] };
        content = TableExporter.toExcel(payload.sheetName, sheetData);
        break;
    }

    const defaultUri = vscode.Uri.file(`export_${payload.sheetName || 'table'}.${ext}`);
    const saveUri = await vscode.window.showSaveDialog({
      defaultUri,
      filters
    });

    if (saveUri) {
      await vscode.workspace.fs.writeFile(saveUri, content);
      vscode.window.showInformationMessage(`Successfully exported table "${payload.sheetName}" to ${saveUri.fsPath}`);
    }
  }
}
