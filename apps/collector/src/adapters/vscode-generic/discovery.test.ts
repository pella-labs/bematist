import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverProfiles, vscodeUserRoot } from "./discovery";

function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => T): T {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(overrides)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("BEMATIST_VSCODE_USER_ROOT override wins over platform defaults", () => {
  withEnv({ BEMATIST_VSCODE_USER_ROOT: "/tmp/fake-root" }, () => {
    expect(vscodeUserRoot()).toBe("/tmp/fake-root");
  });
});

test("discoverProfiles returns empty when root is bogus", () => {
  withEnv({ BEMATIST_VSCODE_USER_ROOT: "/nonexistent/vsc/root" }, () => {
    expect(discoverProfiles()).toEqual([]);
  });
});

test("discoverProfiles finds Code and Code - Insiders when both exist", () => {
  const root = mkdtempSync(join(tmpdir(), "bematist-vsc-"));
  try {
    for (const d of ["Code/User", "Code - Insiders/User"])
      mkdirSync(join(root, d), { recursive: true });
    withEnv({ BEMATIST_VSCODE_USER_ROOT: root }, () => {
      const profs = discoverProfiles();
      const distros = profs.map((p) => p.distro).sort();
      expect(distros).toEqual(["code", "code-insiders"]);
      for (const p of profs) expect(p.userDir.endsWith("/User")).toBe(true);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("discoverProfiles silently skips distros that don't exist", () => {
  const root = mkdtempSync(join(tmpdir(), "bematist-vsc-"));
  try {
    mkdirSync(join(root, "VSCodium", "User"), { recursive: true });
    withEnv({ BEMATIST_VSCODE_USER_ROOT: root }, () => {
      const profs = discoverProfiles();
      expect(profs.length).toBe(1);
      expect(profs[0]?.distro).toBe("vscodium");
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("discoverProfiles treats non-directory User entries as absent (ENOTDIR hardening)", () => {
  const root = mkdtempSync(join(tmpdir(), "bematist-vsc-bad-"));
  try {
    // Code has a valid User/ dir.
    mkdirSync(join(root, "Code", "User"), { recursive: true });
    // VSCodium has `User` as a plain file (ENOTDIR on traversal). The walk
    // must swallow it and still return the Code profile.
    mkdirSync(join(root, "VSCodium"), { recursive: true });
    writeFileSync(join(root, "VSCodium", "User"), "not a dir");
    withEnv({ BEMATIST_VSCODE_USER_ROOT: root }, () => {
      const profs = discoverProfiles();
      const distros = profs.map((p) => p.distro);
      expect(distros).toContain("code");
      expect(distros).not.toContain("vscodium");
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("discoverProfiles does not abort on one broken distro — other distros still returned", () => {
  const root = mkdtempSync(join(tmpdir(), "bematist-vsc-partial-"));
  try {
    // Two valid distros + one that will look broken (file instead of dir).
    mkdirSync(join(root, "Code", "User"), { recursive: true });
    mkdirSync(join(root, "Code - Insiders", "User"), { recursive: true });
    mkdirSync(join(root, "VSCodium"), { recursive: true });
    writeFileSync(join(root, "VSCodium", "User"), "not a dir");
    withEnv({ BEMATIST_VSCODE_USER_ROOT: root }, () => {
      const distros = discoverProfiles()
        .map((p) => p.distro)
        .sort();
      expect(distros).toEqual(["code", "code-insiders"]);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
