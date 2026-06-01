#!/usr/bin/env node
import { lstat, readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = fileURLToPath(new URL("..", import.meta.url));
const MANIFEST_PATH = path.join(PROJECT_ROOT, "scripts/archive-manifest.json");
const TEXT_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".sh",
  ".txt",
  ".yaml",
  ".yml"
]);
const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9_-]{20,}/,
  /ghp_[a-zA-Z0-9]{20,}/,
  /Bearer [a-zA-Z0-9._-]{20,}/
];

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  const files = await collectArchiveFiles(manifest);
  const errors = [
    ...await findMissingRequired(manifest, files),
    ...findForbiddenFiles(files),
    ...await findSecretPatternHits(files)
  ];

  const summary = {
    mode: "dry-run",
    archiveRoot: PROJECT_ROOT,
    fileCount: files.length,
    manifestHash: hashLines(files),
    contentHash: await hashFileContents(files),
    runCount: manifest.runIds.length,
    runs: manifest.runIds,
    deniedSegments: manifest.denySegments,
    deniedPrefixes: manifest.denyPrefixes,
    status: errors.length ? "failed" : "passed",
    checks: errors.length
      ? errors.map((error) => fail("archive-content", error))
      : [pass("archive-content", `${files.length} file(s) ready for archive`)]
  };
  summary.checkCounts = countChecks(summary.checks);

  console.log(JSON.stringify(summary, null, 2));
  if (errors.length) {
    process.exit(1);
  }
}

function hashLines(lines) {
  return createHash("sha256")
    .update(`${lines.join("\n")}\n`)
    .digest("hex");
}

async function hashFileContents(files) {
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(`${file}\0`);
    hash.update(await readFile(path.join(PROJECT_ROOT, file)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function collectArchiveFiles(manifest) {
  const files = new Set();
  for (const includePath of manifest.include) {
    await addPath(includePath, manifest, files);
  }
  for (const runId of manifest.runIds) {
    await addPath(`docs/reports/runs/${runId}`, manifest, files);
  }
  return [...files].sort();
}

async function addPath(relativePath, manifest, files) {
  const normalized = normalize(relativePath);
  const absolutePath = resolveInsideProject(normalized);
  const stats = await lstat(absolutePath);

  if (shouldDeny(normalized, manifest)) return;
  if (stats.isDirectory()) {
    const entries = await readdir(absolutePath);
    await Promise.all(entries.map((entry) => addPath(`${normalized}/${entry}`, manifest, files)));
    return;
  }
  if (stats.isFile()) {
    files.add(normalized);
  }
}

async function findMissingRequired(manifest, files) {
  const fileSet = new Set(files);
  const required = [
    ...manifest.required,
    ...manifest.runIds.flatMap((runId) =>
      manifest.requiredRunFiles.map((file) => `docs/reports/runs/${runId}/${file}`),
    )
  ];
  const errors = [];
  for (const requiredPath of required) {
    if (!fileSet.has(requiredPath)) {
      errors.push(`missing required archive path: ${requiredPath}`);
    }
  }
  return errors;
}

function findForbiddenFiles(files) {
  return files
    .filter((file) => isForbiddenFile(file))
    .map((file) => `forbidden archive path included: ${file}`);
}

async function findSecretPatternHits(files) {
  const hits = [];
  for (const file of files) {
    if (!isTextFile(file)) continue;
    const text = await readFile(path.join(PROJECT_ROOT, file), "utf8");
    if (SECRET_PATTERNS.some((pattern) => pattern.test(text))) {
      hits.push(`possible secret pattern in archive path: ${file}`);
    }
  }
  return hits;
}

function shouldDeny(relativePath, manifest) {
  if (manifest.denyPrefixes.some((prefix) => relativePath === stripTrailingSlash(prefix) || relativePath.startsWith(prefix))) {
    return true;
  }
  const segments = relativePath.split("/");
  if (segments.some((segment) => manifest.denySegments.includes(segment))) {
    return true;
  }
  return isForbiddenFile(relativePath);
}

function isForbiddenFile(relativePath) {
  const basename = path.posix.basename(relativePath);
  return basename === ".DS_Store"
    || basename === ".env"
    || (basename.startsWith(".env.") && basename !== ".env.example")
    || relativePath.startsWith("apps/web/dist/")
    || relativePath.startsWith("test-results/")
    || relativePath.split("/").some((segment) => segment === ".git" || segment === "node_modules");
}

function isTextFile(relativePath) {
  return TEXT_EXTENSIONS.has(path.posix.extname(relativePath)) || path.posix.basename(relativePath) === ".env.example";
}

function resolveInsideProject(relativePath) {
  const absolutePath = path.resolve(PROJECT_ROOT, relativePath);
  const relative = path.relative(PROJECT_ROOT, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`archive path escapes project root: ${relativePath}`);
  }
  return absolutePath;
}

function normalize(relativePath) {
  return relativePath.split(path.sep).join("/").replace(/\/+$/u, "");
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/u, "");
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

function fatalSummary(error) {
  const checks = [
    fail("fatal", error.message)
  ];
  return {
    mode: "dry-run",
    archiveRoot: PROJECT_ROOT,
    status: "failed",
    checkCounts: countChecks(checks),
    checks
  };
}

main().catch((error) => {
  console.log(JSON.stringify(fatalSummary(error), null, 2));
  process.exit(1);
});
