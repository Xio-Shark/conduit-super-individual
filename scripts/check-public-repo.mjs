#!/usr/bin/env node
import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_REPO = ".";
const TEXT_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".jsx", ".md", ".mjs", ".sh", ".txt", ".yaml", ".yml"]);
const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9_-]{20,}/u,
  /ghp_[a-zA-Z0-9]{20,}/u,
  /Bearer [a-zA-Z0-9._-]{20,}/u,
];
const PLACEHOLDER_PATTERN = /待填|待部署|待录制|待发布|待人工|TODO|TBD|placeholder|REPLACE_WITH|example\.(?:com|net|org|invalid)|\/example(?:\/|$)/iu;
const SKIP_DIRS = new Set([".git"]);
const ALWAYS_FORBIDDEN_DIRS = new Set(["node_modules"]);

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(options.repo ?? DEFAULT_REPO);
  const manifest = JSON.parse(await readRequiredText(repoRoot, "scripts/archive-manifest.json"));
  const inventory = await collectInventory(repoRoot, manifest);
  const required = requiredPaths(manifest);
  const submissionFiles = submissionPlaceholderFiles();
  const secretScannedFiles = inventory.files.filter(isTextFile);
  const checks = [
    await checkGitClean(repoRoot),
    ...await checkRequiredPaths(repoRoot, required),
    ...checkForbiddenPaths(inventory.forbiddenPaths),
    ...await checkSubmissionPlaceholders(repoRoot, submissionFiles),
    ...await checkSecrets(repoRoot, secretScannedFiles),
  ];
  const failures = checks.filter((check) => check.status === "failed");
  const summary = {
    mode: "public-repo-check",
    repoRoot,
    fileCount: inventory.files.length,
    forbiddenPathCount: inventory.forbiddenPaths.length,
    requiredPathCount: required.length,
    submissionPlaceholderFileCount: submissionFiles.length,
    secretScannedFileCount: secretScannedFiles.length,
    runCount: manifest.runIds?.length ?? 0,
    status: failures.length ? "failed" : "passed",
    checkCounts: countChecks(checks),
    checks,
    note: "Run this against a fresh clone of the public AI system repository. It does not create or verify the remote URL itself.",
  };

  console.log(JSON.stringify(summary, null, 2));
  if (failures.length) process.exit(1);
}

function parseArgs(args) {
  const options = {};
  const filteredArgs = args.filter((arg) => arg !== "--json");
  for (let index = 0; index < filteredArgs.length; index += 2) {
    const name = filteredArgs[index];
    const value = filteredArgs[index + 1];
    if (name !== "--repo" || isMissingFlagValue(value)) throw new Error(usage());
    options.repo = value;
  }
  return options;
}

function isMissingFlagValue(value) {
  return value === undefined || value.startsWith("--");
}

async function checkGitClean(repoRoot) {
  if (!await exists(repoRoot, ".git")) return fail("git-clean", "fresh clone must be a git checkout");
  const { stdout } = await execFileAsync("git", ["status", "--porcelain"], { cwd: repoRoot });
  return stdout.trim()
    ? fail("git-clean", "fresh clone has uncommitted or untracked files")
    : pass("git-clean", "clean");
}

async function checkRequiredPaths(repoRoot, required) {
  const checks = await Promise.all(required.map(async (relativePath) => {
    const stats = await statPath(repoRoot, relativePath);
    return stats?.isFile()
      ? pass(`required:${relativePath}`, "present")
      : fail(`required:${relativePath}`, "missing or not a file");
  }));
  const failures = checks.filter((check) => check.status === "failed");
  return failures.length ? failures : [pass("required-paths", `${required.length} required path(s) present`)];
}

function requiredPaths(manifest) {
  return [
    ...(manifest.required ?? []),
    ...(manifest.runIds ?? []).flatMap((runId) =>
      (manifest.requiredRunFiles ?? []).map((file) => `docs/reports/runs/${runId}/${file}`),
    ),
  ];
}

function checkForbiddenPaths(forbiddenPaths) {
  return forbiddenPaths.length
    ? forbiddenPaths.map((file) => fail(`forbidden:${file}`, "forbidden path is present in public repo"))
    : [pass("forbidden-paths", "none")];
}

function submissionPlaceholderFiles() {
  return ["checklist.md", "public-repo-guide.md"]
    .map((file) => `docs/reports/submission/${file}`);
}

async function checkSubmissionPlaceholders(repoRoot, files) {
  const checks = await Promise.all(files.map(async (file) => {
    const text = await readRequiredText(repoRoot, file);
    return PLACEHOLDER_PATTERN.test(text)
      ? fail(`placeholders:${file}`, "human-pending placeholder remains")
      : pass(`placeholders:${file}`, "none");
  }));
  const failures = checks.filter((check) => check.status === "failed");
  return failures.length ? failures : [pass("submission-placeholders", `${files.length} submission file(s) clean`)];
}

