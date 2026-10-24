import * as vscode from 'vscode';
import { CsvParser } from '../core/csvParser';
import { TableExporter } from '../core/exporter';
import { ExtensionOptions, HostToWebviewMessage, WebviewToHostMessage } from '../types';
import { getWebviewHtml } from './htmlUtils';

export class CsvEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'tableViewer.csvEditor';

  private isApplyingLocalEdit = false;

  constructor(private readonly context: vscode.ExtensionContext) {}

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new CsvEditorProvider(context);
    return vscode.window.registerCustomEditorProvider(CsvEditorProvider.viewType, provider, {
      webviewOptions: {
        retainContextWhenHidden: true
      },
      supportsMultipleEditorsPerDocument: false
    });
  }

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const webview = webviewPanel.webview;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    };

    webview.html = getWebviewHtml(webview, this.context.extensionUri, document.fileName);

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
      const text = document.getText();
      const options = getOptions();
      const data = CsvParser.parse(text, document.fileName, {
        hasHeader: options.hasHeader,
        autoDetectDelimiter: options.autoDetectDelimiter
      });

      const message: HostToWebviewMessage = {
        type: 'load',
        payload: {
          data,
          options,
          title: document.fileName.split(/[\\/]/).pop() || 'Table'
        }
      };
      webview.postMessage(message);
    };

    // Listen to messages from the webview
    const messageSub = webview.onDidReceiveMessage(async (msg: WebviewToHostMessage) => {
      switch (msg.type) {
        case 'ready': {
          loadData();
          break;
        }

        case 'save': {
          try {
            const activeSheetData = msg.payload.sheets[msg.payload.activeSheet];
            if (!activeSheetData) {
              return;
            }

            const delimiter = msg.payload.delimiter || ',';
            const newText = CsvParser.serialize(activeSheetData, delimiter, true);

            this.isApplyingLocalEdit = true;
            const edit = new vscode.WorkspaceEdit();
            const fullRange = new vscode.Range(
              document.positionAt(0),
              document.positionAt(document.getText().length)
            );
            edit.replace(document.uri, fullRange, newText);
            const success = await vscode.workspace.applyEdit(edit);

            webview.postMessage({
              type: 'saveAck',
              payload: { success }
            } as HostToWebviewMessage);
          } catch (err: any) {
            vscode.window.showErrorMessage(`Failed to save table: ${err?.message || err}`);
            webview.postMessage({
              type: 'saveAck',
              payload: { success: false, error: err?.message || String(err) }
            } as HostToWebviewMessage);
          } finally {
            this.isApplyingLocalEdit = false;
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

    // Listen to changes to document from other editors or undo/redo
    const changeDocSub = vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.uri.toString() === document.uri.toString()) {
        if (!this.isApplyingLocalEdit) {
          const options = getOptions();
          const data = CsvParser.parse(document.getText(), document.fileName, {
            hasHeader: options.hasHeader,
            autoDetectDelimiter: options.autoDetectDelimiter
          });
          webview.postMessage({
            type: 'externalChange',
            payload: { data }
          } as HostToWebviewMessage);
        }
      }
    });

    webviewPanel.onDidDispose(() => {
      messageSub.dispose();
      changeDocSub.dispose();
    });
  }

  private async handleExport(payload: {
    format: 'csv' | 'tsv' | 'json' | 'xlsx' | 'html';
    sheetName: string;
    headers: string[];
    rows: any[][];
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
        content = await TableExporter.toExcel(payload.sheetName, sheetData);
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
