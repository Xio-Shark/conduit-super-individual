import assert from "node:assert/strict";
import test from "node:test";
import { runBuildEmbeddingsCli } from "./build-embeddings.mjs";

test("build embeddings CLI prints JSON summary on success", async () => {
  const captured = await captureCli(() => runBuildEmbeddingsCli({
    projectRoot: "/tmp/project-root",
    indexRuns: async (projectRoot) => {
      assert.equal(projectRoot, "/tmp/project-root");
      return [{ runId: "run-1" }, { runId: "run-2" }];
    },
    writeIndex: async (projectRoot, records) => {
      assert.equal(projectRoot, "/tmp/project-root");
      assert.equal(records.length, 2);
      return "/tmp/project-root/docs/reports/run-index/embeddings.jsonl";
    },
  }));

  assert.equal(captured.exitCode, undefined);
  assert.equal(captured.payload.mode, "build-embeddings");
  assert.equal(captured.payload.status, "passed");
  assert.equal(captured.payload.recordCount, 2);
  assert.match(captured.payload.outputPath, /embeddings\.jsonl$/);
  assert.deepEqual(captured.payload.checkCounts, countChecks(captured.payload.checks));
  assert.equal(captured.payload.checks[0].name, "embeddings-index-written");
});

test("build embeddings CLI prints JSON fatal on failure", async () => {
  const captured = await captureCli(() => runBuildEmbeddingsCli({
    indexRuns: async () => {
      throw new Error("cannot read run archive");
    },
  }));

  assert.equal(captured.exitCode, 1);
  assert.equal(captured.payload.mode, "build-embeddings");
  assert.equal(captured.payload.status, "failed");
  assert.deepEqual(captured.payload.checkCounts, countChecks(captured.payload.checks));
  assert.equal(captured.payload.checks[0].name, "fatal");
  assert.equal(captured.payload.checks[0].detail, "cannot read run archive");
});

test("build embeddings CLI rejects unknown flags before writing index", async () => {
  let indexed = false;
  let wrote = false;
  const captured = await captureCli(() => runBuildEmbeddingsCli({
    args: ["--bogus"],
    indexRuns: async () => {
      indexed = true;
      return [{ runId: "run-1" }];
    },
    writeIndex: async () => {
      wrote = true;
      return "/tmp/project-root/docs/reports/run-index/embeddings.jsonl";
    },
  }));

  assert.equal(captured.exitCode, 1);
  assert.equal(indexed, false);
  assert.equal(wrote, false);
  assert.equal(captured.payload.mode, "build-embeddings");
  assert.equal(captured.payload.status, "failed");
  assert.match(captured.payload.checks[0].detail, /Usage: node scripts\/build-embeddings\.mjs/);
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