async function checkSecrets(repoRoot, files) {
  const checks = [];
  for (const file of files) {
    const text = await readRequiredText(repoRoot, file);
    if (SECRET_PATTERNS.some((pattern) => pattern.test(text))) {
      checks.push(fail(`secret:${file}`, "possible secret pattern"));
    }
  }
  return checks.length ? checks : [pass("secret-patterns", "none")];
}

async function collectInventory(repoRoot, manifest) {
  const inventory = { files: [], forbiddenPaths: [] };
  await collectPath(repoRoot, "", inventory, manifest);
  inventory.files.sort();
  inventory.forbiddenPaths.sort();
  return inventory;
}

async function collectPath(repoRoot, relativePath, inventory, manifest) {
  const stats = await lstat(path.join(repoRoot, relativePath || "."));
  if (stats.isDirectory()) {
    if (relativePath && SKIP_DIRS.has(path.posix.basename(relativePath))) return;
    if (relativePath && shouldDenyDirectory(relativePath, manifest)) {
      inventory.forbiddenPaths.push(normalize(relativePath));
      return;
    }
    const entries = await readdir(path.join(repoRoot, relativePath || "."));
    for (const entry of entries) await collectPath(repoRoot, normalize(`${relativePath}/${entry}`), inventory, manifest);
    return;
  }
  if (stats.isFile()) {
    const normalized = normalize(relativePath);
    if (shouldDenyFile(normalized, manifest)) {
      inventory.forbiddenPaths.push(normalized);
      return;
    }
    inventory.files.push(normalized);
  }
}

function shouldDenyDirectory(relativePath, manifest) {
  const basename = path.posix.basename(relativePath);
  if (ALWAYS_FORBIDDEN_DIRS.has(basename)) return true;
  const prefixes = manifest.denyPrefixes ?? [];
  if (prefixes.some((prefix) => relativePath === stripTrailingSlash(prefix) || relativePath.startsWith(prefix))) return true;
  const segments = relativePath.split("/");
  return segments.some((segment) => (manifest.denySegments ?? []).includes(segment));
}

function shouldDenyFile(relativePath, manifest) {
  const prefixes = manifest.denyPrefixes ?? [];
  if (prefixes.some((prefix) => relativePath === stripTrailingSlash(prefix) || relativePath.startsWith(prefix))) return true;
  const segments = relativePath.split("/");
  return segments.some((segment) => (manifest.denySegments ?? []).includes(segment))
    || isForbiddenFile(relativePath);
}

function isForbiddenFile(relativePath) {
  const basename = path.posix.basename(relativePath);
  return basename === ".DS_Store"
    || basename === ".env"
    || (basename.startsWith(".env.") && basename !== ".env.example")
    || relativePath.startsWith("apps/web/dist/")
    || relativePath.startsWith("test-results/");
}

function isTextFile(relativePath) {
  return TEXT_EXTENSIONS.has(path.posix.extname(relativePath)) || path.posix.basename(relativePath) === ".env.example";
}

async function exists(repoRoot, relativePath) {
  return Boolean(await statPath(repoRoot, relativePath));
}

async function statPath(repoRoot, relativePath) {
  try {
    return await lstat(resolveInsideRepo(repoRoot, relativePath));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function readRequiredText(repoRoot, relativePath) {
  return readFile(resolveInsideRepo(repoRoot, relativePath), "utf8");
}

function pass(name, detail) {
  return { name, status: "passed", detail };
}

function fail(name, detail) {
  return { name, status: "failed", detail };
}

function countChecks(checks) {
  return {
    total: checks.length,
    passed: checks.filter((check) => check.status === "passed").length,
    failed: checks.filter((check) => check.status === "failed").length,
  };
}

function normalize(relativePath) {
  return relativePath.split(path.sep).join("/").replace(/^\/+/u, "").replace(/\/+$/u, "");
}

function resolveInsideRepo(repoRoot, relativePath) {
  const normalized = normalize(relativePath);
  const absolutePath = path.resolve(repoRoot, normalized);
  const relative = path.relative(repoRoot, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`path escapes repo root: ${relativePath}`);
  }
  return absolutePath;
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/u, "");
}

function usage() {
  return "Usage: node scripts/check-public-repo.mjs [--repo <fresh-clone-path>]";
}

main().catch((error) => {
  const checks = [
    {
      name: "fatal",
      status: "failed",
      detail: error.message,
    },
  ];
  console.log(JSON.stringify({
    mode: "public-repo-check",
    status: "failed",
    checkCounts: countChecks(checks),
    checks,
    usage: usage(),
    note: "Run this against a fresh clone of the public AI system repository. It does not create or verify the remote URL itself.",
  }, null, 2));
  process.exit(1);
});
