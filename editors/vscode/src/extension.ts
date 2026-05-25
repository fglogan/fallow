// VS Code injects this module into the extension host at runtime.
// plow-ignore-next-line unlisted-dependency
import * as vscode from "vscode";
import { countCheckIssues } from "./analysis-utils.js";
import { startClient, stopClient, restartClient } from "./client.js";
import { onConfigChange } from "./config.js";
import { runAnalysis, runFix } from "./commands.js";
import { DiagnosticFilter } from "./diagnosticFilter.js";
import { registerDiagnosticMuteUi } from "./diagnosticMute.js";
import {
  createStatusBar,
  updateStatusBar,
  updateStatusBarFromLsp,
  setStatusBarAnalyzing,
  setStatusBarError,
  disposeStatusBar,
} from "./statusBar.js";
import type { AnalysisCompleteParams } from "./statusBar.js";
import { DeadCodeTreeProvider, DuplicatesTreeProvider } from "./treeView.js";
import type { PlowCheckResult, PlowDupesResult } from "./types.js";

let outputChannel: vscode.OutputChannel;
let lastCheckResult: PlowCheckResult | null = null;
let lastDupesResult: PlowDupesResult | null = null;

export interface ExtensionApi {
  readonly runAnalysis: typeof runAnalysis;
  readonly runFix: typeof runFix;
}

