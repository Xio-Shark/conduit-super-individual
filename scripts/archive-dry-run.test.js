import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const SCRIPT_PATH = fileURLToPath(new URL("archive-dry-run.mjs", import.meta.url));
const HEX_SHA256 = /^[a-f0-9]{64}$/u;

test("archive dry-run passes for a complete candidate package", async () => {
  const projectRoot = await makeProjectRoot("archive-dry-run-pass-");

  try {
    await writeCandidatePackage(projectRoot);
    await writeFile(path.join(projectRoot, "apps/web/dist/ignored.js"), "ignored");
    await writeFile(path.join(projectRoot, "node_modules/ignored.js"), "ignored");
    await writeFile(path.join(projectRoot, "test-results/ignored.txt"), "ignored");

    const result = await runArchiveDryRun(projectRoot);

    assert.equal(result.code, 0);
    assert.equal(result.summary.status, "passed");
    assert.equal(result.summary.mode, "dry-run");
    assert.equal(result.summary.runCount, 1);
    assert.equal(result.summary.runs[0], "run-complete");
    assert.equal(result.summary.fileCount, 12);
    assert.deepEqual(result.summary.checkCounts, countChecks(result.summary.checks));
    assert.deepEqual(result.summary.checks, [
      {
        name: "archive-content",
        status: "passed",
        detail: "12 file(s) ready for archive",
      },
    ]);
    assert.match(result.summary.manifestHash, HEX_SHA256);
    assert.match(result.summary.contentHash, HEX_SHA256);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("archive dry-run fails when required run evidence is missing", async () => {
  const projectRoot = await makeProjectRoot("archive-dry-run-missing-");

  try {
    await writeCandidatePackage(projectRoot, { missingRunFile: "pr-draft.md" });

    const result = await runArchiveDryRun(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.deepEqual(result.summary.checkCounts, countChecks(result.summary.checks));
    assert.match(JSON.stringify(result.summary.checks), /missing required archive path: docs\/reports\/runs\/run-complete\/pr-draft\.md/);
    assert.equal(result.stderr, "");
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("archive dry-run fails when an included text file contains a secret pattern", async () => {
  const projectRoot = await makeProjectRoot("archive-dry-run-secret-");

  try {
    await writeCandidatePackage(projectRoot);
    await writeFile(path.join(projectRoot, "README.md"), `token ${"sk-" + "a".repeat(24)}`);

    const result = await runArchiveDryRun(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.match(JSON.stringify(result.summary.checks), /possible secret pattern in archive path: README\.md/);
    assert.equal(result.stderr, "");
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("archive dry-run returns JSON when manifest is missing", async () => {
  const projectRoot = await makeProjectRoot("archive-dry-run-missing-manifest-");

  try {
    const result = await runArchiveDryRun(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "dry-run");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.checks[0].name, "fatal");
    assert.match(result.summary.checks[0].detail, /archive-manifest\.json/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("archive dry-run returns JSON when an include path escapes project root", async () => {
  const projectRoot = await makeProjectRoot("archive-dry-run-escape-");

  try {
    await mkdir(path.join(projectRoot, "docs/reports/runs/run-complete"), { recursive: true });
    await writeManifest(projectRoot, { include: ["../outside"] });

    const result = await runArchiveDryRun(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "dry-run");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.checks[0].name, "fatal");
    assert.match(result.summary.checks[0].detail, /archive path escapes project root: \.\.\/outside/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

async function makeProjectRoot(prefix) {
  const projectRoot = await mkdtemp(path.join(tmpdir(), prefix));
  await mkdir(path.join(projectRoot, "scripts"), { recursive: true });
  await copyFile(SCRIPT_PATH, path.join(projectRoot, "scripts/archive-dry-run.mjs"));
  return projectRoot;
}

async function writeCandidatePackage(projectRoot, options = {}) {
  await mkdir(path.join(projectRoot, "apps/web/dist"), { recursive: true });
  await mkdir(path.join(projectRoot, "docs/reports/runs/run-complete"), { recursive: true });
  await mkdir(path.join(projectRoot, "node_modules"), { recursive: true });
  await mkdir(path.join(projectRoot, "test-results"), { recursive: true });
  await writeManifest(projectRoot);
  await writeFile(path.join(projectRoot, "README.md"), "# Candidate\n");
  await writeFile(path.join(projectRoot, ".env"), "LOCAL_ONLY=1\n");
  await writeFile(path.join(projectRoot, ".env.example"), "AI_MODE=rules\n");
  const runFiles = [
    "requirement.md",
    "history-recall.json",
    "plan.md",
    "diff.patch",
    "verification.json",
    "run-summary.json",
    "pr-draft.md",
    "ai-calls.jsonl"
  ];
  for (const file of runFiles) {
    if (file !== options.missingRunFile) {
      await writeFile(path.join(projectRoot, "docs/reports/runs/run-complete", file), `${file}\n`);
    }
  }
}

async function writeManifest(projectRoot, overrides = {}) {
  await writeFile(path.join(projectRoot, "scripts/archive-manifest.json"), JSON.stringify({
    include: [
      "README.md",
      ".env.example",
      ".env",
      "apps",
      "node_modules",
      "scripts",
      "test-results"
    ],
    runIds: ["run-complete"],
    required: ["README.md", ".env.example", "scripts/archive-dry-run.mjs"],
    requiredRunFiles: [
      "requirement.md",
      "history-recall.json",
      "plan.md",
      "diff.patch",
      "verification.json",
      "run-summary.json",
      "pr-draft.md",
      "ai-calls.jsonl"
    ],
    denyPrefixes: ["apps/web/dist/", "test-results/"],
    denySegments: [".git", "node_modules"],
    ...overrides,
  }));
}

async function runArchiveDryRun(projectRoot) {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [path.join(projectRoot, "scripts/archive-dry-run.mjs")], { cwd: projectRoot });
    return { code: 0, summary: JSON.parse(stdout), stderr };
  } catch (error) {
    return {
      code: error.code,
      summary: JSON.parse(error.stdout),
      stderr: error.stderr
    };
  }
}

function countChecks(checks) {
  return {
    total: checks.length,
    passed: checks.filter((check) => check.status === "passed").length,
    failed: checks.filter((check) => check.status === "failed").length,
  };
}
