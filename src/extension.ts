import * as vscode from "vscode";
import { existsSync, lstatSync } from "fs";
import { join, sep } from "path";
import { spawn, ChildProcess } from "child_process";

enum BUILD_RESULT {
    SUCCESS,
    ERROR,
    WARNING,
    SKIP
}

import { groupBy, omit, mapValues } from "lodash";
import GlobToRegExp = require("glob-to-regexp");

type diagEntryType = {
    file: string;
    diagnostic: vscode.Diagnostic;
};

const configuration = vscode.workspace.getConfiguration("tsCompileOnSave");
const BASE_PATH = vscode.workspace.rootPath;

let process: {
	[k: string]: ChildProcess | null;
} = {};

async function checkRecursive(
    path: string[],
    document: vscode.TextDocument
): Promise<{
    result: BUILD_RESULT;
	diagnostics: diagEntryType[];
	projectName?: string,
}> {
    let result: BUILD_RESULT = BUILD_RESULT.SUCCESS;

	const diagnostics: diagEntryType[] = [];
	
	let found = false;
	let cpath = "";
    while (path.length > 0 && !found) {
        path.pop();
        cpath = path.join(sep);
        if (!cpath) {
            break;
        }

        const tsconfig = join(cpath, "tsconfig.json");
        if (!lstatSync(cpath).isDirectory()) {
            continue;
        }

        if (!existsSync(tsconfig)) {
            continue;
		}

		found = true;
	}

	if (!found) {
		return {
			result: BUILD_RESULT.SKIP,
			diagnostics,
		};
	}

	const projectName = path.pop() as string;

	if (process[projectName]) {
		(process[projectName] as any).kill("SIGKILL");
		process[projectName] = null;
	}
	
	const output: string[] = await new Promise((resolve, reject) => {
		const output: string[] = [];

		const command = spawn("tsc", {
			cwd: cpath
		});

		process[projectName] = command;

		command.stdout.on("data", function(data: Buffer) {
			output.push(data.toString());
		});
		command.on("close", function(code, signal) {
			console.log("signal, ", signal);
			if (signal === "SIGKILL") {
				return resolve();
			}

			process[projectName] = null;
			return resolve(output);
		});
	});

	if (!output) {
		result = BUILD_RESULT.SKIP;
	} else {
		output.forEach(v => {
			const current = v.includes("warning")
				? BUILD_RESULT.WARNING
				: v.includes("error")
				? BUILD_RESULT.ERROR
				: BUILD_RESULT.SUCCESS;

			console.log(v);

			const diag = createDiagnostic(v, current);
			if (diag) {
				diagnostics.push(diag);
			}

			if (
				result !== BUILD_RESULT.ERROR &&
				current === BUILD_RESULT.WARNING
			) {
				result = BUILD_RESULT.WARNING;
			} else if (current === BUILD_RESULT.ERROR) {
				result = BUILD_RESULT.ERROR;
			}
		});
	}

    return {
		projectName,
        result,
        diagnostics
    };
}

async function build(
    fullFilePath: string,
    document: vscode.TextDocument,
    collection: vscode.DiagnosticCollection
) {
    const path = fullFilePath.split(sep);

    try {
        const { result, diagnostics, projectName } = await checkRecursive(path, document);
        switch (result) {
			case BUILD_RESULT.SUCCESS:
				vscode.window.showInformationMessage(
					projectName + ": Finished without issues"
				);
				break;
            case BUILD_RESULT.ERROR:
                vscode.window.showErrorMessage(
                    projectName + ": Failed to build ts because of errors!"
                );
                break;

            case BUILD_RESULT.WARNING:
                vscode.window.showWarningMessage(
                    projectName + ": Finished building ts with warnings!"
                );
				break;
			case BUILD_RESULT.SKIP: 
				console.log('Skipped');
				break;
		}
		if (result !== BUILD_RESULT.SKIP) {
			collection.clear();
			updateDiagnostics(document, collection, diagnostics);
		}
    } catch (ex) {
        console.log(ex);
        vscode.window.showErrorMessage("Failed to build");
    }
}

function processWarningDiagnostic(
    message: string,
    start: number,
    end: number,
    code: string
): vscode.Diagnostic {
    return {
        code,
        message: message,
        range: new vscode.Range(
            new vscode.Position(start - 1, end),
            new vscode.Position(start - 1, end)
        ),
        severity: vscode.DiagnosticSeverity.Error,
        source: "TSCompileOnSave",
        relatedInformation: []
    };
}

function processErrorDiagnostic(
    message: string,
    start: number,
    end: number,
    code: string
): vscode.Diagnostic {
    return {
        code,
        message: message,
        range: new vscode.Range(
            new vscode.Position(start - 1, end),
            new vscode.Position(start - 1, end)
        ),
        severity: vscode.DiagnosticSeverity.Warning,
        source: "TSCompileOnSave",
        relatedInformation: []
    };
}

function createDiagnostic(
    logMessage: string,
    tscError: BUILD_RESULT
): diagEntryType | undefined {
    const [fileInfo, errorCode, error] = logMessage.split(":");

    const value = fileInfo.match(/([\w\/.]*)\((\d+),(\d+)\)/);
    if (!value) {
        return;
    }

    const file = value[1];

    const nStart = parseInt(value[2]);
    const nEnd = parseInt(value[3]);

    let diagnostic: vscode.Diagnostic | undefined;
    switch (tscError) {
        case BUILD_RESULT.ERROR:
            diagnostic = processErrorDiagnostic(
                error.trim(),
                nStart,
                nEnd,
                errorCode
            );
        case BUILD_RESULT.WARNING:
            diagnostic = processWarningDiagnostic(
                error.trim(),
                nStart,
                nEnd,
                errorCode
            );
    }

    if (!diagnostic) {
        return;
    }

    return {
        file,
        diagnostic
    };
}

function updateDiagnostics(
    document: vscode.TextDocument,
    collection: vscode.DiagnosticCollection,
    diagnostics: diagEntryType[]
): void {
    if (document) {
        const mapped = mapValues(groupBy(diagnostics, "file"), clist =>
            clist.map(v => omit(v, "file"))
        );
        Object.keys(mapped).forEach(v => {
            const d = mapped[v].map(v => v.diagnostic);
            collection.set(vscode.Uri.file(v), d);
        });
    }
}

function matchesAPrefix (path: string, prefixes: string[]) {
    return prefixes.some(v => GlobToRegExp(v).test(path));
}

export function activate(context: vscode.ExtensionContext) {
    const collection = vscode.languages.createDiagnosticCollection("test");

    let disposable = vscode.commands.registerCommand("extension.build", () => {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            return;
        }

        build(
            activeEditor.document.fileName,
            activeEditor.document,
            collection
        );
    });

    vscode.workspace.onDidSaveTextDocument((e: vscode.TextDocument) => {
        const enabled = configuration.get<boolean>("enabled");
        console.log("enabled: ", enabled)
        if (!enabled) {
            return;
        }

        if (!BASE_PATH) {
            console.log("no base_path");
            return;
        }
        
        if (!e.fileName.endsWith(".ts")) {
            return;
        }

        const prefixes = configuration.get<string[]>("prefixes");
        console.log("prefixes: ", prefixes);
        const relativePath = e.fileName.replace(BASE_PATH + "/", "");
        console.log(relativePath);
        if (!prefixes || !matchesAPrefix(relativePath, prefixes)) {
            return;
        }




        build(e.fileName, e, collection);
    });

    context.subscriptions.push(disposable);
    context.subscriptions.push(collection);
}

export function deactivate() {}
