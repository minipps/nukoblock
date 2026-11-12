import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";

let directory: string;
const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: directory, encoding: "utf8" }).trim();
const release = (...args: string[]) =>
  spawnSync(process.execPath, ["scripts/release.mjs", ...args], {
    cwd: directory,
    encoding: "utf8",
  });
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "nukoblock-release-"));
  mkdirSync(join(directory, "scripts"));
  copyFileSync(
    new URL("../scripts/release.mjs", import.meta.url),
    join(directory, "scripts/release.mjs"),
  );
  writeFileSync(
    join(directory, "package.json"),
    JSON.stringify({
      name: "release-fixture",
      version: "0.1.0",
      private: true,
      scripts: {
        check: 'node -e ""',
        test: 'node -e ""',
        build: 'node -e ""',
        "build:firefox": 'node -e ""',
      },
    }),
  );
  execFileSync(
    "npm",
    ["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"],
    { cwd: directory, stdio: "ignore" },
  );
  git("init", "-b", "main");
  git("config", "user.name", "Release test");
  git("config", "user.email", "release@example.invalid");
  git("config", "commit.gpgsign", "false");
  git("config", "tag.gpgsign", "false");
  git("add", ".");
  git("commit", "-m", "Initial");
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));
it("bumps both package files and creates an annotated tag without pushing", () => {
  const result = release("patch");
  expect(result.status).toBe(0);
  expect(JSON.parse(readFileSync(join(directory, "package.json"), "utf8")).version).toBe("0.1.1");
  const lock = JSON.parse(readFileSync(join(directory, "package-lock.json"), "utf8"));
  expect(lock.version).toBe("0.1.1");
  expect(lock.packages[""].version).toBe("0.1.1");
  expect(git("cat-file", "-t", "v0.1.1")).toBe("tag");
  expect(git("log", "-1", "--format=%s")).toBe("Release v0.1.1");
  expect(git("status", "--porcelain")).toBe("");
  expect(result.stdout).toContain("git push --atomic origin main refs/tags/v0.1.1");
}, 15000);
it("rejects invalid arguments without changing version or tags", () => {
  expect(release("patch", "unexpected").status).toBe(1);
  expect(git("tag", "--list")).toBe("");
  expect(git("status", "--porcelain")).toBe("");
});
it("rejects an untracked file and a non-main branch", () => {
  writeFileSync(join(directory, "notes.txt"), "unfinished");
  expect(release("patch").stderr).toContain("Commit or stash");
  rmSync(join(directory, "notes.txt"));
  git("checkout", "-b", "feature");
  expect(release("patch").stderr).toContain("Release from main");
  expect(git("tag", "--list")).toBe("");
});
it("rejects an existing version tag", () => {
  git("tag", "v0.1.1");
  expect(release("patch").stderr).toContain("already exists");
  expect(git("log", "--format=%s")).toBe("Initial");
});

it("leaves version and tags untouched when checks fail", () => {
  const path = join(directory, "package.json");
  const pkg = JSON.parse(readFileSync(path, "utf8"));
  pkg.scripts.check = 'node -e "process.exit(1)"';
  writeFileSync(path, JSON.stringify(pkg));
  git("add", "package.json");
  git("commit", "-m", "Fail checks");
  expect(release("patch").status).toBe(1);
  expect(JSON.parse(readFileSync(path, "utf8")).version).toBe("0.1.0");
  expect(git("tag", "--list")).toBe("");
  expect(git("status", "--porcelain")).toBe("");
});
