import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import {
  makeProjectRoot,
  writeManifestEvidence,
  writeRehearsalEvidence,
} from "./u6-rehearsal-test-fixtures.mjs";

const execFileAsync = promisify(execFile);
const SCRIPT_PATH = fileURLToPath(new URL("check-u6-rehearsal.mjs", import.meta.url));

test("U6 rehearsal check passes when local evidence is complete", async () => {
  const projectRoot = await makeProjectRoot("u6-pass-");

  try {
    await writeRehearsalEvidence(projectRoot);
    const result = await runCheck(projectRoot);

    assert.equal(result.code, 0);
    assert.equal(result.summary.status, "passed");
    assert.equal(result.summary.checks.every((check) => check.status === "passed"), true);
    assert.deepEqual(result.summary.checkCounts, countChecks(result.summary.checks));
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("U6 rehearsal check accepts --json as a compatibility no-op", async () => {
  const projectRoot = await makeProjectRoot("u6-json-");

  try {
    await writeRehearsalEvidence(projectRoot);
    const result = await runCheck(projectRoot, { json: true });

    assert.equal(result.code, 0);
    assert.equal(result.summary.mode, "single");
    assert.equal(result.summary.status, "passed");
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("U6 rehearsal check returns JSON when required CLI options are missing", async () => {
  const projectRoot = await makeProjectRoot("u6-missing-options-");

  try {
    const result = await runRawCheck(projectRoot, ["--json"]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "single");
    assert.equal(result.summary.status, "failed");
    assert.deepEqual(result.summary.checkCounts, countChecks(result.summary.checks));
    assert.match(JSON.stringify(result.summary.checks), /missing required option/);
    assert.equal(result.stderr, "");
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("U6 rehearsal check rejects option flags used as missing values", async () => {
  const projectRoot = await makeProjectRoot("u6-missing-flag-value-");

  try {
    const result = await runRawCheck(projectRoot, ["--manifest", "--run-id"]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "u6-rehearsal-check");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.checks[0].name, "fatal");
    assert.match(result.summary.checks[0].detail, /Usage: node scripts\/check-u6-rehearsal\.mjs/);
    assert.equal(result.stderr, "");
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("U6 rehearsal check fails when rehearsal exceeds the time limit", async () => {
  const projectRoot = await makeProjectRoot("u6-slow-");

  try {
    await writeRehearsalEvidence(projectRoot);
    const result = await runCheck(projectRoot, {
      endedAt: "2026-05-24T10:20:30+08:00",
    });

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.match(JSON.stringify(result.summary.checks), /exceeds 15/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("U6 rehearsal check fails when verification did not pass", async () => {
  const projectRoot = await makeProjectRoot("u6-failed-");

  try {
    await writeRehearsalEvidence(projectRoot, { verificationStatus: "failed" });
    const result = await runCheck(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.match(JSON.stringify(result.summary.checks), /verification\.json must have status=passed/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("U6 rehearsal check fails when the Skill is not registered", async () => {
  const projectRoot = await makeProjectRoot("u6-unregistered-");

  try {
    await writeRehearsalEvidence(projectRoot, { registerSkill: false });
    const result = await runCheck(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.match(JSON.stringify(result.summary.checks), /registry must import/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("U6 rehearsal check fails when the implementation change list is missing", async () => {
  const projectRoot = await makeProjectRoot("u6-missing-change-list-");

  try {
    await writeRehearsalEvidence(projectRoot, { skipChangeList: true });
    const result = await runCheck(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.match(JSON.stringify(result.summary.checks), /implementation-change-list.*missing or unreadable/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("U6 rehearsal check fails when the implementation change list touches mainline code", async () => {
  const projectRoot = await makeProjectRoot("u6-mainline-change-");

  try {
    await writeRehearsalEvidence(projectRoot, {
      changeListPaths: [
        "services/skills/src/commentDraftCounter.js",
        "services/skills/src/registry.js",
        "services/orchestrator/src/deliveryPipeline.js",
        "docs/reports/runs/run-u6-demo/requirement.md",
        "docs/reports/runs/run-u6-demo/plan.md",
        "docs/reports/runs/run-u6-demo/diff.patch",
        "docs/reports/runs/run-u6-demo/verification.json",
        "docs/reports/runs/run-u6-demo/run-summary.json",
        "docs/reports/submission/u6-recordings/comment-counter.mp4",
        "docs/reports/submission/u6-change-lists/comment-counter.txt",
      ],
    });
    const result = await runCheck(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.match(JSON.stringify(result.summary.checks), /disallowed mainline change/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("U6 manifest check passes when at least two rehearsals pass", async () => {
  const projectRoot = await makeProjectRoot("u6-manifest-pass-");

  try {
    const manifest = await writeManifestEvidence(projectRoot, {
      slowRunIds: ["run-u6-profile-age"],
    });
    const result = await runManifestCheck(projectRoot, manifest);

    assert.equal(result.code, 0);
    assert.equal(result.summary.status, "passed");
    assert.equal(result.summary.rehearsalCount, 3);
    assert.equal(result.summary.passedCount, 2);
    assert.equal(result.summary.failedCount, 1);
    assert.deepEqual(result.summary.manifestCheckCounts, countChecks(result.summary.manifestChecks));
    assert.deepEqual(result.summary.rehearsalCheckCounts, countChecks(result.summary.rehearsals.flatMap((rehearsal) => rehearsal.checks)));
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("U6 manifest check fails when fewer than two rehearsals pass", async () => {
  const projectRoot = await makeProjectRoot("u6-manifest-fail-");

  try {
    const manifest = await writeManifestEvidence(projectRoot, {
      slowRunIds: ["run-u6-profile-age", "run-u6-favorite-filter"],
    });
    const result = await runManifestCheck(projectRoot, manifest);

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.passedCount, 1);
    assert.match(JSON.stringify(result.summary.manifestChecks), /fewer than 2/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("U6 manifest check returns JSON when the manifest file is missing", async () => {
  const projectRoot = await makeProjectRoot("u6-missing-manifest-");

  try {
    const result = await runManifestCheck(projectRoot, "docs/reports/submission/missing-u6.json");

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "u6-rehearsal-check");
    assert.equal(result.summary.status, "failed");
    assert.deepEqual(result.summary.checkCounts, countChecks(result.summary.checks));
    assert.match(JSON.stringify(result.summary.checks), /missing or unreadable file/);
    assert.equal(result.stderr, "");
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

async function runCheck(projectRoot, options = {}) {
  const args = [
    ...(options.json ? ["--json"] : []),
    "--run-id", "run-u6-demo",
    "--skill-id", "comment-draft-counter",
    "--skill-file", "services/skills/src/commentDraftCounter.js",
    "--implementation-change-list", "docs/reports/submission/u6-change-lists/comment-counter.txt",
    "--started-at", "2026-05-24T10:00:00+08:00",
    "--ended-at", options.endedAt ?? "2026-05-24T10:12:30+08:00",
    "--recording", "docs/reports/submission/u6-recordings/comment-counter.mp4",
  ];

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

async function runManifestCheck(projectRoot, manifest) {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [SCRIPT_PATH, "--manifest", manifest], {
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

async function runRawCheck(projectRoot, args = []) {
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
