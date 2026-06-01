import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { summarizeCrossRunAiUsage } from "./aiUsageSummary.js";

test("summarizeCrossRunAiUsage aggregates archived runs", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ai-usage-summary-"));
  const runsDir = path.join(root, "docs/reports/runs");
  await mkdir(path.join(runsDir, "run-a"), { recursive: true });
  await mkdir(path.join(runsDir, "run-b"), { recursive: true });
  await writeRunSummary(path.join(runsDir, "run-a/run-summary.json"), {
    stages: 1,
    tokensIn: 0,
    tokensOut: 0,
    latencyMs: 1,
    costEstimate: 0,
  });
  await writeRunSummary(path.join(runsDir, "run-b/run-summary.json"), {
    stages: 1,
    tokensIn: 10,
    tokensOut: 20,
    latencyMs: 100,
    costEstimate: 0.01,
  });
  await writeFile(
    path.join(runsDir, "run-a/ai-calls.jsonl"),
    `${JSON.stringify({ model: "rules-first-p0", tokens_in: 0, tokens_out: 0, latency_ms: 1, cost_estimate: 0 })}\n`,
  );
  await writeFile(
    path.join(runsDir, "run-b/ai-calls.jsonl"),
    `${JSON.stringify({ model: "mimo-v2.5", tokens_in: 10, tokens_out: 20, latency_ms: 100, cost_estimate: 0.01 })}\n`,
  );

  const summary = await summarizeCrossRunAiUsage(root);

  assert.equal(summary.status, "ready");
  assert.equal(summary.runCount, 2);
  assert.equal(summary.totals.tokensIn, 10);
  assert.equal(summary.totals.tokensOut, 20);
  assert.equal(summary.runs[0].runId, "run-b");
  assert.deepEqual(summary.skipped, []);
});

test("summarizeCrossRunAiUsage skips failed and incomplete archives explicitly", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ai-usage-summary-"));
  const runsDir = path.join(root, "docs/reports/runs");
  await mkdir(path.join(runsDir, "run-passed"), { recursive: true });
  await mkdir(path.join(runsDir, "run-failed"), { recursive: true });
  await mkdir(path.join(runsDir, "run-legacy"), { recursive: true });
  await writeRunSummary(path.join(runsDir, "run-passed/run-summary.json"), {
    stages: 1,
    tokensIn: 8,
    tokensOut: 13,
    latencyMs: 90,
    costEstimate: 0.01,
  });
  await writeRunSummary(path.join(runsDir, "run-failed/run-summary.json"), {
    stages: 1,
    tokensIn: 1000,
    tokensOut: 1000,
    latencyMs: 1,
    costEstimate: 1,
  }, "failed");
  await writeFile(
    path.join(runsDir, "run-passed/ai-calls.jsonl"),
    `${JSON.stringify({ model: "mimo-v2.5", tokens_in: 8, tokens_out: 13, latency_ms: 90, cost_estimate: 0.01 })}\n`,
  );
  await writeFile(
    path.join(runsDir, "run-failed/ai-calls.jsonl"),
    `${JSON.stringify({ model: "mimo-v2.5", tokens_in: 1000, tokens_out: 1000, latency_ms: 1, cost_estimate: 1 })}\n`,
  );

  const summary = await summarizeCrossRunAiUsage(root);

  assert.equal(summary.status, "degraded");
  assert.equal(summary.runCount, 1);
  assert.equal(summary.totals.tokensIn, 8);
  assert.deepEqual(summary.runs.map((run) => run.runId), ["run-passed"]);
  assert.deepEqual(
    summary.skipped.map((run) => run.runId).sort(),
    ["run-failed", "run-legacy"],
  );
  assert.match(summary.skipped.find((run) => run.runId === "run-failed").reason, /status/);
  assert.match(summary.skipped.find((run) => run.runId === "run-legacy").reason, /run-summary/);
});

test("summarizeCrossRunAiUsage skips archives with string aiUsage numbers", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ai-usage-summary-"));
  const runsDir = path.join(root, "docs/reports/runs");
  await mkdir(path.join(runsDir, "run-string-usage"), { recursive: true });
  await writeRunSummary(path.join(runsDir, "run-string-usage/run-summary.json"), {
    stages: 1,
    tokensIn: "5",
    tokensOut: 7,
    latencyMs: 50,
    costEstimate: 0.002,
  });
  await writeFile(
    path.join(runsDir, "run-string-usage/ai-calls.jsonl"),
    `${JSON.stringify({ model: "mimo-v2.5", tokens_in: 5, tokens_out: 7, latency_ms: 50, cost_estimate: 0.002 })}\n`,
  );

  const summary = await summarizeCrossRunAiUsage(root);

  assert.equal(summary.status, "missing");
  assert.equal(summary.runCount, 0);
  assert.match(summary.skipped[0].reason, /aiUsage\.tokensIn must be a finite JSON number/);
});

test("summarizeCrossRunAiUsage skips archives with string ai-call numbers", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ai-usage-summary-"));
  const runsDir = path.join(root, "docs/reports/runs");
  await mkdir(path.join(runsDir, "run-string-call"), { recursive: true });
  await writeRunSummary(path.join(runsDir, "run-string-call/run-summary.json"), {
    stages: 1,
    tokensIn: 5,
    tokensOut: 7,
    latencyMs: 50,
    costEstimate: 0.002,
  });
  await writeFile(
    path.join(runsDir, "run-string-call/ai-calls.jsonl"),
    `${JSON.stringify({ model: "mimo-v2.5", tokens_in: "5", tokens_out: 7, latency_ms: 50, cost_estimate: 0.002 })}\n`,
  );

  const summary = await summarizeCrossRunAiUsage(root);

  assert.equal(summary.status, "missing");
  assert.equal(summary.runCount, 0);
  assert.match(summary.skipped[0].reason, /tokens_in must be a finite JSON number/);
});

test("summarizeCrossRunAiUsage returns missing when no passed run can be aggregated", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ai-usage-summary-"));
  const runsDir = path.join(root, "docs/reports/runs");
  await mkdir(path.join(runsDir, "run-failed"), { recursive: true });
  await writeRunSummary(path.join(runsDir, "run-failed/run-summary.json"), {
    stages: 1,
    tokensIn: 3,
    tokensOut: 5,
    latencyMs: 20,
    costEstimate: 0.001,
  }, "failed");
  await writeFile(
    path.join(runsDir, "run-failed/ai-calls.jsonl"),
    `${JSON.stringify({ model: "mimo-v2.5", tokens_in: 3, tokens_out: 5, latency_ms: 20, cost_estimate: 0.001 })}\n`,
  );

  const summary = await summarizeCrossRunAiUsage(root);

  assert.equal(summary.status, "missing");
  assert.equal(summary.runCount, 0);
  assert.match(summary.skipped.at(-1).reason, /no passed runs/);
});

async function writeRunSummary(filePath, aiUsage, status = "passed") {
  await writeFile(filePath, JSON.stringify({ status, aiUsage }));
}
