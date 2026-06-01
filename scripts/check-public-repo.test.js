import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const SCRIPT_PATH = fileURLToPath(new URL("check-public-repo.mjs", import.meta.url));

test("public repo check passes for a complete fresh clone", async () => {
  const repoRoot = await makeRepo("public-repo-pass-");
  try {
    await writePublicRepo(repoRoot);
    await initCleanGitRepo(repoRoot);
    const result = await runCheck(repoRoot);
    assert.equal(result.code, 0);
    assert.equal(result.summary.status, "passed");
    assert.deepEqual(result.summary.checkCounts, countChecks(result.summary.checks));
    assert.equal(result.summary.requiredPathCount, 12);
    assert.equal(result.summary.submissionPlaceholderFileCount, 3);
    assert.equal(result.summary.secretScannedFileCount, 14);
    assert.equal(result.summary.checks.some((check) => check.name === "required-paths"), true);
    assert.equal(result.summary.checks.some((check) => check.name === "required:README.md"), false);
    assert.equal(result.summary.checks.some((check) => check.name === "submission-placeholders"), true);
    assert.equal(result.summary.checks.some((check) => check.name === "placeholders:docs/reports/submission/team-info.md"), false);
  } finally {
    await rm(repoRoot, { force: true, recursive: true });
  }
});

test("public repo check accepts --json as a compatibility no-op", async () => {
  const repoRoot = await makeRepo("public-repo-json-");
  try {
    await writePublicRepo(repoRoot);
    await initCleanGitRepo(repoRoot);
    const result = await runCheck(repoRoot, ["--json"]);
    assert.equal(result.code, 0);
    assert.equal(result.summary.mode, "public-repo-check");
    assert.equal(result.summary.status, "passed");
  } finally {
    await rm(repoRoot, { force: true, recursive: true });
  }
});

