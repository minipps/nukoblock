import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const output = (command, args) => execFileSync(command, args, { encoding: "utf8" }).trim();
const run = (command, args) => execFileSync(command, args, { stdio: "inherit" });

try {
  const [bump, ...extra] = process.argv.slice(2);
  if (!["patch", "minor", "major"].includes(bump) || extra.length) {
    throw new Error("Usage: npm run release -- patch|minor|major");
  }
  if (output("git", ["branch", "--show-current"]) !== "main") {
    throw new Error("Release from main.");
  }
  if (output("git", ["status", "--porcelain"])) {
    throw new Error("Commit or stash all changes, including untracked files, before releasing.");
  }
  const current = JSON.parse(readFileSync("package.json", "utf8")).version;
  if (!/^\d+\.\d+\.\d+$/.test(current)) throw new Error("Expected a stable package version.");
  const parts = current.split(".").map(Number);
  const index = ["major", "minor", "patch"].indexOf(bump);
  parts[index] += 1;
  for (let i = index + 1; i < parts.length; i++) parts[i] = 0;
  const version = parts.join(".");
  const tag = `v${version}`;
  if (output("git", ["tag", "--list", tag])) throw new Error(`Tag ${tag} already exists.`);

  run(npm, ["run", "check"]);
  run(npm, ["test"]);
  run(npm, ["run", "build"]);
  run(npm, ["run", "build:firefox"]);
  if (output("git", ["status", "--porcelain"])) {
    throw new Error(
      "Checks changed the working tree. Review and commit those changes before retrying.",
    );
  }
  run(npm, ["version", bump, "-m", "Release v%s"]);
  console.log(`Created ${tag}. Publish with: git push --atomic origin main refs/tags/${tag}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
