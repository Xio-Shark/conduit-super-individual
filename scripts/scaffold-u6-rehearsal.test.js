import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const SCRIPT_PATH = fileURLToPath(new URL("scaffold-u6-rehearsal.mjs", import.meta.url));

test("U6 rehearsal scaffold writes a placeholder manifest for three tasks", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "u6-scaffold-"));
  try {
    const output = "docs/reports/submission/u6-rehearsal-manifest.template.json";
    const result = await execFileAsync(process.execPath, [SCRIPT_PATH, "--output", output], {
      env: { ...process.env, U6_PROJECT_ROOT: projectRoot },
    });
    const summary = JSON.parse(result.stdout);
    const manifest = JSON.parse(await readFile(path.join(projectRoot, output), "utf8"));

    assert.equal(summary.mode, "u6-rehearsal-scaffold");
    assert.equal(summary.status, "scaffolded");
    assert.equal(summary.finalPath, "docs/reports/submission/u6-rehearsal-manifest.json");
    assert.equal(summary.nextSteps.copyFrom, output);
    assert.equal(summary.nextSteps.writeTo, summary.finalPath);
    assert.match(summary.nextSteps.validateWith, /check:u6 -- --manifest docs\/reports\/submission\/u6-rehearsal-manifest\.json/);
    assert.equal(summary.rehearsalCount, 3);
    assert.deepEqual(summary.checkCounts, countChecks(summary.checks));
    assert.equal(summary.checks[0].name, "u6-manifest-template");
    assert.equal(manifest.minRehearsals, 3);
    assert.equal(manifest.minPassed, 2);
    assert.equal(manifest.maxMinutes, 15);
    assert.equal(manifest.rehearsals.length, 3);
    assert.deepEqual(
      manifest.rehearsals.map((rehearsal) => rehearsal.skillId),
      ["comment-draft-counter", "profile-account-age", "article-favorite-filter-toggle"],
    );
    assert.deepEqual(
      manifest.rehearsals.map((rehearsal) => rehearsal.implementationChangeList),
      [
        "docs/reports/submission/u6-change-lists/comment-draft-counter.txt",
        "docs/reports/submission/u6-change-lists/profile-account-age.txt",
        "docs/reports/submission/u6-change-lists/article-favorite-filter-toggle.txt",
      ],
    );
    assert.equal(manifest.rehearsals.every((rehearsal) => rehearsal.startedAt === "REPLACE_WITH_START_ISO"), true);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("U6 rehearsal scaffold quotes custom final manifest paths in next steps", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "u6-scaffold-custom-path-"));
  try {
    const output = "docs/reports/submission/custom u6.template.json";
    const result = await execFileAsync(process.execPath, [SCRIPT_PATH, "--output", output], {
      env: { ...process.env, U6_PROJECT_ROOT: projectRoot },
    });
    const summary = JSON.parse(result.stdout);

    assert.equal(summary.finalPath, "docs/reports/submission/custom u6.json");
    assert.equal(
      summary.checkCommand,
      "npm run check:u6 -- --manifest 'docs/reports/submission/custom u6.json'",
    );
    assert.equal(summary.nextSteps.validateWith, summary.checkCommand);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("U6 rehearsal scaffold rejects output paths outside the project", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "u6-scaffold-outside-"));
  try {
    const result = await runScaffold(projectRoot, ["--output", "../manifest.json"]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "u6-rehearsal-scaffold");
    assert.equal(result.summary.status, "failed");
    assert.deepEqual(result.summary.checkCounts, countChecks(result.summary.checks));
    assert.equal(result.summary.checks[0].name, "fatal");
    assert.match(result.summary.checks[0].detail, /outside project root/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("U6 rehearsal scaffold refuses final evidence output", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "u6-scaffold-final-"));
  try {
    const result = await runScaffold(projectRoot, ["--output", "docs/reports/submission/u6-rehearsal-manifest.json"]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "u6-rehearsal-scaffold");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.checks[0].name, "fatal");
    assert.match(result.summary.checks[0].detail, /Refusing to write U6 rehearsal manifest template to final evidence file/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("U6 rehearsal scaffold refuses symlinked parent outside project", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "u6-scaffold-symlink-"));
  const outsideRoot = await mkdtemp(path.join(tmpdir(), "u6-scaffold-outside-parent-"));
  try {
    await mkdir(path.join(projectRoot, "docs/reports/submission"), { recursive: true });
    await symlink(outsideRoot, path.join(projectRoot, "docs/reports/submission/link"));
    const result = await runScaffold(projectRoot, ["--output", "docs/reports/submission/link/u6-rehearsal-manifest.template.json"]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "u6-rehearsal-scaffold");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.checks[0].name, "fatal");
    assert.match(result.summary.checks[0].detail, /symlinked parent outside project root/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
    await rm(outsideRoot, { force: true, recursive: true });
  }
});

test("U6 rehearsal scaffold returns JSON when CLI arguments are invalid", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "u6-scaffold-invalid-"));
  try {
    const result = await runScaffold(projectRoot, ["--bogus"]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "u6-rehearsal-scaffold");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.checks[0].name, "fatal");
    assert.match(result.summary.checks[0].detail, /Usage: node scripts\/scaffold-u6-rehearsal\.mjs/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("U6 rehearsal scaffold rejects option flags used as missing values", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "u6-scaffold-missing-flag-value-"));
  try {
    const result = await runScaffold(projectRoot, ["--output", "--bogus"]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "u6-rehearsal-scaffold");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.checks[0].name, "fatal");
    assert.match(result.summary.checks[0].detail, /Usage: node scripts\/scaffold-u6-rehearsal\.mjs/);
    assert.equal(result.stderr, "");
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

async function runScaffold(projectRoot, args) {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [SCRIPT_PATH, ...args], {
      env: { ...process.env, U6_PROJECT_ROOT: projectRoot },
    });
    return { code: 0, summary: JSON.parse(stdout), stderr };
  } catch (error) {
    return {
      code: error.code,
      summary: JSON.parse(error.stdout),
      stderr: error.stderr,
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