test("public repo check requires a git checkout", async () => {
  const repoRoot = await makeRepo("public-repo-not-git-");
  try {
    await writePublicRepo(repoRoot);
    const result = await runCheck(repoRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.deepEqual(result.summary.checkCounts, countChecks(result.summary.checks));
    assert.deepEqual(result.summary.checks.find((check) => check.name === "git-clean"), {
      name: "git-clean",
      status: "failed",
      detail: "fresh clone must be a git checkout",
    });
  } finally {
    await rm(repoRoot, { force: true, recursive: true });
  }
});

test("public repo check returns JSON when the repo path is missing", async () => {
  const repoRoot = path.join(tmpdir(), `public-repo-missing-${Date.now()}`);
  const result = await runCheck(repoRoot, ["--json"]);

  assert.equal(result.code, 1);
  assert.equal(result.summary.mode, "public-repo-check");
  assert.equal(result.summary.status, "failed");
  assert.match(JSON.stringify(result.summary.checks), /archive-manifest\.json/);
  assert.equal(result.stderr, "");
});

test("public repo check rejects option flags used as missing values", async () => {
  const result = await runRawCheck(["--repo", "--bogus"]);

  assert.equal(result.code, 1);
  assert.equal(result.summary.mode, "public-repo-check");
  assert.equal(result.summary.status, "failed");
  assert.equal(result.summary.checks[0].name, "fatal");
  assert.match(result.summary.checks[0].detail, /Usage: node scripts\/check-public-repo\.mjs/);
  assert.equal(result.stderr, "");
});

test("public repo check returns JSON when archive manifest is missing", async () => {
  const repoRoot = await makeRepo("public-repo-missing-manifest-");
  try {
    const result = await runCheck(repoRoot, ["--json"]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "public-repo-check");
    assert.equal(result.summary.status, "failed");
    assert.match(JSON.stringify(result.summary.checks), /archive-manifest\.json/);
    assert.equal(result.stderr, "");
  } finally {
    await rm(repoRoot, { force: true, recursive: true });
  }
});

test("public repo check allows a clean git checkout", async () => {
  const repoRoot = await makeRepo("public-repo-git-");
  try {
    await writePublicRepo(repoRoot);
    await initCleanGitRepo(repoRoot);
    const result = await runCheck(repoRoot);
    assert.equal(result.code, 0);
    assert.equal(result.summary.status, "passed");
    assert.doesNotMatch(JSON.stringify(result.summary.checks), /forbidden:\.git/u);
  } finally {
    await rm(repoRoot, { force: true, recursive: true });
  }
});

test("public repo check fails when sandbox-repo is missing", async () => {
  const repoRoot = await makeRepo("public-repo-missing-sandbox-");
  try {
    await writePublicRepo(repoRoot, { skip: "sandbox-repo/package.json" });
    const result = await runCheck(repoRoot);
    assert.equal(result.code, 1);
    assert.match(JSON.stringify(result.summary.checks), /sandbox-repo\/package\.json/);
    assert.equal(result.summary.checks.some((check) => check.name === "required-paths"), false);
  } finally {
    await rm(repoRoot, { force: true, recursive: true });
  }
});

test("public repo check fails on placeholders and secret patterns", async () => {
  const repoRoot = await makeRepo("public-repo-placeholder-");
  try {
    await writePublicRepo(repoRoot, { placeholder: true, secret: true });
    const result = await runCheck(repoRoot);
    assert.equal(result.code, 1);
    assert.match(JSON.stringify(result.summary.checks), /human-pending placeholder/);
    assert.match(JSON.stringify(result.summary.checks), /possible secret pattern/);
    assert.equal(result.summary.checks.some((check) => check.name === "submission-placeholders"), false);
  } finally {
    await rm(repoRoot, { force: true, recursive: true });
  }
});

test("public repo check rejects example URLs in submission materials", async () => {
  const repoRoot = await makeRepo("public-repo-example-url-");
  try {
    await writePublicRepo(repoRoot, { exampleUrl: true });
    const result = await runCheck(repoRoot);
    assert.equal(result.code, 1);
    assert.match(JSON.stringify(result.summary.checks), /human-pending placeholder/);
  } finally {
    await rm(repoRoot, { force: true, recursive: true });
  }
});

test("public repo check returns JSON when manifest path escapes repo root", async () => {
  const repoRoot = await makeRepo("public-repo-escape-");
  try {
    await writePublicRepo(repoRoot);
    await writeJson(repoRoot, "scripts/archive-manifest.json", {
      required: ["../outside"],
      runIds: [],
      requiredRunFiles: [],
      denyPrefixes: [],
      denySegments: [],
    });

    const result = await runCheck(repoRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "public-repo-check");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.checks[0].name, "fatal");
    assert.match(result.summary.checks[0].detail, /path escapes repo root: \.\.\/outside/);
    assert.equal(result.stderr, "");
  } finally {
    await rm(repoRoot, { force: true, recursive: true });
  }
});

test("public repo check collapses forbidden directories into one check each", async () => {
  const repoRoot = await makeRepo("public-repo-forbidden-dirs-");
  try {
    await writePublicRepo(repoRoot);
    await writeText(repoRoot, "node_modules/pkg/index.js", "module.exports = 1;\n");
    await writeText(repoRoot, "docs/reports/runs-archive/run-old/paused.json", "{}\n");
    await writeText(repoRoot, "docs/reports/runs-archive/run-old/requirement.md", "old\n");

    const result = await runCheck(repoRoot);
    const failedNames = result.summary.checks
      .filter((check) => check.status === "failed")
      .map((check) => check.name);

    assert.equal(result.code, 1);
    assert.equal(result.summary.forbiddenPathCount, 2);
    assert.equal(result.summary.secretScannedFileCount, 14);
    assert.equal(failedNames.includes("forbidden:node_modules"), true);
    assert.equal(failedNames.includes("forbidden:docs/reports/runs-archive"), true);
    assert.equal(failedNames.some((name) => name.includes("node_modules/pkg/index.js")), false);
    assert.equal(failedNames.some((name) => name.includes("runs-archive/run-old")), false);
  } finally {
    await rm(repoRoot, { force: true, recursive: true });
  }
});

