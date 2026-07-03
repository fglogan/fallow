import { posix as posixPath, win32 as win32Path } from "node:path";
import { describe, expect, it, vi, beforeEach } from "vitest";

// Mocked OS so the resolver can be exercised deterministically for win32 and
// linux from a darwin host (the real failure platforms in issue #1359).
let mockPlatform: NodeJS.Platform = "linux";
let mockArch = "x64";

// Mocked filesystem: `mockExistsSync` decides which candidate paths "exist",
// and `mockDirs` marks which of those are directories (for lspPath dir support).
let mockExistsSync: (p: string) => boolean = () => false;
let mockDirs: ReadonlySet<string> = new Set();

vi.mock("node:os", () => ({
  platform: () => mockPlatform,
  arch: () => mockArch,
}));

vi.mock("node:fs", () => ({
  existsSync: (p: string) => mockExistsSync(p),
  statSync: (p: string) => ({ isDirectory: () => mockDirs.has(p) }),
}));

// `node:path` resolves separators per the HOST os, but the resolver under test
// runs on the user's real platform. To exercise Windows backslash handling from
// a POSIX CI host, delegate to `path.win32` / `path.posix` based on
// `mockPlatform`. `path` is used here only via the named members the source
// imports (`join`, `dirname`, `basename`, `extname`, `delimiter`).
vi.mock("node:path", async () => {
  const actual = await vi.importActual<typeof import("node:path")>("node:path");
  const select = (): typeof import("node:path") =>
    mockPlatform === "win32" ? actual.win32 : actual.posix;
  return {
    // Re-export the real flavors so the test's own path helper can pick the
    // matching one explicitly.
    win32: actual.win32,
    posix: actual.posix,
    join: (...segments: string[]) => select().join(...segments),
    dirname: (p: string) => select().dirname(p),
    basename: (p: string, ext?: string) => select().basename(p, ext),
    extname: (p: string) => select().extname(p),
    get delimiter() {
      return select().delimiter;
    },
  };
});

vi.mock("vscode", () => ({
  workspace: {
    workspaceFolders: undefined as Array<{ uri: { fsPath: string } }> | undefined,
  },
}));

import * as vscode from "vscode";
import {
  findBinaryInPath,
  findLocalBinary,
  findNativeInNodeModules,
  getExecutableExtension,
  platformPackageNames,
  resolveConfiguredBinaryPath,
} from "../src/binary-utils.js";

/** The path flavor matching the currently mocked platform (mirrors the source). */
const path = (): typeof posixPath => (mockPlatform === "win32" ? win32Path : posixPath);

