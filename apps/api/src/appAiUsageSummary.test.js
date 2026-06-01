import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createApp } from "./app.js";

test("GET /api/ai-usage/summary aggregates archived runs", async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "ai-usage-api-"));
  const runsDir = path.join(projectRoot, "docs/reports/runs");
  await mkdir(path.join(runsDir, "run-summary-test"), { recursive: true });
  await writeFile(
    path.join(runsDir, "run-summary-test/run-summary.json"),
    JSON.stringify({
      status: "passed",
      aiUsage: {
        stages: 1,
        tokensIn: 5,
        tokensOut: 7,
        latencyMs: 50,
        costEstimate: 0.002,
      },
    }),
  );
  await writeFile(
    path.join(runsDir, "run-summary-test/ai-calls.jsonl"),
    `${JSON.stringify({ model: "mimo-v2.5", tokens_in: 5, tokens_out: 7, latency_ms: 50, cost_estimate: 0.002 })}\n`,
  );

  const app = createApp({ projectRoot });
  const server = app.listen(0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${baseUrl}/api/ai-usage/summary`);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.status, "ready");
    assert.equal(payload.runCount, 1);
    assert.equal(payload.totals.tokensIn, 5);
    assert.equal(payload.runs[0].runId, "run-summary-test");
  } finally {
    server.close();
  }
});

test("GET /api/ai-usage/summary exposes missing status when no passed run can be aggregated", async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "ai-usage-api-"));
  const runsDir = path.join(projectRoot, "docs/reports/runs");
  await mkdir(path.join(runsDir, "run-failed"), { recursive: true });
  await writeFile(
    path.join(runsDir, "run-failed/run-summary.json"),
    JSON.stringify({
      status: "failed",
      aiUsage: {
        stages: 1,
        tokensIn: 5,
        tokensOut: 7,
        latencyMs: 50,
        costEstimate: 0.002,
      },
    }),
  );
  await writeFile(
    path.join(runsDir, "run-failed/ai-calls.jsonl"),
    `${JSON.stringify({ model: "mimo-v2.5", tokens_in: 5, tokens_out: 7, latency_ms: 50, cost_estimate: 0.002 })}\n`,
  );

  const app = createApp({ projectRoot });
  const server = app.listen(0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${baseUrl}/api/ai-usage/summary`);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.status, "missing");
    assert.equal(payload.runCount, 0);
    assert.match(payload.skipped.at(-1).reason, /no passed runs/);
  } finally {
    server.close();
  }
});
