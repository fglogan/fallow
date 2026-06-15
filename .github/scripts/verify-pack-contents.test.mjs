// Tests for verify-pack-contents.mjs, the release-time gate that asserts every
// file declared in a packed tarball's `files` whitelist is actually present in
// the tarball. Regression coverage for #944 (2.76.0 shipped @plow-cli/*
// platform packages without their `.sig` siblings).
//
// Run: node --test .github/scripts/verify-pack-contents.test.mjs

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { verifyTarball } from "./verify-pack-contents.mjs";

// Build a .tgz whose internal layout matches `npm pack` output: every path is
// under a top-level `package/` directory. `files` is the declared whitelist
// written into package.json; `present` is the set of files actually staged on
// disk before packing (the gap between the two is what the gate must catch).
function makeTarball({ files, present }) {
  const work = mkdtempSync(join(tmpdir(), "verify-pack-"));
  const pkgDir = join(work, "package");
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(
    join(pkgDir, "package.json"),
    JSON.stringify({ name: "@plow-cli/test-platform", version: "9.9.9", files }, null, 2),
  );
  for (const rel of present) {
    const full = join(pkgDir, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, `stub:${rel}`);
  }
  const tgz = join(work, "pkg.tgz");
  // -C work so the archive root is `package/...`, matching npm pack.
  execFileSync("tar", ["-czf", tgz, "-C", work, "package"]);
  return { tgz, cleanup: () => rmSync(work, { recursive: true, force: true }) };
}

test("passes when every declared file is present", () => {
  const files = ["plow", "plow.sig", "plow-lsp", "plow-lsp.sig"];
  const { tgz, cleanup } = makeTarball({ files, present: files });
  try {
    const result = verifyTarball(tgz);
    assert.equal(result.ok, true);
    assert.deepEqual(result.missing, []);
    assert.equal(result.checked.length, 4);
  } finally {
    cleanup();
  }
});

test("fails and names the missing .sig when a declared signature is absent", () => {
  // Reproduces the 2.76.0 shape: binaries staged, .sig siblings missing.
  const files = ["plow", "plow.sig", "plow-lsp", "plow-lsp.sig"];
  const present = ["plow", "plow-lsp"]; // both .sig files absent
  const { tgz, cleanup } = makeTarball({ files, present });
  try {
    const result = verifyTarball(tgz);
    assert.equal(result.ok, false);
    assert.deepEqual(result.missing.toSorted(), ["plow-lsp.sig", "plow.sig"]);
  } finally {
    cleanup();
  }
});

test("skips glob and negation entries (npm globs may match nothing)", () => {
  const files = ["plow", "plow.sig", "skills/**", "!skills/_artifacts"];
  const present = ["plow", "plow.sig"]; // no skills/ dir on disk
  const { tgz, cleanup } = makeTarball({ files, present });
  try {
    const result = verifyTarball(tgz);
    assert.equal(result.ok, true);
    assert.deepEqual(result.missing, []);
    assert.deepEqual(result.skipped.toSorted(), ["!skills/_artifacts", "skills/**"]);
  } finally {
    cleanup();
  }
});

test("treats a declared directory as present when its contents are packed", () => {
  const files = ["bin", "plow.sig"];
  const present = ["bin/plow", "plow.sig"]; // `bin` is a dir, only its child is packed
  const { tgz, cleanup } = makeTarball({ files, present });
  try {
    const result = verifyTarball(tgz);
    assert.equal(result.ok, true);
    assert.deepEqual(result.missing, []);
  } finally {
    cleanup();
  }
});

// Build a tarball with an explicit package name so the signed-binary invariant
// (which keys on `@plow-cli/<platform>` names) can be exercised.
function makeNamedTarball({ name, files, present }) {
  const work = mkdtempSync(join(tmpdir(), "verify-pack-"));
  const pkgDir = join(work, "package");
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(
    join(pkgDir, "package.json"),
    JSON.stringify({ name, version: "9.9.9", files }, null, 2),
  );
  for (const rel of present) {
    writeFileSync(join(pkgDir, rel), `stub:${rel}`);
  }
  const tgz = join(work, "pkg.tgz");
  execFileSync("tar", ["-czf", tgz, "-C", work, "package"]);
  return { tgz, cleanup: () => rmSync(work, { recursive: true, force: true }) };
}

const SIGNED_PLATFORM_FILES = [
  "plow",
  "plow.sig",
  "plow-lsp",
  "plow-lsp.sig",
  "plow-mcp",
  "plow-mcp.sig",
];

test("fails a CLI platform package whose binary lost its .sig from both files and disk", () => {
  // The future-regression shape: `files` no longer declares the sigs AND the
  // sigs are absent on disk. The declared-files check passes (self-consistent),
  // but the every-binary-is-signed invariant must still fail.
  const files = ["plow", "plow-lsp", "plow-mcp"]; // no .sig declared
  const { tgz, cleanup } = makeNamedTarball({
    name: "@plow-cli/linux-x64-gnu",
    files,
    present: files, // no .sig on disk either
  });
  try {
    const result = verifyTarball(tgz);
    assert.equal(result.ok, false);
    assert.deepEqual(result.missing, []); // declared-files check is satisfied
    assert.deepEqual(result.missingSignatures.toSorted(), [
      "plow-lsp.sig",
      "plow-mcp.sig",
      "plow.sig",
    ]);
  } finally {
    cleanup();
  }
});

test("passes a fully-signed CLI platform package", () => {
  const { tgz, cleanup } = makeNamedTarball({
    name: "@plow-cli/linux-x64-gnu",
    files: SIGNED_PLATFORM_FILES,
    present: [...SIGNED_PLATFORM_FILES, "README.md"],
  });
  try {
    const result = verifyTarball(tgz);
    assert.equal(result.ok, true);
    assert.deepEqual(result.missingSignatures, []);
  } finally {
    cleanup();
  }
});

test("requires .exe.sig siblings on win32 platform packages", () => {
  const files = ["plow.exe", "plow-lsp.exe", "plow-mcp.exe"]; // sigs dropped
  const { tgz, cleanup } = makeNamedTarball({
    name: "@plow-cli/win32-x64-msvc",
    files,
    present: files,
  });
  try {
    const result = verifyTarball(tgz);
    assert.equal(result.ok, false);
    assert.deepEqual(result.missingSignatures.toSorted(), [
      "plow-lsp.exe.sig",
      "plow-mcp.exe.sig",
      "plow.exe.sig",
    ]);
  } finally {
    cleanup();
  }
});

test("does not require signatures on the plow wrapper or NAPI packages", () => {
  // The `plow` wrapper ships unsigned JS/dirs; NAPI packages ship .node addons.
  const wrapper = makeNamedTarball({
    name: "plow",
    files: ["bin", "scripts", "README.md"],
    present: ["bin", "scripts", "README.md"],
  });
  const napi = makeNamedTarball({
    name: "@plow-cli/plow-node-linux-x64-gnu",
    files: ["plow-node.linux-x64-gnu.node", "README.md"],
    present: ["plow-node.linux-x64-gnu.node", "README.md"],
  });
  try {
    assert.equal(verifyTarball(wrapper.tgz).ok, true);
    assert.equal(verifyTarball(napi.tgz).ok, true);
  } finally {
    wrapper.cleanup();
    napi.cleanup();
  }
});
