import * as vscode from 'vscode';
import { ExcelParser } from '../core/excelParser';
import { TableExporter } from '../core/exporter';
import { ExtensionOptions, HostToWebviewMessage, SheetData, TableCellValue, TableDocumentData, WebviewToHostMessage } from '../types';
import { getWebviewHtml } from './htmlUtils';

export class ExcelDocument implements vscode.CustomDocument {
  private _data: Uint8Array;
  private readonly _uri: vscode.Uri;
  private _tableData: TableDocumentData;
  private _isDirty = false;

  private readonly _onDidChange = new vscode.EventEmitter<vscode.CustomDocumentEditEvent>();
  public readonly onDidChange = this._onDidChange.event;

  constructor(uri: vscode.Uri, initialData: Uint8Array) {
    this._uri = uri;
    this._data = initialData;
    this._tableData = ExcelParser.parse(initialData, uri.fsPath);
  }

  public get uri(): vscode.Uri {
    return this._uri;
  }

  public get data(): Uint8Array {
    return this._data;
  }

  public get tableData(): TableDocumentData {
    return this._tableData;
  }

  public get isDirty(): boolean {
    return this._isDirty;
  }

  public updateData(sheets: { [sheetName: string]: SheetData }, activeSheet: string): void {
    this._tableData.sheets = sheets;
    this._tableData.activeSheet = activeSheet;
    this._data = ExcelParser.serialize(sheets, activeSheet);
    this._isDirty = true;
  }

  public markClean(): void {
    this._isDirty = false;
  }

  public dispose(): void {
    this._onDidChange.dispose();
  }
}

export class ExcelEditorProvider implements vscode.CustomEditorProvider<ExcelDocument> {
  public static readonly viewType = 'tableViewer.excelEditor';

  private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<ExcelDocument>>();
  public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

  constructor(private readonly context: vscode.ExtensionContext) {}

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new ExcelEditorProvider(context);
    return vscode.window.registerCustomEditorProvider(ExcelEditorProvider.viewType, provider, {
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
  ): Promise<ExcelDocument> {
    const data = await vscode.workspace.fs.readFile(uri);
    return new ExcelDocument(uri, data);
  }

  public async resolveCustomEditor(
    document: ExcelDocument,
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
        hasHeader: config.get<boolean>('hasHeader', true),
        autoDetectDelimiter: config.get<boolean>('autoDetectDelimiter', true),
        allowEditing: config.get<boolean>('allowEditing', true),
        minColumnWidth: config.get<number>('minColumnWidth', 80),
        maxColumnWidth: config.get<number>('maxColumnWidth', 320),
        rowHeight: config.get<number>('rowHeight', 28)
      };
    };

    const loadData = () => {
      const options = getOptions();
      const message: HostToWebviewMessage = {
        type: 'load',
        payload: {
          data: document.tableData,
          options,
          title: document.uri.fsPath.split(/[\\/]/).pop() || 'Excel'
        }
      };
      webview.postMessage(message);
    };

    const messageSub = webview.onDidReceiveMessage(async (msg: WebviewToHostMessage) => {
      switch (msg.type) {
        case 'ready': {
          loadData();
          break;
        }

        case 'save': {
          try {
            document.updateData(msg.payload.sheets, msg.payload.activeSheet);
            await vscode.workspace.fs.writeFile(document.uri, document.data);
            document.markClean();
            webview.postMessage({
              type: 'saveAck',
              payload: { success: true }
            } as HostToWebviewMessage);
            vscode.window.showInformationMessage(`Saved ${document.uri.fsPath.split(/[\\/]/).pop()}`);
          } catch (err: any) {
            vscode.window.showErrorMessage(`Failed to save Excel file: ${err?.message || err}`);
            webview.postMessage({
              type: 'saveAck',
              payload: { success: false, error: err?.message || String(err) }
            } as HostToWebviewMessage);
          }
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
            if (msg.payload.allowEditing !== undefined) {
              await config.update('allowEditing', msg.payload.allowEditing, vscode.ConfigurationTarget.Global);
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

  public async saveCustomDocument(
    document: ExcelDocument,
    _cancellation: vscode.CancellationToken
  ): Promise<void> {
    await vscode.workspace.fs.writeFile(document.uri, document.data);
    document.markClean();
  }

  public async saveCustomDocumentAs(
    document: ExcelDocument,
    targetResource: vscode.Uri,
    _cancellation: vscode.CancellationToken
  ): Promise<void> {
    await vscode.workspace.fs.writeFile(targetResource, document.data);
  }

  public async revertCustomDocument(
    document: ExcelDocument,
    _cancellation: vscode.CancellationToken
  ): Promise<void> {
    const data = await vscode.workspace.fs.readFile(document.uri);
    document['updateData'](ExcelParser.parse(data, document.uri.fsPath).sheets, document.tableData.activeSheet);
    document.markClean();
  }

  public async backupCustomDocument(
    document: ExcelDocument,
    context: vscode.CustomDocumentBackupContext,
    _cancellation: vscode.CancellationToken
  ): Promise<vscode.CustomDocumentBackup> {
    await vscode.workspace.fs.writeFile(context.destination, document.data);
    return {
      id: context.destination.toString(),
      delete: async () => {
        try {
          await vscode.workspace.fs.delete(context.destination);
        } catch {
          // ignore
        }
      }
    };
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

    let ext = 'xlsx';
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

    const defaultUri = vscode.Uri.file(`export_${payload.sheetName || 'data'}.${ext}`);
    const saveUri = await vscode.window.showSaveDialog({
      defaultUri,
      filters
    });

    if (saveUri) {
      await vscode.workspace.fs.writeFile(saveUri, content);
      vscode.window.showInformationMessage(`Successfully exported data to ${saveUri.fsPath}`);
    }
  }
}
