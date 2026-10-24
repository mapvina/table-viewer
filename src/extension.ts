import * as vscode from 'vscode';
import { CsvEditorProvider } from './providers/csvEditorProvider';
import { ExcelEditorProvider } from './providers/excelEditorProvider';
import { SqliteEditorProvider } from './providers/sqliteEditorProvider';

export function activate(context: vscode.ExtensionContext) {
  // Register custom editor providers
  context.subscriptions.push(CsvEditorProvider.register(context));
  context.subscriptions.push(ExcelEditorProvider.register(context));
  context.subscriptions.push(SqliteEditorProvider.register(context));

  // Register command: Open in Table Viewer
  const openHandler = async (uri?: vscode.Uri) => {
    let targetUri = uri;
    if (!targetUri && vscode.window.activeTextEditor) {
      targetUri = vscode.window.activeTextEditor.document.uri;
    }

    if (!targetUri) {
      const selected = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: {
          'Table Files': ['csv', 'tsv', 'xlsx', 'db', 'sqlite', 'sqlite3']
        }
      });
      if (selected && selected[0]) {
        targetUri = selected[0];
      }
    }

    if (targetUri) {
      const ext = targetUri.path.split('.').pop()?.toLowerCase();
      if (ext === 'xlsx') {
        await vscode.commands.executeCommand('vscode.openWith', targetUri, ExcelEditorProvider.viewType);
      } else if (ext === 'db' || ext === 'sqlite' || ext === 'sqlite3') {
        await vscode.commands.executeCommand('vscode.openWith', targetUri, SqliteEditorProvider.viewType);
      } else {
        await vscode.commands.executeCommand('vscode.openWith', targetUri, CsvEditorProvider.viewType);
      }
    }
  };

  context.subscriptions.push(vscode.commands.registerCommand('tableViewer.openTableViewer', openHandler));
  console.log('Table Viewer extension activated successfully.');
}

export function deactivate() {}
