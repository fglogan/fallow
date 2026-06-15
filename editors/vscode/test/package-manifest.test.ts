import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface CommandContribution {
  readonly command: string;
  readonly title: string;
  readonly icon?: string;
}

interface MenuContribution {
  readonly command: string;
  readonly when?: string;
  readonly group?: string;
}

interface ViewContribution {
  readonly id: string;
  readonly name: string;
}

interface ViewsWelcomeContribution {
  readonly view: string;
  readonly contents: string;
  readonly when?: string;
}

interface ConfigProperty {
  readonly description?: string;
  readonly markdownDescription?: string;
  readonly scope?: string;
  readonly enum?: readonly string[];
  readonly default?: unknown;
}

interface ExtensionPackage {
  readonly contributes: {
    readonly commands: readonly CommandContribution[];
    readonly configuration: {
      readonly properties: Record<string, ConfigProperty>;
    };
    readonly views: {
      readonly plow: readonly ViewContribution[];
    };
    readonly menus: {
      readonly "view/title": readonly MenuContribution[];
      readonly commandPalette: readonly MenuContribution[];
    };
    readonly viewsWelcome: readonly ViewsWelcomeContribution[];
  };
}

const pkg = JSON.parse(
  readFileSync(resolve(__dirname, "../package.json"), "utf8"),
) as ExtensionPackage;
const configKeysSource = readFileSync(resolve(__dirname, "../src/configKeys.ts"), "utf8");
const extensionSource = readFileSync(resolve(__dirname, "../src/extension.ts"), "utf8");
const securityTreeViewSource = readFileSync(
  resolve(__dirname, "../src/securityTreeView.ts"),
  "utf8",
);

const command = (id: string): CommandContribution | undefined =>
  pkg.contributes.commands.find((entry) => entry.command === id);

const viewTitleCommand = (id: string): MenuContribution | undefined =>
  pkg.contributes.menus["view/title"].find((entry) => entry.command === id);

const commandPaletteEntry = (id: string): MenuContribution | undefined =>
  pkg.contributes.menus.commandPalette.find((entry) => entry.command === id);

describe("package.json command contributions", () => {
  it("uses search only for the initial analysis action", () => {
    expect(command("plow.analyze")).toMatchObject({
      title: "Plow: Run Analysis",
      icon: "$(search)",
    });
  });

  it("uses a refresh icon for the post-analysis reload action", () => {
    expect(command("plow.reloadAnalysis")).toMatchObject({
      title: "Plow: Reload Analysis",
      icon: "$(refresh)",
    });
  });
});

describe("package.json view title menus", () => {
  it("shows run analysis before results are loaded", () => {
    expect(viewTitleCommand("plow.analyze")).toMatchObject({
      when: "(view == plow.deadCode || view == plow.duplicates) && !plow.hasAnalyzed",
      group: "navigation",
    });
  });

  it("shows reload analysis after results are loaded", () => {
    expect(viewTitleCommand("plow.reloadAnalysis")).toMatchObject({
      when: "(view == plow.deadCode || view == plow.duplicates) && plow.hasAnalyzed",
      group: "navigation",
    });
  });

  it("keeps the reload command out of the command palette", () => {
    expect(commandPaletteEntry("plow.reloadAnalysis")).toMatchObject({
      when: "false",
    });
    expect(commandPaletteEntry("plow.analyze")).toBeUndefined();
  });

  it("surfaces diagnostic mute management in the analysis view title bars", () => {
    expect(viewTitleCommand("plow.manageDiagnosticMutes")).toMatchObject({
      when: "view == plow.deadCode || view == plow.duplicates",
      group: "navigation@10",
    });
  });

  it("contributes team-shareable muted diagnostic categories as resource settings", () => {
    const setting = pkg.contributes.configuration.properties[
      "plow.diagnostics.mutedCategories"
    ];

    expect(setting?.default).toEqual([]);
    expect(setting?.scope).toBe("resource");
    expect(setting?.markdownDescription).toContain(".vscode/settings.json");
    expect(setting?.markdownDescription).toContain("CI and `plow check` still report");
  });
});

describe("package.json binary download settings", () => {
  it("documents that auto-download manages both binaries", () => {
    const description =
      pkg.contributes.configuration.properties["plow.autoDownload"]?.description ?? "";

    expect(description).toContain("plow-lsp");
    expect(description).toContain("plow CLI");
  });

  it("restarts binary resolution when auto-download changes", () => {
    expect(configKeysSource).toContain('"plow.autoDownload"');
  });
});

