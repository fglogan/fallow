import * as child_process from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
// VS Code injects this module into the extension host at runtime.
// plow-ignore-next-line unlisted-dependency
import * as vscode from "vscode";
import {
  getLspPath,
  getProduction,
  getDuplicationMode,
  getDuplicationThreshold,
  getIssueTypes,
  getChangedSince,
  getResolvedConfigPath,
} from "./config.js";
import { countCheckIssues } from "./analysis-utils.js";
import { findBinaryInPath, findLocalBinary, getExecutableExtension } from "./binary-utils.js";
import { getInstalledCliPath } from "./download.js";
import { buildFixArgs, createFixPreviewItems, resolveFixLocation } from "./fix-utils.js";
import type {
  PlowCheckResult,
  PlowCombinedResult,
  PlowDupesResult,
  PlowFixResult,
  FixAction,
} from "./types.js";

const findCliBinary = (context: vscode.ExtensionContext): string | null => {
  const lspPath = getLspPath();
  if (lspPath) {
    const dir = path.dirname(lspPath);
    const cliPath = path.join(dir, `plow${getExecutableExtension()}`);
    if (fs.existsSync(cliPath)) {
      return cliPath;
    }
  }

  const local = findLocalBinary("plow");
  if (local) {
    return local;
  }

  const inPath = findBinaryInPath("plow");
  if (inPath) {
    return inPath;
  }

  const installed = getInstalledCliPath(context);
  if (installed) {
    return installed;
  }

  return null;
};

const execPlow = (
  context: vscode.ExtensionContext,
  args: ReadonlyArray<string>,
  cwd: string,
): Promise<string> =>
  new Promise((resolve, reject) => {
    const binary = findCliBinary(context);
    if (!binary) {
      reject(new Error("plow CLI binary not found in PATH."));
      return;
    }

    const child = child_process.spawn(binary, [...args], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });

    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code, signal) => {
      if (signal) {
        reject(new Error(`plow exited via signal ${signal}`));
        return;
      }

      if (code !== null && code !== 0 && code !== 1) {
        reject(new Error(stderr.trim() || `plow exited with code ${code}`));
        return;
      }

      resolve(stdout);
    });
  });

/** Filter check results based on the user's issueTypes configuration. */
const filterCheckResult = (result: PlowCheckResult): PlowCheckResult => {
  const types = getIssueTypes();
  const filtered: PlowCheckResult = {
    ...result,
    unused_files: types["unused-files"] ? result.unused_files : [],
    unused_exports: types["unused-exports"] ? result.unused_exports : [],
    unused_types: types["unused-types"] ? result.unused_types : [],
    private_type_leaks: types["private-type-leaks"] ? result.private_type_leaks : [],
    unused_dependencies: types["unused-dependencies"] ? result.unused_dependencies : [],
    unused_dev_dependencies: types["unused-dev-dependencies"] ? result.unused_dev_dependencies : [],
    unused_optional_dependencies: types["unused-optional-dependencies"]
      ? result.unused_optional_dependencies
      : [],
    unused_enum_members: types["unused-enum-members"] ? result.unused_enum_members : [],
    unused_class_members: types["unused-class-members"] ? result.unused_class_members : [],
    unresolved_imports: types["unresolved-imports"] ? result.unresolved_imports : [],
    unlisted_dependencies: types["unlisted-dependencies"] ? result.unlisted_dependencies : [],
    duplicate_exports: types["duplicate-exports"] ? result.duplicate_exports : [],
    type_only_dependencies: types["type-only-dependencies"] ? result.type_only_dependencies : [],
    test_only_dependencies: types["test-only-dependencies"] ? result.test_only_dependencies : [],
    circular_dependencies: types["circular-dependencies"] ? result.circular_dependencies : [],
    re_export_cycles: types["re-export-cycles"] ? result.re_export_cycles : [],
    boundary_violations: types["boundary-violation"] ? result.boundary_violations : [],
    stale_suppressions: types["stale-suppressions"] ? result.stale_suppressions : [],
    unused_catalog_entries: types["unused-catalog-entries"] ? result.unused_catalog_entries : [],
    unresolved_catalog_references: types["unresolved-catalog-references"]
      ? result.unresolved_catalog_references
      : [],
    unused_dependency_overrides: types["unused-dependency-overrides"]
      ? result.unused_dependency_overrides
      : [],
    misconfigured_dependency_overrides: types["misconfigured-dependency-overrides"]
      ? result.misconfigured_dependency_overrides
      : [],
  };
  const totalIssues = countCheckIssues(filtered);
  const summary = {
    total_issues: totalIssues,
    unused_files: filtered.unused_files.length,
    unused_exports: filtered.unused_exports.length,
    unused_types: filtered.unused_types.length,
    private_type_leaks: filtered.private_type_leaks?.length ?? 0,
    unused_dependencies:
      filtered.unused_dependencies.length +
      filtered.unused_dev_dependencies.length +
      (filtered.unused_optional_dependencies?.length ?? 0),
    unused_enum_members: filtered.unused_enum_members.length,
    unused_class_members: filtered.unused_class_members.length,
    unresolved_imports: filtered.unresolved_imports.length,
    unlisted_dependencies: filtered.unlisted_dependencies.length,
    duplicate_exports: filtered.duplicate_exports.length,
    type_only_dependencies: filtered.type_only_dependencies?.length ?? 0,
    test_only_dependencies: filtered.test_only_dependencies?.length ?? 0,
    circular_dependencies: filtered.circular_dependencies?.length ?? 0,
    re_export_cycles: filtered.re_export_cycles?.length ?? 0,
    boundary_violations: filtered.boundary_violations?.length ?? 0,
    stale_suppressions: filtered.stale_suppressions?.length ?? 0,
    unused_catalog_entries: filtered.unused_catalog_entries?.length ?? 0,
    empty_catalog_groups: filtered.empty_catalog_groups?.length ?? 0,
    unresolved_catalog_references: filtered.unresolved_catalog_references?.length ?? 0,
    unused_dependency_overrides: filtered.unused_dependency_overrides?.length ?? 0,
    misconfigured_dependency_overrides: filtered.misconfigured_dependency_overrides?.length ?? 0,
  };
  return {
    ...filtered,
    total_issues: totalIssues,
    summary,
  };
};

