import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "./app.js";
import {
  makeRunDir,
  mkdtempProjectRoot,
  postJson,
  successfulRun,
} from "./appTestHelpers.js";

test("POST /api/runs returns and stores failed run evidence", async () => {
  const evidenceDir = await makeRunDir("run-failed");
  const app = createApp({
    runDelivery: async () => {
      const error = new Error("Verification failed");
      error.runResult = {
        runId: "run-failed",
        stage: "failed",
        status: "failed",
        error: "Verification failed",
        evidenceDir,
        events: [{ stage: "failed", message: "Verification failed" }],
        aiCalls: [{
          stage: "clarify",
          model: "rules-first-p0",
          prompt_version: "rules-first-p0",
          input_summary: "test",
          output_summary: "展示阅读量",
          tokens_in: 0,
          tokens_out: 0,
          latency_ms: 0,
          cost_estimate: 0,
          status: "reviewed",
        }],
        aiUsage: {
          stages: 1,
          tokensIn: 0,
          tokensOut: 0,
          latencyMs: 0,
          costEstimate: 0,
        },
        verification: {
          status: "failed",
          checks: [{ command: "npm test", exitCode: 1 }],
        },
      };
      throw error;
    },
  });
  const server = app.listen(0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const response = await postJson(`${baseUrl}/api/runs`, { input: "test" });
    const payload = await response.json();

    assert.equal(response.status, 500);
    assert.equal(payload.run.runId, "run-failed");
    assert.equal(payload.run.status, "failed");

    const stored = await fetch(`${baseUrl}/api/runs/run-failed`);
    const storedPayload = await stored.json();
    assert.equal(stored.status, 200);
    assert.equal(storedPayload.stage, "failed");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("POST /api/runs rejects failed runs after clarify without AI evidence", async () => {
  const evidenceDir = await makeRunDir("run-failed-missing-ai");
  const app = createApp({
    runDelivery: async ({ input }) => {
      const error = new Error("Verification failed");
      error.runResult = {
        runId: "run-failed-missing-ai",
        stage: "failed",
        status: "failed",
        error: "Verification failed",
        evidenceDir,
        events: [{ stage: "failed", message: "Verification failed" }],
        requirementCard: { goal: "展示阅读量", source_input: input },
        verification: {
          status: "failed",
          checks: [{ command: "npm test", exitCode: 1 }],
        },
      };
      throw error;
    },
  });
  const server = app.listen(0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const response = await postJson(`${baseUrl}/api/runs`, { input: "test" });
    const payload = await response.json();

    assert.equal(response.status, 500);
    assert.equal(payload.error.message, "Run result aiUsage is required");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("POST /api/runs rejects requirement cards without source_input", async () => {
  const evidenceDir = await makeRunDir("run-missing-source-input");
  const app = createApp({
    runDelivery: async () => ({
      ...successfulRun({ runId: "run-missing-source-input", evidenceDir, input: "test" }),
      requirementCard: { goal: "展示阅读量" },
    }),
  });
  const server = app.listen(0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const response = await postJson(`${baseUrl}/api/runs`, { input: "test" });
    const payload = await response.json();

    assert.equal(response.status, 500);
    assert.equal(payload.error.message, "Run result requirementCard.source_input is required");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("POST /api/runs/:id/retry starts a new run with original input", async () => {
  const inputs = [];
  const root = await mkdtempProjectRoot("super-individual-api-");
  const app = createApp({
    runDelivery: async ({ input }) => {
      inputs.push(input);
      const evidenceDir = await makeRunDir(`run-${inputs.length}`, root);
      return successfulRun({ runId: `run-${inputs.length}`, evidenceDir, input });
    },
  });
  const server = app.listen(0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const first = await postJson(`${baseUrl}/api/runs`, { input: "original requirement" });
    const firstPayload = await first.json();
    const retry = await postJson(`${baseUrl}/api/runs/${firstPayload.runId}/retry`);
    const retryPayload = await retry.json();

    assert.equal(retry.status, 201);
    assert.deepEqual(inputs, ["original requirement", "original requirement"]);
    assert.equal(retryPayload.runId, "run-2");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("POST /api/runs/:id/retry accepts revised input and records source run", async () => {
  const inputs = [];
  const root = await mkdtempProjectRoot("super-individual-api-");
  const app = createApp({
    runDelivery: async ({ input }) => {
      inputs.push(input);
      const evidenceDir = await makeRunDir(`run-retry-${inputs.length}`, root);
      return successfulRun({ runId: `run-retry-${inputs.length}`, evidenceDir, input });
    },
  });
  const server = app.listen(0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const first = await postJson(`${baseUrl}/api/runs`, { input: "original" });
    const firstPayload = await first.json();
    const retry = await postJson(`${baseUrl}/api/runs/${firstPayload.runId}/retry`, {
      input: "revised",
    });
    const retryPayload = await retry.json();

    assert.equal(retry.status, 201);
    assert.deepEqual(inputs, ["original", "revised"]);
    assert.equal(retryPayload.retryOf, firstPayload.runId);
    assert.equal(retryPayload.sourceInput, "revised");
    assert.equal(retryPayload.events.at(-1).stage, "retry");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("POST /api/runs requires explicit input", async () => {
  const calls = [];
  const app = createApp({
    runDelivery: async ({ input }) => {
      calls.push(input);
      const evidenceDir = await makeRunDir("run-empty-input");
      return successfulRun({ runId: "run-empty-input", evidenceDir, input });
    },
  });
  const server = app.listen(0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const response = await postJson(`${baseUrl}/api/runs`, { input: "" });
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.error.message, "Requirement input is required");
    assert.deepEqual(calls, []);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("POST /api/runs rejects passed runs without required evidence", async () => {
  const evidenceDir = await makeRunDir("run-incomplete-success");
  const app = createApp({
    runDelivery: async ({ input }) => ({
      runId: "run-incomplete-success",
      stage: "ready_for_pr",
      status: "passed",
      evidenceDir,
      requirementCard: { goal: "展示阅读量", source_input: input },
      aiCalls: [{
        stage: "clarify",
        model: "rules-first-p0",
        prompt_version: "rules-first-p0",
        input_summary: input,
        output_summary: "展示阅读量",
        tokens_in: 0,
        tokens_out: 0,
        latency_ms: 0,
        cost_estimate: 0,
        status: "reviewed",
      }],
      aiUsage: {
        stages: 1,
        tokensIn: 0,
        tokensOut: 0,
        latencyMs: 0,
        costEstimate: 0,
      },
      events: [],
    }),
  });
  const server = app.listen(0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const response = await postJson(`${baseUrl}/api/runs`, { input: "incomplete success" });
    const payload = await response.json();

    assert.equal(response.status, 500);
    assert.equal(payload.error.message, "Run result plan is required");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("POST /api/runs/:id/resume-from-stage rejects unanswered clarification questions", async () => {
  const root = await mkdtempProjectRoot("super-individual-api-");
  const runId = "run-paused-clarify";
  const app = createApp({
    projectRoot: root,
    runDelivery: async ({ input }) => pausedClarificationRun({ input, root, runId }),
  });
  const server = app.listen(0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const start = await postJson(`${baseUrl}/api/runs`, { input: "模糊需求" });
    const started = await start.json();
    const resume = await postJson(`${baseUrl}/api/runs/${started.runId}/resume-from-stage`, {
      stage: "clarifying",
    });
    const payload = await resume.json();

    assert.equal(start.status, 202);
    assert.equal(resume.status, 400);
    assert.equal(
      payload.error.message,
      "Clarification answers required before resuming: Q1",
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("POST /api/runs/:id/continue rejects unanswered clarification questions", async () => {
  const root = await mkdtempProjectRoot("super-individual-api-");
  const runId = "run-paused-clarify-continue";
  const app = createApp({
    projectRoot: root,
    runDelivery: async ({ input }) => pausedClarificationRun({ input, root, runId }),
  });
  const server = app.listen(0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const start = await postJson(`${baseUrl}/api/runs`, { input: "模糊需求" });
    const started = await start.json();
    const resume = await postJson(`${baseUrl}/api/runs/${started.runId}/continue`);
    const payload = await resume.json();

    assert.equal(start.status, 202);
    assert.equal(resume.status, 400);
    assert.equal(
      payload.error.message,
      "Clarification answers required before resuming: Q1",
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("POST /api/runs-index/refresh is not exposed as an API write path", async () => {
  const root = await mkdtempProjectRoot("super-individual-api-");
  const app = createApp({ projectRoot: root });
  const server = app.listen(0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const response = await postJson(`${baseUrl}/api/runs-index/refresh`);

    assert.equal(response.status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

async function pausedClarificationRun({ input, root, runId }) {
  const evidenceDir = await makeRunDir(runId, root);
  return {
    runId,
    stage: "clarifying_awaiting_answer",
    status: "paused",
    evidenceDir,
    requirementCard: {
      goal: "pending: awaiting PM clarification",
      source_input: input,
    },
    historyRecall: { matches: [], skipped: [] },
    pendingQuestions: [{ id: "Q1", text: "是否只改前端？" }],
    aiCalls: [{
      stage: "clarify",
      model: "mimo-v2.5",
      prompt_version: "2.0.0-llm",
      input_summary: input,
      output_summary: "需要 PM 澄清",
      tokens_in: 10,
      tokens_out: 4,
      latency_ms: 80,
      cost_estimate: 0.01,
      status: "completed",
    }],
    aiUsage: {
      stages: 1,
      tokensIn: 10,
      tokensOut: 4,
      latencyMs: 80,
      costEstimate: 0.01,
    },
    events: [{ stage: "clarifying", message: "Build requirement card" }],
  };
}