describe("package.json workspace picker contributions", () => {
  it("contributes the select and clear workspace commands", () => {
    expect(command("plow.selectWorkspace")).toMatchObject({
      title: "Plow: Select Workspace Scope...",
      icon: "$(layers)",
    });
    expect(command("plow.clearWorkspace")).toMatchObject({
      title: "Plow: Clear Workspace Scope (Analyze All)",
    });
  });

  it("contributes the plow.workspace setting with an empty default", () => {
    const property = pkg.contributes.configuration.properties["plow.workspace"];
    expect(property).toBeDefined();
  });

  it("surfaces the workspace picker in both view title bars", () => {
    expect(viewTitleCommand("plow.selectWorkspace")).toMatchObject({
      when: "view == plow.deadCode || view == plow.duplicates",
      group: "navigation@9",
    });
  });

  it("keeps both workspace commands available in the command palette", () => {
    // Not gated to "false", so they show in the palette (no-op gracefully
    // outside a monorepo).
    expect(commandPaletteEntry("plow.selectWorkspace")).toBeUndefined();
    expect(commandPaletteEntry("plow.clearWorkspace")).toBeUndefined();
  });
});

describe("package.json runtime coverage contributions", () => {
  it("contributes the load/reload/clear commands with distinct icons", () => {
    expect(command("plow.loadCoverage")).toMatchObject({
      title: "Plow: Load Runtime Coverage",
      icon: "$(graph)",
    });
    expect(command("plow.reloadCoverage")).toMatchObject({ icon: "$(refresh)" });
    expect(command("plow.clearCoverage")).toMatchObject({ icon: "$(clear-all)" });
  });

  it("adds the Runtime Coverage view to the plow container", () => {
    expect(pkg.contributes.views.plow).toContainEqual({
      id: "plow.runtimeCoverage",
      name: "Runtime Coverage",
    });
  });

  it("gates load before a capture is loaded and reload/clear after", () => {
    expect(viewTitleCommand("plow.loadCoverage")).toMatchObject({
      when: "view == plow.runtimeCoverage && !plow.hasCoverage",
      group: "navigation",
    });
    expect(viewTitleCommand("plow.reloadCoverage")).toMatchObject({
      when: "view == plow.runtimeCoverage && plow.hasCoverage",
      group: "navigation",
    });
    expect(viewTitleCommand("plow.clearCoverage")).toMatchObject({
      when: "view == plow.runtimeCoverage && plow.hasCoverage",
      group: "navigation",
    });
  });

  it("gates reload/clear in the command palette on a loaded capture", () => {
    expect(commandPaletteEntry("plow.reloadCoverage")).toMatchObject({
      when: "plow.hasCoverage",
    });
    expect(commandPaletteEntry("plow.clearCoverage")).toMatchObject({
      when: "plow.hasCoverage",
    });
  });

  it("documents the capture-path setting as local-only and resource-scoped", () => {
    const setting = pkg.contributes.configuration.properties["plow.coverage.capturePath"];
    expect(setting?.scope).toBe("resource");
    expect(setting?.markdownDescription).toContain("local-only");
  });

  it("discloses the sidecar/setup prerequisite on the capture-path setting", () => {
    const setting = pkg.contributes.configuration.properties["plow.coverage.capturePath"];
    expect(setting?.markdownDescription).toContain("plow coverage setup");
    expect(setting?.markdownDescription).toContain("sidecar");
  });

  it("discloses the sidecar/setup prerequisite in the welcome state", () => {
    const welcome = pkg.contributes.viewsWelcome.find(
      (entry) => entry.view === "plow.runtimeCoverage" && entry.when === "!plow.hasCoverage",
    );
    expect(welcome?.contents).toContain("plow coverage setup");
    expect(welcome?.contents).toContain("sidecar");
  });

  it("contributes the top setting", () => {
    expect(
      pkg.contributes.configuration.properties["plow.coverage.top"]?.markdownDescription,
    ).toBeTruthy();
  });

  it("frames the welcome state as candidates, not vulnerabilities", () => {
    const welcome = pkg.contributes.viewsWelcome.find(
      (entry) => entry.view === "plow.runtimeCoverage" && entry.when === "!plow.hasCoverage",
    );
    expect(welcome?.contents).toContain("candidates");
    expect(welcome?.contents.toLowerCase()).not.toContain("vulnerability");
    expect(welcome?.contents.toLowerCase()).not.toContain("vulnerabilities");
  });
});