export const activate = async (context: vscode.ExtensionContext): Promise<ExtensionApi> => {
  outputChannel = vscode.window.createOutputChannel("Plow");
  context.subscriptions.push(outputChannel);

  const statusBar = createStatusBar();
  context.subscriptions.push(statusBar);

  const diagnosticFilter = new DiagnosticFilter(context.workspaceState);
  context.subscriptions.push({ dispose: () => diagnosticFilter.dispose() });
  registerDiagnosticMuteUi(context, diagnosticFilter);

  const deadCodeProvider = new DeadCodeTreeProvider();
  const duplicatesProvider = new DuplicatesTreeProvider();

  // Use createTreeView to get visibility events — defer CLI analysis until the
  // tree view is first shown, avoiding a double analysis on activation (the LSP
  // runs its own analysis for diagnostics).
  let cliAnalysisRan = false;

  const triggerCliAnalysis = async (): Promise<void> => {
    setStatusBarAnalyzing();
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Plow: Analyzing...",
        cancellable: false,
      },
      async () => {
        try {
          const { check, dupes } = await runAnalysis(context);
          lastCheckResult = check;
          lastDupesResult = dupes;
          updateViews();
          void vscode.commands.executeCommand("setContext", "plow.hasAnalyzed", true);

          const issueCount = countCheckIssues(check);

          if (issueCount > 0) {
            void vscode.window
              .showInformationMessage(
                `Plow: found ${issueCount} issue${issueCount === 1 ? "" : "s"}. Open the Plow sidebar to explore.`,
                "Open Sidebar",
              )
              .then((choice) => {
                if (choice === "Open Sidebar") {
                  void vscode.commands.executeCommand("plow.deadCode.focus");
                }
                return undefined;
              });
          } else {
            void vscode.window.showInformationMessage("Plow: no issues found.");
          }
        } catch {
          setStatusBarError();
        }
      },
    );
  };

  const deadCodeView = vscode.window.createTreeView("plow.deadCode", {
    treeDataProvider: deadCodeProvider,
  });
  deadCodeProvider.setView(deadCodeView);
  const duplicatesView = vscode.window.createTreeView("plow.duplicates", {
    treeDataProvider: duplicatesProvider,
  });
  context.subscriptions.push(deadCodeView, duplicatesView);

  const onViewVisible = (): void => {
    if (cliAnalysisRan) {
      return;
    }
    cliAnalysisRan = true;
    void triggerCliAnalysis();
  };

  context.subscriptions.push(
    deadCodeView.onDidChangeVisibility((e) => {
      if (e.visible) {
        onViewVisible();
      }
    }),
  );
  context.subscriptions.push(
    duplicatesView.onDidChangeVisibility((e) => {
      if (e.visible) {
        onViewVisible();
      }
    }),
  );

  const updateViews = (): void => {
    deadCodeProvider.update(lastCheckResult);
    duplicatesProvider.update(lastDupesResult);
    updateStatusBar(lastCheckResult, lastDupesResult);
  };

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("plow.analyze", async () => {
      cliAnalysisRan = true;
      await triggerCliAnalysis();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("plow.fix", async () => {
      // Save dirty editors first so the fix works on up-to-date content
      await vscode.workspace.saveAll(false);
      await runFix(context, false);
      // Restart LSP to force fresh analysis — the fix modified files on disk
      // bypassing VS Code's editor, so did_save never fires for those files
      await restartClient(context, outputChannel, diagnosticFilter);
      // Re-run CLI analysis for tree views
      cliAnalysisRan = true;
      await triggerCliAnalysis();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("plow.fixDryRun", async () => {
      await runFix(context, true);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("plow.restart", async () => {
      outputChannel.appendLine("Restarting language server...");
      await restartClient(context, outputChannel, diagnosticFilter);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("plow.showOutput", () => {
      outputChannel.show();
    }),
  );

  // Open the Plow sidebar (used by walkthrough completion event)
  context.subscriptions.push(
    vscode.commands.registerCommand("plow.openSidebar", () => {
      void vscode.commands.executeCommand("plow.deadCode.focus");
    }),
  );

  // Open Plow settings (used by walkthrough completion event)
  context.subscriptions.push(
    vscode.commands.registerCommand("plow.openSettings", () => {
      void vscode.commands.executeCommand("workbench.action.openSettings", "plow");
    }),
  );

  // Fallback command for Code Lens items with 0 references (display-only)
  context.subscriptions.push(vscode.commands.registerCommand("plow.noop", () => {}));

  // Watch for config changes
  context.subscriptions.push(
    onConfigChange(async (e) => {
      const needsRestart =
        e.affectsConfiguration("plow.lspPath") ||
        e.affectsConfiguration("plow.configPath") ||
        e.affectsConfiguration("plow.trace.server") ||
        e.affectsConfiguration("plow.issueTypes") ||
        e.affectsConfiguration("plow.changedSince");

      const needsReanalysis =
        e.affectsConfiguration("plow.configPath") ||
        e.affectsConfiguration("plow.production") ||
        e.affectsConfiguration("plow.duplication") ||
        e.affectsConfiguration("plow.issueTypes") ||
        e.affectsConfiguration("plow.changedSince");

      if (needsRestart) {
        outputChannel.appendLine("Configuration changed, restarting server...");
        await restartClient(context, outputChannel, diagnosticFilter);
      }

      if (needsReanalysis) {
        // Re-run CLI analysis for tree views and status bar
        // (sequenced after LSP restart if both apply)
        void triggerCliAnalysis();
      }
    }),
  );

  // Start LSP client
  const client = await startClient(context, outputChannel, diagnosticFilter);
  if (client) {
    context.subscriptions.push({ dispose: () => void stopClient() });

    // Handle custom LSP notification: update status bar from LSP data
    // so the extension shows results immediately without waiting for CLI
    const notificationDisposable = client.onNotification(
      "plow/analysisComplete",
      (params: AnalysisCompleteParams) => {
        updateStatusBarFromLsp(params);
        void vscode.commands.executeCommand("setContext", "plow.hasAnalyzed", true);
      },
    );
    context.subscriptions.push(notificationDisposable);
  }

  // Show walkthrough on first install
  const walkthroughShown = context.globalState.get<boolean>("plow.walkthroughShown");
  if (!walkthroughShown) {
    void context.globalState.update("plow.walkthroughShown", true);
    void vscode.commands.executeCommand(
      "workbench.action.openWalkthrough",
      "plow-rs.plow-vscode#plow.gettingStarted",
      false,
    );
  }

  return {
    runAnalysis,
    runFix,
  };
};

export const deactivate = async (): Promise<void> => {
  disposeStatusBar();
  await stopClient();
};
