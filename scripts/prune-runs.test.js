import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { runPruneRunsCli } from "./prune-runs.mjs";

test("prune runs dry-run prints JSON summary", async () => {
  const captured = await captureCli(() => runPruneRunsCli({
    args: [],
    projectRoot: "/tmp/project-root",
    listArchives: async (projectRoot) => {
      assert.equal(projectRoot, "/tmp/project-root");
      return {
        prunedCandidates: [{ runId: "run-orphan", reason: "failure-only orphan" }],
      };
    },
    writeIndex: async (projectRoot) => {
      assert.equal(projectRoot, "/tmp/project-root");
      return { runCount: 7 };
    },
  }));

  assert.equal(captured.exitCode, undefined);
  assert.equal(captured.payload.mode, "dry-run");
  assert.equal(captured.payload.status, "passed");
  assert.equal(captured.payload.runCount, 7);
  assert.deepEqual(captured.payload.prunedCandidates, [
    { runId: "run-orphan", reason: "failure-only orphan" },
  ]);
  assert.match(captured.payload.indexPath, /docs\/reports\/runs\/index\.json$/);
  assert.deepEqual(captured.payload.checkCounts, countChecks(captured.payload.checks));
});

test("prune runs apply removes orphan candidates and prints JSON summary", async () => {
  const removed = [];
  let writeCount = 0;
  const captured = await captureCli(() => runPruneRunsCli({
    args: ["--apply"],
    projectRoot: "/tmp/project-root",
    listArchives: async () => ({
      prunedCandidates: [{ runId: "run-orphan", reason: "failure-only orphan" }],
    }),
    writeIndex: async () => {
      writeCount += 1;
      return { runCount: writeCount === 1 ? 8 : 7 };
    },
    remove: async (target, options) => {
      removed.push({ target, options });
    },
  }));

  assert.equal(captured.exitCode, undefined);
  assert.deepEqual(removed, [
    {
      target: "/tmp/project-root/docs/reports/runs/run-orphan",
      options: { recursive: true, force: true },
    },
  ]);
  assert.match(captured.lines[0], /removed run-orphan: failure-only orphan/);
  assert.equal(captured.payload.mode, "apply");
  assert.equal(captured.payload.status, "passed");
  assert.equal(captured.payload.removed, 1);
  assert.equal(captured.payload.runCount, 7);
  assert.deepEqual(captured.payload.checkCounts, countChecks(captured.payload.checks));
});

test("prune runs rejects unknown flags before deleting runs", async () => {
  const removed = [];
  let listed = false;
  let wroteIndex = false;
  const captured = await captureCli(() => runPruneRunsCli({
    args: ["--apply", "--bogus"],
    projectRoot: "/tmp/project-root",
    listArchives: async () => {
      listed = true;
      return { prunedCandidates: [{ runId: "run-orphan", reason: "failure-only orphan" }] };
    },
    writeIndex: async () => {
      wroteIndex = true;
      return { runCount: 7 };
    },
    remove: async (target) => {
      removed.push(target);
    },
  }));

  assert.equal(captured.exitCode, 1);
  assert.equal(listed, false);
  assert.equal(wroteIndex, false);
  assert.deepEqual(removed, []);
  assert.equal(captured.payload.mode, "prune-runs");
  assert.equal(captured.payload.status, "failed");
  assert.match(captured.payload.checks[0].detail, /Usage: node scripts\/prune-runs\.mjs/);
});

test("archive paused dry-run prints JSON fatal when runs dir is missing", async () => {
  const captured = await captureCli(() => runPruneRunsCli({
    args: ["--archive-paused"],
    projectRoot: "/tmp/project-root",
    exists: () => false,
  }));

  assert.equal(captured.exitCode, 1);
  assert.equal(captured.payload.mode, "prune-runs");
  assert.equal(captured.payload.status, "failed");
  assert.deepEqual(captured.payload.checkCounts, countChecks(captured.payload.checks));
  assert.equal(captured.payload.checks[0].name, "fatal");
  assert.match(captured.payload.checks[0].detail, /runs dir not found/);
});

test("archive paused apply rejects unknown flags before moving runs", async () => {
  const moved = [];
  let read = false;
  const captured = await captureCli(() => runPruneRunsCli({
    args: ["--archive-paused", "--apply", "--bogus"],
    projectRoot: "/tmp/project-root",
    exists: () => true,
    readDir: async () => {
      read = true;
      return [dirent("paused-run")];
    },
    move: async (from, to) => {
      moved.push({ from, to });
    },
  }));

  assert.equal(captured.exitCode, 1);
  assert.equal(read, false);
  assert.deepEqual(moved, []);
  assert.equal(captured.payload.mode, "prune-runs");
  assert.equal(captured.payload.status, "failed");
  assert.match(captured.payload.checks[0].detail, /Usage: node scripts\/prune-runs\.mjs/);
});

test("archive paused apply moves paused and failure-only runs", async () => {
  const moved = [];
  const dirs = [
    dirent("keep-run"),
    dirent("paused-run"),
    dirent("failed-run"),
    dirent("passed-run"),
  ];
  const existingFiles = new Set([
    "/tmp/project-root/docs/reports/runs/paused-run/paused.json",
    "/tmp/project-root/docs/reports/runs/failed-run/failure.json",
    "/tmp/project-root/docs/reports/runs/passed-run/run-summary.json",
  ]);

  const captured = await captureCli(() => runPruneRunsCli({
    args: ["--archive-paused", "--apply"],
    projectRoot: "/tmp/project-root",
    keepRuns: new Set(["keep-run"]),
    exists: (target) => target.endsWith("docs/reports/runs") || existingFiles.has(target),
    readDir: async () => dirs,
    makeDir: async (target, options) => {
      assert.equal(target, "/tmp/project-root/docs/reports/runs-archive");
      assert.deepEqual(options, { recursive: true });
    },
    move: async (from, to) => {
      moved.push({ from, to });
    },
    writeIndex: async () => ({ runCount: 2 }),
  }));

  assert.deepEqual(moved, [
    {
      from: "/tmp/project-root/docs/reports/runs/paused-run",
      to: "/tmp/project-root/docs/reports/runs-archive/paused-run",
    },
    {
      from: "/tmp/project-root/docs/reports/runs/failed-run",
      to: "/tmp/project-root/docs/reports/runs-archive/failed-run",
    },
  ]);
  assert.match(captured.lines[0], /archived paused-run: paused/);
  assert.match(captured.lines[1], /archived failed-run: failure-only/);
  assert.equal(captured.payload.mode, "archive-paused apply");
  assert.equal(captured.payload.status, "passed");
  assert.equal(captured.payload.archived, 2);
  assert.equal(captured.payload.runCount, 2);
  assert.deepEqual(captured.payload.checkCounts, countChecks(captured.payload.checks));
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

  assert.ok(lines.length >= 1);
  return {
    exitCode,
    lines,
    payload: JSON.parse(lines.at(-1)),
  };
}

function dirent(name) {
  return {
    name,
    isDirectory: () => true,
  };
}

function countChecks(checks) {
  return {
    total: checks.length,
    passed: checks.filter((check) => check.status === "passed").length,
    failed: checks.filter((check) => check.status === "failed").length,
  };
}