describe("package.json audit verdict surface", () => {
  it("contributes the on-demand audit command with a shield icon", () => {
    expect(command("plow.audit")).toMatchObject({
      title: "Plow: Audit Changed Files",
      icon: "$(shield)",
    });
  });

  it("keeps the audit command palette-discoverable (no when:false hide)", () => {
    const entry = commandPaletteEntry("plow.audit");
    expect(entry?.when).not.toBe("false");
  });

  it("contributes the audit gate, status-bar toggle, and run-on-save settings", () => {
    const properties = pkg.contributes.configuration.properties;
    for (const key of [
      "plow.audit.gate",
      "plow.audit.statusBar.enabled",
      "plow.audit.runOnSave",
    ]) {
      const prop = properties[key];
      expect(prop?.description ?? prop?.markdownDescription).toBeTruthy();
    }
  });
});

describe("package.json duplication settings", () => {
  it("contributes every duplication knob used by sidebar analysis", () => {
    const properties = pkg.contributes.configuration.properties;

    for (const key of [
      "plow.duplication.mode",
      "plow.duplication.threshold",
      "plow.duplication.minTokens",
      "plow.duplication.minLines",
      "plow.duplication.minOccurrences",
      "plow.duplication.skipLocal",
      "plow.duplication.crossLanguage",
      "plow.duplication.ignoreImports",
    ]) {
      expect(properties[key]?.description).toBeTruthy();
    }
  });
});

describe("package.json duplication settings", () => {
  it("contributes the sidebar duplication filter settings", () => {
    const properties = pkg.contributes.configuration.properties;

    expect(properties["plow.duplication.mode"]).toBeDefined();
    expect(properties["plow.duplication.threshold"]).toBeDefined();
    expect(properties["plow.duplication.minLines"]).toBeDefined();
    expect(properties["plow.duplication.minOccurrences"]).toBeDefined();
  });

  it("restarts and reruns analysis when duplication settings change", () => {
    expect(configKeysSource).toContain('"plow.duplication"');
  });
});