const getWorkspaceRoot = (): string | null => {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return null;
  }
  return folders[0].uri.fsPath;
};

interface FixQuickPickItem extends vscode.QuickPickItem {
  readonly action: "navigate" | "apply-all";
  readonly fix?: FixAction;
}

const confirmApplyFixes = async (): Promise<boolean> => {
  const confirm = await vscode.window.showWarningMessage(
    "Plow: This will unexport unused exports (keeps the code) and remove unused dependencies from package.json. Continue?",
    "Yes",
    "No",
  );

  return confirm === "Yes";
};

const openFixLocation = async (root: string, fix: FixAction | undefined): Promise<void> => {
  if (!fix) {
    return;
  }

  const location = resolveFixLocation(root, fix);
  if (!location) {
    return;
  }

  await vscode.window.showTextDocument(vscode.Uri.file(location.absolutePath), {
    selection: new vscode.Range(location.line, 0, location.line, 0),
  });
};

const showDryRunPreview = async (root: string, result: PlowFixResult): Promise<void> => {
  if (result.fixes.length === 0) {
    void vscode.window.showInformationMessage("Plow: no fixes available.");
    return;
  }

  const quickPickItems: FixQuickPickItem[] = [];
  for (const item of createFixPreviewItems(result.fixes)) {
    if (item.action === "apply-all") {
      quickPickItems.push({
        label: "",
        kind: vscode.QuickPickItemKind.Separator,
        action: "navigate",
      });
      quickPickItems.push({
        label: "$(play) Apply all fixes",
        description: item.description,
        action: item.action,
      });
      continue;
    }

    quickPickItems.push({
      label: `$(wrench) ${item.label}`,
      description: item.description,
      detail: item.detail,
      action: item.action,
      fix: item.fix,
    });
  }

  const picked = await vscode.window.showQuickPick(quickPickItems, {
    title: `Plow: ${result.fixes.length} fix${result.fixes.length === 1 ? "" : "es"} available`,
    placeHolder: "Review fixes — select 'Apply all fixes' to apply, or click a fix to navigate",
  });

  if (!picked) {
    return;
  }

  if (picked.action === "apply-all") {
    void vscode.commands.executeCommand("plow.fix");
    return;
  }

  await openFixLocation(root, picked.fix);
};

export const runAnalysis = async (
  context: vscode.ExtensionContext,
): Promise<{
  check: PlowCheckResult | null;
  dupes: PlowDupesResult | null;
}> => {
  const root = getWorkspaceRoot();
  if (!root) {
    void vscode.window.showWarningMessage("Plow: no workspace folder open.");
    return { check: null, dupes: null };
  }

  let check: PlowCheckResult | null = null;
  let dupes: PlowDupesResult | null = null;

  try {
    const analysisArgs = ["--format", "json", "--quiet", "--skip", "health"];
    if (getProduction()) {
      analysisArgs.push("--production");
    }

    const changedSince = getChangedSince();
    if (changedSince) {
      analysisArgs.push("--changed-since", changedSince);
    }

    const configPath = getResolvedConfigPath();
    if (configPath) {
      analysisArgs.push("--config", configPath);
    }

    analysisArgs.push("--dupes-mode", getDuplicationMode());
    analysisArgs.push("--dupes-threshold", String(getDuplicationThreshold()));

    const output = await execPlow(context, analysisArgs, root);

    if (output.trim().length === 0) {
      // execPlow already rejects on non-zero exit codes (other than 0/1);
      // an empty stdout on a successful exit means there was nothing to
      // report. Leave check/dupes null and return without raising.
      return { check, dupes };
    }

    const result = JSON.parse(output) as PlowCombinedResult;
    check = result.check ? filterCheckResult(result.check) : null;
    dupes = result.dupes ?? null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    void vscode.window.showErrorMessage(`Plow analysis failed: ${message}`);
    throw err;
  }

  return { check, dupes };
};

export const runFix = async (
  context: vscode.ExtensionContext,
  dryRun: boolean,
): Promise<PlowFixResult | null> => {
  const root = getWorkspaceRoot();
  if (!root) {
    void vscode.window.showWarningMessage("Plow: no workspace folder open.");
    return null;
  }

  if (!dryRun && !(await confirmApplyFixes())) {
    return null;
  }

  try {
    const fixArgs = buildFixArgs(dryRun, getProduction());
    const configPath = getResolvedConfigPath();
    if (configPath) {
      fixArgs.push("--config", configPath);
    }

    const output = await execPlow(context, fixArgs, root);
    const result = JSON.parse(output) as PlowFixResult;

    if (dryRun) {
      await showDryRunPreview(root, result);
    } else {
      const fixCount = result.fixes.length;
      void vscode.window.showInformationMessage(
        `Plow: applied ${fixCount} fix${fixCount === 1 ? "" : "es"}.`,
      );
    }

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    void vscode.window.showErrorMessage(`Plow fix failed: ${message}`);
    return null;
  }
};
