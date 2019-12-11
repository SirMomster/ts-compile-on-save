import * as vscode from 'vscode';
import { existsSync, lstatSync } from 'fs';
import { join, sep } from 'path';
import { spawnSync } from 'child_process';

function checkRecursive(path: string[]) {
	while (path.length > 0) {

		path.pop();
		const cpath = path.join(sep);
		if (!cpath) { break; }

		const tsconfig = join(cpath, 'tsconfig.json');
		if (!lstatSync(cpath).isDirectory()) {
			continue;
		}

		if (!existsSync(tsconfig)) {
			continue;
		}

		vscode.window.showInformationMessage('Building folder: ' + cpath);
			
		spawnSync('tsc', {
			cwd: cpath,
		});

		break;
	}
}	

function build (fullFilePath: string) {
	const path = fullFilePath.split(sep);

	try {
		checkRecursive(path);
		vscode.window.showInformationMessage('Finished building ts for path!');
	} catch (ex) {
		vscode.window.showErrorMessage('Failed to build');
	}
}

export function activate(context: vscode.ExtensionContext) {

	console.log('Congratulations, your extension "tscompileonsave" is now active!');

	let disposable = vscode.commands.registerCommand('extension.build', () => {
		const activeEditor = vscode.window.activeTextEditor;
		if (!activeEditor) { return; }

		console.log(activeEditor.document.fileName);

		build(activeEditor.document.fileName);
	});

	vscode.workspace.onDidSaveTextDocument((e: vscode.TextDocument) => {
		// todo: implement this part with configuration
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {}