const setWorkspace = (root: string | null): void => {
  (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = root
    ? [{ uri: { fsPath: root } }]
    : undefined;
};

/** A node_modules path for the real native binary under a platform package. */
const nativePath = (root: string, pkg: string, name: string, ext: string): string =>
  path().join(root, "node_modules", ...pkg.split("/"), `${name}${ext}`);

beforeEach(() => {
  mockPlatform = "linux";
  mockArch = "x64";
  mockExistsSync = () => false;
  mockDirs = new Set();
  setWorkspace(null);
});

describe("getExecutableExtension", () => {
  it("is .exe on win32 and empty elsewhere", () => {
    mockPlatform = "win32";
    expect(getExecutableExtension()).toBe(".exe");
    mockPlatform = "linux";
    expect(getExecutableExtension()).toBe("");
    mockPlatform = "darwin";
    expect(getExecutableExtension()).toBe("");
  });
});

describe("platformPackageNames", () => {
  it("maps win32 x64/arm64 to the msvc packages", () => {
    expect(platformPackageNames("win32", "x64")).toEqual(["@plow-cli/win32-x64-msvc"]);
    expect(platformPackageNames("win32", "arm64")).toEqual(["@plow-cli/win32-arm64-msvc"]);
  });

  it("returns both gnu and musl on linux (libc not detected here)", () => {
    expect(platformPackageNames("linux", "x64")).toEqual([
      "@plow-cli/linux-x64-gnu",
      "@plow-cli/linux-x64-musl",
    ]);
  });

  it("maps darwin arches", () => {
    expect(platformPackageNames("darwin", "arm64")).toEqual(["@plow-cli/darwin-arm64"]);
  });

  it("returns empty for unsupported platform/arch", () => {
    expect(platformPackageNames("win32", "ia32")).toEqual([]);
    expect(platformPackageNames("aix", "x64")).toEqual([]);
  });
});

describe("findLocalBinary - win32 (issue #1359)", () => {
  beforeEach(() => {
    mockPlatform = "win32";
    mockArch = "x64";
    setWorkspace("C:\\project");
  });

  it("resolves the real .exe in the @plow-cli platform package, not the .bin shim", () => {
    // The .bin entry npm creates on Windows is plow-lsp.cmd (a launcher shim),
    // which child_process/the LSP client cannot spawn directly. The native exe
    // lives in the platform package and must be the resolved target.
    const expected = nativePath("C:\\project", "@plow-cli/win32-x64-msvc", "plow-lsp", ".exe");
    mockExistsSync = (p) => p === expected;

    expect(findLocalBinary("plow-lsp")).toBe(expected);
  });

  it("does NOT return a node_modules/.bin shim on Windows (it is not spawnable)", () => {
    // Only the .bin shim "exists"; the native exe does not. There is no usable
    // local target on Windows in that state, so resolution must be null rather
    // than an unspawnable .cmd under .bin. npm creates `<name>.cmd` (plus a
    // `.ps1`) under .bin on Windows, never a bare `.exe`, so probe the real
    // artifact name to guard against findBinShim ever returning a .cmd path.
    const binCmd = path().join("C:\\project", "node_modules", ".bin", "plow-lsp.cmd");
    mockExistsSync = (p) => p === binCmd;

    expect(findLocalBinary("plow-lsp")).toBeNull();
  });
});

describe("findNativeInNodeModules (direct, isolated from workspace lookup)", () => {
  it("resolves the win32 platform-package exe under an explicit node_modules dir", () => {
    mockPlatform = "win32";
    mockArch = "x64";
    const nodeModules = path().join("C:\\npm-prefix", "node_modules");
    const native = path().join(nodeModules, "@plow-cli", "win32-x64-msvc", "plow-lsp.exe");
    mockExistsSync = (p) => p === native;

    expect(findNativeInNodeModules(nodeModules, "plow-lsp")).toBe(native);
  });

  it("probes both gnu and musl, returning the musl exe when only it exists", () => {
    mockPlatform = "linux";
    mockArch = "arm64";
    const nodeModules = path().join("/opt", "node_modules");
    const musl = path().join(nodeModules, "@plow-cli", "linux-arm64-musl", "plow");
    mockExistsSync = (p) => p === musl;

    expect(findNativeInNodeModules(nodeModules, "plow")).toBe(musl);
  });

  it("returns null when no platform package holds the binary", () => {
    mockPlatform = "linux";
    mockArch = "x64";
    mockExistsSync = () => false;

    expect(findNativeInNodeModules(path().join("/opt", "node_modules"), "plow")).toBeNull();
  });
});

describe("findLocalBinary - unix", () => {
  beforeEach(() => {
    mockPlatform = "linux";
    mockArch = "x64";
    setWorkspace("/workspace/project");
  });

  it("prefers the native platform-package binary when present", () => {
    const expected = nativePath(
      "/workspace/project",
      "@plow-cli/linux-x64-gnu",
      "plow-lsp",
      "",
    );
    mockExistsSync = (p) => p === expected;

    expect(findLocalBinary("plow-lsp")).toBe(expected);
  });

  it("falls back to the extensionless node_modules/.bin shim (it is spawnable on unix)", () => {
    const shim = path().join("/workspace/project", "node_modules", ".bin", "plow-lsp");
    mockExistsSync = (p) => p === shim;

    expect(findLocalBinary("plow-lsp")).toBe(shim);
  });

  it("returns null when no workspace folder is open", () => {
    setWorkspace(null);
    mockExistsSync = () => true;
    expect(findLocalBinary("plow-lsp")).toBeNull();
  });

  it("resolves the musl package when gnu is absent", () => {
    const musl = nativePath("/workspace/project", "@plow-cli/linux-x64-musl", "plow", "");
    mockExistsSync = (p) => p === musl;

    expect(findLocalBinary("plow")).toBe(musl);
  });
});

describe("findBinaryInPath - win32", () => {
  beforeEach(() => {
    mockPlatform = "win32";
    mockArch = "x64";
  });

  it("returns a bare .exe on PATH directly (real native binary)", () => {
    const exe = path().join("C:\\tools", "plow-lsp.exe");
    mockExistsSync = (p) => p === exe;
    const original = process.env["PATH"];
    process.env["PATH"] = `C:\\tools${path().delimiter}C:\\other`;
    try {
      expect(findBinaryInPath("plow-lsp")).toBe(exe);
    } finally {
      process.env["PATH"] = original;
    }
  });

  it("resolves a .cmd launcher shim on PATH to the sibling platform-package exe", () => {
    // npm i -g leaves plow-lsp.cmd in the prefix bin dir; the real exe is in
    // the adjacent node_modules/@plow-cli/<target>/.
    const cmd = path().join("C:\\npm-prefix", "plow-lsp.cmd");
    const native = path().join(
      "C:\\npm-prefix",
      "node_modules",
      "@plow-cli",
      "win32-x64-msvc",
      "plow-lsp.exe",
    );
    mockExistsSync = (p) => p === cmd || p === native;
    const original = process.env["PATH"];
    process.env["PATH"] = "C:\\npm-prefix";
    try {
      expect(findBinaryInPath("plow-lsp")).toBe(native);
    } finally {
      process.env["PATH"] = original;
    }
  });

  it("resolves a .cmd shim via the parent <dir>/../node_modules layout (npm prefix bin)", () => {
    // Standard `npm i -g plow` on Windows: %APPDATA%\npm\plow-lsp.cmd is the
    // shim and the package sits under %APPDATA%\npm\node_modules (a SIBLING of
    // the bin dir, not a child), so the second probe <shimDir>/../node_modules
    // must hit it. Putting bin in a `bin` subdir makes the two probes distinct.
    const cmd = path().join("C:\\npm-prefix", "bin", "plow-lsp.cmd");
    const native = path().join(
      "C:\\npm-prefix",
      "node_modules",
      "@plow-cli",
      "win32-x64-msvc",
      "plow-lsp.exe",
    );
    mockExistsSync = (p) => p === cmd || p === native;
    const original = process.env["PATH"];
    process.env["PATH"] = "C:\\npm-prefix\\bin";
    try {
      expect(findBinaryInPath("plow-lsp")).toBe(native);
    } finally {
      process.env["PATH"] = original;
    }
  });

  it("skips a .cmd shim whose native exe cannot be found rather than returning the shim", () => {
    const cmd = path().join("C:\\npm-prefix", "plow-lsp.cmd");
    mockExistsSync = (p) => p === cmd;
    const original = process.env["PATH"];
    process.env["PATH"] = "C:\\npm-prefix";
    try {
      expect(findBinaryInPath("plow-lsp")).toBeNull();
    } finally {
      process.env["PATH"] = original;
    }
  });
});

describe("findBinaryInPath - unix", () => {
  beforeEach(() => {
    mockPlatform = "linux";
    mockArch = "x64";
  });

  it("returns the first matching bare entry", () => {
    mockExistsSync = (p) => p.includes("/usr/local/bin");
    const original = process.env["PATH"];
    process.env["PATH"] = `/usr/bin${path().delimiter}/usr/local/bin`;
    try {
      expect(findBinaryInPath("plow")).toBe(path().join("/usr/local/bin", "plow"));
    } finally {
      process.env["PATH"] = original;
    }
  });

  it("returns null when the binary is not on PATH", () => {
    const original = process.env["PATH"];
    process.env["PATH"] = "/usr/bin";
    try {
      expect(findBinaryInPath("plow")).toBeNull();
    } finally {
      process.env["PATH"] = original;
    }
  });
});

describe("resolveConfiguredBinaryPath (plow.lspPath honoring)", () => {
  it("uses an exact file path as given", () => {
    const p = "/opt/plow/plow-lsp";
    mockExistsSync = (x) => x === p;
    expect(resolveConfiguredBinaryPath(p, "plow-lsp")).toBe(p);
  });

  it("retries a missing Windows extension (lspPath without .exe)", () => {
    mockPlatform = "win32";
    const configured = "C:\\plow\\plow-lsp";
    const withExe = "C:\\plow\\plow-lsp.exe";
    mockExistsSync = (x) => x === withExe;
    expect(resolveConfiguredBinaryPath(configured, "plow-lsp")).toBe(withExe);
  });

  it("resolves the binary inside a directory lspPath", () => {
    const dir = "/opt/plow/bin";
    const inDir = path().join(dir, "plow-lsp");
    mockDirs = new Set([dir]);
    mockExistsSync = (x) => x === inDir;
    expect(resolveConfiguredBinaryPath(dir, "plow-lsp")).toBe(inDir);
  });

  it("resolves the CLI sibling of a configured plow-lsp path", () => {
    const configured = "/opt/plow/plow-lsp";
    const sibling = "/opt/plow/plow";
    mockExistsSync = (x) => x === sibling;
    expect(resolveConfiguredBinaryPath(configured, "plow")).toBe(sibling);
  });

  it("resolves the CLI inside a directory lspPath", () => {
    const dir = "/opt/plow/bin";
    const cli = path().join(dir, "plow");
    mockDirs = new Set([dir]);
    mockExistsSync = (x) => x === cli;
    expect(resolveConfiguredBinaryPath(dir, "plow")).toBe(cli);
  });

  it("returns null when nothing exists at any interpretation", () => {
    mockExistsSync = () => false;
    expect(resolveConfiguredBinaryPath("/nope/plow-lsp", "plow-lsp")).toBeNull();
  });

  it("re-resolves a configured .cmd launcher shim to the sibling native exe on Windows", () => {
    // The reporter's "no matter how I write the path" case: lspPath points
    // straight at the non-spawnable .cmd in an npm prefix bin dir. It must be
    // re-resolved to the native exe under the adjacent node_modules, not honored
    // verbatim (which would still fail to spawn).
    mockPlatform = "win32";
    mockArch = "x64";
    const configured = "C:\\npm-prefix\\plow-lsp.cmd";
    const native = path().join(
      "C:\\npm-prefix",
      "node_modules",
      "@plow-cli",
      "win32-x64-msvc",
      "plow-lsp.exe",
    );
    mockExistsSync = (x) => x === configured || x === native;
    expect(resolveConfiguredBinaryPath(configured, "plow-lsp")).toBe(native);
  });

  it("re-resolves a configured .ps1 launcher shim to the sibling native exe on Windows", () => {
    mockPlatform = "win32";
    mockArch = "x64";
    const configured = "C:\\npm-prefix\\plow-lsp.ps1";
    const native = path().join(
      "C:\\npm-prefix",
      "node_modules",
      "@plow-cli",
      "win32-x64-msvc",
      "plow-lsp.exe",
    );
    mockExistsSync = (x) => x === configured || x === native;
    expect(resolveConfiguredBinaryPath(configured, "plow-lsp")).toBe(native);
  });

  it("falls back to the bare sibling exe when a configured .cmd shim has no platform package", () => {
    mockPlatform = "win32";
    mockArch = "x64";
    const configured = "C:\\tools\\plow-lsp.cmd";
    const sibling = path().join("C:\\tools", "plow-lsp.exe");
    mockExistsSync = (x) => x === configured || x === sibling;
    expect(resolveConfiguredBinaryPath(configured, "plow-lsp")).toBe(sibling);
  });
});