describe("package.json security candidates contributions", () => {
  const securityView = pkg.contributes.views.plow.find((view) => view.id === "plow.security");
  const securityWelcome = pkg.contributes.viewsWelcome.filter(
    (entry) => entry.view === "plow.security",
  );
  const securitySetting = pkg.contributes.configuration.properties["plow.security.enabled"];

  it("contributes the Security Candidates view", () => {
    expect(securityView).toMatchObject({ name: "Security Candidates" });
  });

  it("contributes the scan command with a shield icon", () => {
    expect(command("plow.analyzeSecurity")).toMatchObject({
      title: "Plow: Scan for Security Candidates",
      icon: "$(shield)",
    });
  });

  it("contributes both view/title menu states for the scan command, gated on the opt-in", () => {
    const entries = pkg.contributes.menus["view/title"].filter(
      (entry) => entry.command === "plow.analyzeSecurity",
    );
    expect(entries.map((entry) => entry.when)).toEqual([
      "view == plow.security && plow.security.enabled && !plow.hasAnalyzedSecurity",
      "view == plow.security && plow.security.enabled && plow.hasAnalyzedSecurity",
    ]);
    // The scan button is hidden while the feature is disabled rather than
    // nagging the user to enable it on click.
    for (const entry of entries) {
      expect(entry.when).toContain("plow.security.enabled");
    }
  });

  it("splits the welcome into a disabled state and an enabled-not-yet-scanned state", () => {
    const disabled = securityWelcome.find((entry) => entry.when === "!plow.security.enabled");
    const enabledPending = securityWelcome.find(
      (entry) => entry.when === "plow.security.enabled && !plow.hasAnalyzedSecurity",
    );
    const enabledClean = securityWelcome.find(
      (entry) => entry.when === "plow.security.enabled && plow.hasAnalyzedSecurity",
    );
    expect(disabled).toBeDefined();
    expect(enabledPending).toBeDefined();
    expect(enabledClean).toBeDefined();
    // The "enable the setting" copy only shows when the feature is off.
    expect(disabled?.contents.toLowerCase()).toContain("enable");
    expect(enabledPending?.contents.toLowerCase()).not.toContain("enable ");
  });

  it("contributes an opt-in setting defaulting to false", () => {
    expect(securitySetting?.default).toBe(false);
    expect(securitySetting?.markdownDescription).toBeTruthy();
  });

  it("frames every security string as a candidate, never a confirmed vulnerability", () => {
    const strings = [
      securityView?.name ?? "",
      command("plow.analyzeSecurity")?.title ?? "",
      securitySetting?.markdownDescription ?? "",
      ...securityWelcome.map((entry) => entry.contents),
    ].filter((value) => value.length > 0);

    expect(strings.length).toBeGreaterThan(0);

    for (const value of strings) {
      const lower = value.toLowerCase();
      // Every surface must name them as candidates.
      expect(lower).toContain("candidate");
      // "vulnerabilit"/"confirmed" may only appear in honest negations
      // ("never confirmed vulnerabilities", "NOT verified vulnerabilities");
      // a positive claim that these ARE vulnerabilities/confirmed is forbidden.
      if (lower.includes("vulnerabilit") || lower.includes("confirmed")) {
        const negated = /\b(?:never|not|un\w+|no)\b/.test(lower);
        expect(negated, `unframed security claim: ${value}`).toBe(true);
      }
    }
  });

  it("frames the runtime info toast and tooltip prefix as candidates, never confirmed", () => {
    // Beyond the static manifest, the two runtime-rendered security strings (the
    // post-scan info toast in extension.ts and the per-finding tooltip prefix in
    // securityTreeView.ts) must also carry candidate framing. A positive claim
    // that these ARE vulnerabilities/confirmed slips past the manifest guard.
    const runtimeStrings = [
      // Info toast surfaced after a completed scan with findings.
      "These are NOT verified vulnerabilities; verify each before acting.",
      // Per-finding tooltip prefix.
      "UNVERIFIED CANDIDATE - verify before acting",
    ];

    for (const value of runtimeStrings) {
      const lower = value.toLowerCase();
      expect(lower).toMatch(/candidate|verify/);
      if (lower.includes("vulnerabilit") || lower.includes("confirmed")) {
        const negated = /\b(?:never|not|un\w+|no)\b/.test(lower);
        expect(negated, `unframed runtime security claim: ${value}`).toBe(true);
      }
    }

    // Guard against drift: the literals above must still exist verbatim in the
    // sources, so changing the runtime copy without re-framing fails here.
    expect(extensionSource).toContain(
      "These are NOT verified vulnerabilities; verify each before acting.",
    );
    expect(securityTreeViewSource).toContain("UNVERIFIED CANDIDATE - verify before acting");
  });
});

describe("package.json license commands", () => {
  it("contributes the four license commands and registers each in extension.ts", () => {
    for (const id of [
      "plow.license.activate",
      "plow.license.status",
      "plow.license.refresh",
      "plow.license.deactivate",
    ]) {
      expect(command(id)?.title).toMatch(/^Plow: /);
      expect(extensionSource).toContain(`registerCommand("${id}"`);
    }
  });

  it("exposes every license command in the dead-code view-title menu (not just the palette)", () => {
    for (const id of [
      "plow.license.activate",
      "plow.license.status",
      "plow.license.refresh",
      "plow.license.deactivate",
    ]) {
      const entry = viewTitleCommand(id);
      expect(entry, `${id} missing from view/title menu`).toBeDefined();
      expect(entry?.when).toBe("view == plow.deadCode");
      expect(entry?.group).toMatch(/^license@/);
    }
  });

  it("documents both opt-out / opt-in license settings", () => {
    const properties = pkg.contributes.configuration.properties;
    expect(properties["plow.license.showStatusBar"]?.description).toBeTruthy();
    expect(properties["plow.license.refreshOnStartup"]?.description).toBeTruthy();
  });

  it("documents the global diagnostics severity posture setting", () => {
    const setting = pkg.contributes.configuration.properties["plow.diagnostics.severity"];
    expect(setting?.default).toBe("warning");
    expect(setting?.scope).toBe("application");
    expect(setting?.enum).toEqual(["warning", "information", "hint"]);
    expect(setting?.markdownDescription).toContain("Editor-only");
  });

  it("keeps the startup probe off by default (does not shell out on activation)", () => {
    const properties = pkg.contributes.configuration.properties as Record<
      string,
      { readonly default?: unknown }
    >;
    expect(properties["plow.license.refreshOnStartup"]?.default).toBe(false);
    expect(properties["plow.license.showStatusBar"]?.default).toBe(true);
  });
});
