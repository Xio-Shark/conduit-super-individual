import assert from "node:assert/strict";
import test from "node:test";
import { runResumeClarifyCli } from "./resume-clarify.mjs";

test("resume clarify CLI prints JSON fatal when run id is missing", async () => {
  const captured = await captureCli(() => runResumeClarifyCli({ args: [] }));

  assert.equal(captured.exitCode, 1);
  assert.equal(captured.payload.mode, "resume-clarify");
  assert.equal(captured.payload.status, "failed");
  assert.deepEqual(captured.payload.checkCounts, countChecks(captured.payload.checks));
  assert.equal(captured.payload.checks[0].name, "fatal");
  assert.match(captured.payload.checks[0].detail, /resume-clarify\.mjs <runId>/);
});

test("resume clarify CLI prints JSON summary on paused run", async () => {
  const captured = await captureCli(() => runResumeClarifyCli({
    args: ["run-1"],
    projectRoot: "/tmp/project-root",
    resume: async (options) => {
      assert.deepEqual(options, {
        runId: "run-1",
        stage: "clarifying",
        projectRoot: "/tmp/project-root",
      });
      return {
        runId: "run-1",
        status: "paused",
        stage: "clarifying",
        evidenceDir: "docs/reports/runs/run-1",
      };
    },
  }));

  assert.equal(captured.exitCode, undefined);
  assert.equal(captured.payload.mode, "resume-clarify");
  assert.equal(captured.payload.status, "paused");
  assert.equal(captured.payload.evidenceDir, "docs/reports/runs/run-1");
  assert.deepEqual(captured.payload.checkCounts, countChecks(captured.payload.checks));
  assert.equal(captured.payload.checks[0].name, "resume-clarify-result");
  assert.equal(captured.payload.checks[0].status, "passed");
});

test("resume clarify CLI accepts --json as a compatibility no-op", async () => {
  const captured = await captureCli(() => runResumeClarifyCli({
    args: ["--json", "run-1"],
    projectRoot: "/tmp/project-root",
    resume: async (options) => {
      assert.equal(options.runId, "run-1");
      return {
        runId: "run-1",
        status: "paused",
        stage: "clarifying",
        evidenceDir: "docs/reports/runs/run-1",
      };
    },
  }));

  assert.equal(captured.exitCode, undefined);
  assert.equal(captured.payload.status, "paused");
});

test("resume clarify CLI rejects unknown flags before resuming", async () => {
  let resumed = false;
  const captured = await captureCli(() => runResumeClarifyCli({
    args: ["--run-id", "run-1"],
    resume: async () => {
      resumed = true;
      return { runId: "run-1", status: "paused", stage: "clarifying" };
    },
  }));

  assert.equal(captured.exitCode, 1);
  assert.equal(resumed, false);
  assert.equal(captured.payload.mode, "resume-clarify");
  assert.equal(captured.payload.status, "failed");
  assert.equal(captured.payload.runId, undefined);
  assert.match(captured.payload.checks[0].detail, /Usage: node scripts\/resume-clarify\.mjs/);
});

test("resume clarify CLI rejects extra positional args before resuming", async () => {
  let resumed = false;
  const captured = await captureCli(() => runResumeClarifyCli({
    args: ["run-1", "run-2"],
    resume: async () => {
      resumed = true;
      return { runId: "run-1", status: "paused", stage: "clarifying" };
    },
  }));

  assert.equal(captured.exitCode, 1);
  assert.equal(resumed, false);
  assert.equal(captured.payload.status, "failed");
  assert.match(captured.payload.checks[0].detail, /Usage: node scripts\/resume-clarify\.mjs/);
});

test("resume clarify CLI prints JSON fatal when resume fails", async () => {
  const captured = await captureCli(() => runResumeClarifyCli({
    args: ["run-1"],
    resume: async () => {
      throw new Error("missing upstream state");
    },
  }));

  assert.equal(captured.exitCode, 1);
  assert.equal(captured.payload.mode, "resume-clarify");
  assert.equal(captured.payload.status, "failed");
  assert.equal(captured.payload.runId, "run-1");
  assert.deepEqual(captured.payload.checkCounts, countChecks(captured.payload.checks));
  assert.equal(captured.payload.checks[0].detail, "missing upstream state");
});

async function captureCli(action) {
  const originalLog = console.log;
  const originalExitCode = process.exitCode;
  const lines = [];
  let exitCode;

  console.log = (value) => lines.push(value);
  process.exitCode = undefined;

  try {
    await action();
    if (process.exitCode !== undefined) exitCode = process.exitCode;
  } finally {
    console.log = originalLog;
    process.exitCode = originalExitCode;
  }

  assert.equal(lines.length, 1);
  return {
    exitCode,
    payload: JSON.parse(lines[0]),
  };
}

function countChecks(checks) {
  return {
    total: checks.length,
    passed: checks.filter((check) => check.status === "passed").length,
    failed: checks.filter((check) => check.status === "failed").length,
  };
}