async function makeRepo(prefix) {
  const repoRoot = await mkdtemp(path.join(tmpdir(), prefix));
  await mkdir(path.join(repoRoot, "scripts"), { recursive: true });
  await copyFile(SCRIPT_PATH, path.join(repoRoot, "scripts/check-public-repo.mjs"));
  return repoRoot;
}

async function initCleanGitRepo(repoRoot) {
  await execFileAsync("git", ["init"], { cwd: repoRoot });
  await execFileAsync("git", ["add", "."], { cwd: repoRoot });
  await execFileAsync("git", [
    "-c",
    "user.email=test@example.invalid",
    "-c",
    "user.name=Test User",
    "commit",
    "-m",
    "initial",
  ], { cwd: repoRoot });
}

async function writePublicRepo(repoRoot, options = {}) {
  await writeManifest(repoRoot);
  await writeRequiredFiles(repoRoot, options);
  await writeRunEvidence(repoRoot);
  await writeSubmission(repoRoot, options);
}

async function writeManifest(repoRoot) {
  await writeJson(repoRoot, "scripts/archive-manifest.json", {
    required: ["README.md", ".env.example", "scripts/check-public-repo.mjs", "sandbox-repo/package.json"],
    runIds: ["run-complete"],
    requiredRunFiles: ["requirement.md", "history-recall.json", "plan.md", "diff.patch", "verification.json", "run-summary.json", "pr-draft.md", "ai-calls.jsonl"],
    denyPrefixes: ["apps/web/dist/", "test-results/", "docs/reports/runs-archive/"],
    denySegments: [".git", "node_modules"],
  });
}

async function writeRequiredFiles(repoRoot, options) {
  const files = ["README.md", ".env.example", "sandbox-repo/package.json"];
  for (const file of files) {
    if (file === options.skip) continue;
    await writeText(repoRoot, file, file === "README.md" && options.secret ? `sk-${"a".repeat(24)}` : `${file}\n`);
  }
}

async function writeRunEvidence(repoRoot) {
  const runFiles = ["requirement.md", "history-recall.json", "plan.md", "diff.patch", "verification.json", "run-summary.json", "pr-draft.md", "ai-calls.jsonl"];
  for (const file of runFiles) {
    await writeText(repoRoot, `docs/reports/runs/run-complete/${file}`, `${file}\n`);
  }
}

async function writeSubmission(repoRoot, options) {
  const status = options.placeholder ? "_（待填）_" : "https://submission.conduit-delivery.dev/submitted";
  const repoUrl = options.exampleUrl
    ? "https://example.com/repo"
    : "https://github.com/conduit-delivery/conduit-super-individual";
  await writeText(repoRoot, "docs/reports/submission/team-info.md", `| URL | ${status} |\n`);
  await writeText(repoRoot, "docs/reports/submission/checklist.md", "- [x] 6.10 前对外提交\n");
  await writeText(repoRoot, "docs/reports/submission/public-repo-guide.md", `| 远端公开 URL | ${repoUrl} |\n`);
}

async function writeJson(repoRoot, relativePath, value) {
  await writeText(repoRoot, relativePath, JSON.stringify(value));
}

async function writeText(repoRoot, relativePath, text) {
  await mkdir(path.dirname(path.join(repoRoot, relativePath)), { recursive: true });
  await writeFile(path.join(repoRoot, relativePath), text);
}

async function runCheck(repoRoot, extraArgs = []) {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [SCRIPT_PATH, ...extraArgs, "--repo", repoRoot]);
    return { code: 0, summary: JSON.parse(stdout), stderr };
  } catch (error) {
    return { code: error.code, summary: JSON.parse(error.stdout), stderr: error.stderr };
  }
}

async function runRawCheck(args = []) {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [SCRIPT_PATH, ...args]);
    return { code: 0, summary: JSON.parse(stdout), stderr };
  } catch (error) {
    return { code: error.code, summary: JSON.parse(error.stdout), stderr: error.stderr };
  }
}

function countChecks(checks) {
  return {
    total: checks.length,
    passed: checks.filter((check) => check.status === "passed").length,
    failed: checks.filter((check) => check.status === "failed").length,
  };
}
