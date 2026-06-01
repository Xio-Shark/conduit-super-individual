import assert from "node:assert/strict";
import test from "node:test";
import { runCli } from "./cli.js";

test("runCli returns JSON when requirement input is missing", async () => {
  const captured = await captureCli(() => {
    assert.throws(() => runCli({ args: [] }), /process exit 1/);
  });

  assert.equal(captured.exitCode, 1);
  assert.equal(captured.payload.mode, "delivery-cli");
  assert.equal(captured.payload.status, "failed");
  assert.equal(captured.payload.checks[0].name, "fatal");
  assert.match(captured.payload.checks[0].detail, /Requirement input is required/);
});

test("runCli prints passed delivery result as JSON", async () => {
  const captured = await captureCli(() => runCli({
    args: ["ship", "this"],
    projectRoot: "/tmp/project-root",
    runDelivery: async (options) => {
      assert.deepEqual(options, {
        input: "ship this",
        projectRoot: "/tmp/project-root",
      });
      return {
        runId: "run-1",
        status: "passed",
        stage: "ready_for_pr",
        evidenceDir: "docs/reports/runs/run-1",
      };
    },
  }));

  assert.equal(captured.exitCode, undefined);
  assert.equal(captured.payload.mode, "delivery-cli");
  assert.equal(captured.payload.status, "passed");
  assert.equal(captured.payload.runId, "run-1");
});

test("runCli returns JSON when delivery fails before evidence summary", async () => {
  const captured = await captureCli(() => runCli({
    args: ["ship"],
    runDelivery: async () => {
      throw new Error("AI_MODE is required");
    },
  }));

  assert.equal(captured.exitCode, 1);
  assert.equal(captured.payload.mode, "delivery-cli");
  assert.equal(captured.payload.status, "failed");
  assert.equal(captured.payload.checks[0].detail, "AI_MODE is required");
});

async function captureCli(action) {
  const originalLog = console.log;
  const originalExit = process.exit;
  const originalExitCode = process.exitCode;
  const lines = [];
  let exitCode;

  console.log = (value) => lines.push(value);
  process.exit = (code) => {
    exitCode = code;
    throw new Error(`process exit ${code}`);
  };
  process.exitCode = undefined;

  try {
    await action();
    if (process.exitCode !== undefined) exitCode = process.exitCode;
  } finally {
    console.log = originalLog;
    process.exit = originalExit;
    process.exitCode = originalExitCode;
  }

  assert.equal(lines.length, 1);
  return {
    exitCode,
    payload: JSON.parse(lines[0]),
  };
}
