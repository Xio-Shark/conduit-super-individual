import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createApp } from "./app.js";
import {
  makeRunDir,
  mkdtempProjectRoot,
  postJson,
  writeAiCalls,
  writeMarkdownJson,
} from "./appTestHelpers.js";

test("GET /api/runs/:id restores archived run after cold start", async () => {
  const projectRoot = await mkdtempProjectRoot("super-individual-archive-");
  const runId = "run-archived";
  const runDir = await makeRunDir(runId, projectRoot);
  await writeSuccessfulArchive({ runDir, runId });
  await writeFile(path.join(runDir, "history-recall.json"), JSON.stringify({
    matches: [{ runId: "run-old", score: 0.5 }],
    skipped: [],
  }));
  await writeFile(path.join(runDir, "metadata.json"), JSON.stringify({
    retryOf: "run-original",
    confirmations: [{ target: "plan", decision: "approved" }],
    events: [{ stage: "retry", message: "retried from run-original" }],
    checkpoints: {
      ready_for_pr: {
        at: "2026-05-21T00:00:00.000Z",
        artifacts: ["pr-draft.md"],
      },
    },
  }));

  const app = createApp({ projectRoot });
  const server = app.listen(0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${baseUrl}/api/runs/${runId}`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.sourceInput, "archived input");
    assert.equal(payload.retryOf, "run-original");
    assert.equal(payload.confirmations[0].target, "plan");
    assert.equal(payload.historyRecall.matches[0].runId, "run-old");
    assert.equal(payload.aiCalls[0].stage, "clarify");
    assert.equal(payload.aiUsage.tokensIn, 10);
    assert.equal(payload.events[0].stage, "retry");
    assert.deepEqual(payload.edit.changedFiles, ["frontend/src/App.jsx"]);
    assert.equal(payload.edit.summary, "archived plan");
    assert.equal(payload.plan.summary, "archived plan");
    assert.equal(payload.verification.status, "passed");
    assert.deepEqual(payload.checkpoints.ready_for_pr.artifacts, ["pr-draft.md"]);
    assert.match(payload.diff, /diff --git/);
    assert.equal(payload.prDraft, "# PR\n");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("GET /api/runs/:id rejects incomplete successful archive", async () => {
  const projectRoot = await mkdtempProjectRoot("super-individual-archive-");
  const runId = "run-archived-missing-diff";
  const runDir = await makeRunDir(runId, projectRoot);
  await writeSuccessfulArchive({ runDir, runId, diff: null });

  const app = createApp({ projectRoot });
  const server = app.listen(0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${baseUrl}/api/runs/${runId}`);
    const payload = await response.json();

    assert.equal(response.status, 500);
    assert.match(payload.error.message, /diff.patch/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("GET /api/runs/:id rejects archive without persisted aiUsage", async () => {
  const projectRoot = await mkdtempProjectRoot("super-individual-archive-");
  const runId = "run-archived-missing-ai-usage";
  const runDir = await makeRunDir(runId, projectRoot);
  await writeSuccessfulArchive({ runDir, runId, aiUsage: null });

  const app = createApp({ projectRoot });
  const server = app.listen(0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${baseUrl}/api/runs/${runId}`);
    const payload = await response.json();

    assert.equal(response.status, 500);
    assert.match(payload.error.message, /aiUsage/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("GET /api/runs/:id rejects archive with mismatched aiUsage", async () => {
  const projectRoot = await mkdtempProjectRoot("super-individual-archive-");
  const runId = "run-archived-mismatched-ai-usage";
  const runDir = await makeRunDir(runId, projectRoot);
  await writeSuccessfulArchive({
    runDir,
    runId,
    aiUsage: { stages: 1, tokensIn: 999, tokensOut: 4, latencyMs: 80, costEstimate: 0.01 },
  });

  const app = createApp({ projectRoot });
  const server = app.listen(0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${baseUrl}/api/runs/${runId}`);
    const payload = await response.json();

    assert.equal(response.status, 500);
    assert.match(payload.error.message, /aiUsage\.tokensIn/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("GET /api/runs/:id rejects archive with string aiUsage numbers", async () => {
  const projectRoot = await mkdtempProjectRoot("super-individual-archive-");
  const runId = "run-archived-string-ai-usage";
  const runDir = await makeRunDir(runId, projectRoot);
  await writeSuccessfulArchive({
    runDir,
    runId,
    aiUsage: { stages: 1, tokensIn: "10", tokensOut: 4, latencyMs: 80, costEstimate: 0.01 },
  });

  const app = createApp({ projectRoot });
  const server = app.listen(0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${baseUrl}/api/runs/${runId}`);
    const payload = await response.json();

    assert.equal(response.status, 500);
    assert.match(payload.error.message, /aiUsage\.tokensIn must be a finite JSON number/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("GET /api/runs/:id rejects archive with string ai-call numbers", async () => {
  const projectRoot = await mkdtempProjectRoot("super-individual-archive-");
  const runId = "run-archived-string-ai-call";
  const runDir = await makeRunDir(runId, projectRoot);
  await writeSuccessfulArchive({
    runDir,
    runId,
    aiCall: {
      stage: "clarify",
      model: "mimo-v2.5",
      prompt_version: "1.0.0-llm",
      input_summary: "archived input",
      output_summary: "archived goal",
      tokens_in: "10",
      tokens_out: 4,
      latency_ms: 80,
      cost_estimate: 0.01,
      status: "completed",
    },
  });

  const app = createApp({ projectRoot });
  const server = app.listen(0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${baseUrl}/api/runs/${runId}`);
    const payload = await response.json();

    assert.equal(response.status, 500);
    assert.match(payload.error.message, /tokens_in must be a finite JSON number/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("GET /api/runs/:id restores paused run after cold start", async () => {
  const projectRoot = await mkdtempProjectRoot("super-individual-paused-archive-");
  const runId = "run-paused-archived";
  const runDir = await makeRunDir(runId, projectRoot);
  await writePausedArchive({ runDir, runId });

  const app = createApp({ projectRoot });
  const server = app.listen(0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${baseUrl}/api/runs/${runId}`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.runId, runId);
    assert.equal(payload.status, "paused");
    assert.equal(payload.stage, "waiting_requirement_confirm");
    assert.equal(payload.sourceInput, "paused input");
    assert.equal(payload.requirementCard.goal, "paused goal");
    assert.equal(payload.aiCalls[0].model, "rules-first-p0");
    assert.equal(payload.aiUsage.tokensIn, 0);
    assert.equal(payload.historyRecall.matches.length, 0);
    assert.equal(payload.events[0].stage, "clarifying");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("GET /api/runs/:id restores paused clarification questions after cold start", async () => {
  const projectRoot = await mkdtempProjectRoot("super-individual-paused-clarify-");
  const runId = "run-paused-clarify-archived";
  const runDir = await makeRunDir(runId, projectRoot);
  await writePausedArchive({
    runDir,
    runId,
    stage: "clarifying_awaiting_answer",
    pendingQuestions: [{ id: "Q1", text: "是否只改前端？" }],
  });

  const app = createApp({ projectRoot });
  const server = app.listen(0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${baseUrl}/api/runs/${runId}`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.status, "paused");
    assert.equal(payload.stage, "clarifying_awaiting_answer");
    assert.deepEqual(payload.pendingQuestions, [{ id: "Q1", text: "是否只改前端？" }]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("GET /api/runs/:id rejects paused archive without AI call evidence", async () => {
  const projectRoot = await mkdtempProjectRoot("super-individual-paused-archive-");
  const runId = "run-paused-missing-ai-calls";
  const runDir = await makeRunDir(runId, projectRoot);
  await writePausedArchive({ runDir, runId, aiCalls: null });

  const app = createApp({ projectRoot });
  const server = app.listen(0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${baseUrl}/api/runs/${runId}`);
    const payload = await response.json();

    assert.equal(response.status, 500);
    assert.match(payload.error.message, /ai-calls\.jsonl/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("GET /api/runs-index lists paused archived runs", async () => {
  const projectRoot = await mkdtempProjectRoot("super-individual-paused-index-");
  const runId = "run-paused-indexed";
  const runDir = await makeRunDir(runId, projectRoot);
  await writePausedArchive({ runDir, runId });

  const app = createApp({ projectRoot });
  const server = app.listen(0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${baseUrl}/api/runs-index`);
    const payload = await response.json();
    const run = payload.runs.find((candidate) => candidate.runId === runId);

    assert.equal(response.status, 200);
    assert.equal(run.status, "paused");
    assert.equal(run.stage, "waiting_requirement_confirm");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("GET /api/history returns similar archived runs", async () => {
  const projectRoot = await mkdtempProjectRoot("super-individual-history-api-");
  const runDir = await makeRunDir("run-history", projectRoot);
  await writeMarkdownJson(path.join(runDir, "requirement.md"), {
    source_input: "给文章列表加阅读量展示",
    goal: "文章列表卡片展示阅读量",
    acceptance: ["显示 reads"],
  });
  await writeMarkdownJson(path.join(runDir, "plan.md"), {
    summary: "在文章列表卡片增加阅读量展示。",
    skill_id: "article-list-display-field",
    target_files: ["frontend/src/components/ArticlesPreview/ArticlesPreview.jsx"],
  });

  const app = createApp({ projectRoot });
  const server = app.listen(0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${baseUrl}/api/history?input=${encodeURIComponent("文章列表阅读量")}`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.matches[0].runId, "run-history");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("POST /api/runs/:id/confirm works for archived run after cold start", async () => {
  const projectRoot = await mkdtempProjectRoot("super-individual-archive-");
  const runId = "run-archived-confirm";
  const runDir = await makeRunDir(runId, projectRoot);
  await writeSuccessfulArchive({ runDir, runId, events: [] });

  const app = createApp({ projectRoot });
  const server = app.listen(0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const response = await postJson(`${baseUrl}/api/runs/${runId}/confirm`, {
      target: "requirement",
      decision: "approved",
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.confirmations[0].target, "requirement");
    assert.equal(payload.events.at(-1).stage, "human_confirm");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

async function writeSuccessfulArchive({
  aiCall,
  aiUsage = { stages: 1, tokensIn: 10, tokensOut: 4, latencyMs: 80, costEstimate: 0.01 },
  diff = "diff --git a/file b/file\n",
  events,
  runDir,
  runId,
}) {
  await writeFile(path.join(runDir, "run-summary.json"), JSON.stringify({
    runId,
    stage: "ready_for_pr",
    status: "passed",
    repoPath: "/tmp/sandbox",
    evidenceDir: runDir,
    verificationStatus: "passed",
    ...(aiUsage ? { aiUsage } : {}),
    ...(events ? { events } : {}),
  }));
  await writeMarkdownJson(path.join(runDir, "requirement.md"), {
    source_input: "archived input",
    goal: "archived goal",
  });
  await writeMarkdownJson(path.join(runDir, "plan.md"), {
    summary: "archived plan",
    target_files: ["frontend/src/App.jsx"],
  });
  await writeFile(path.join(runDir, "verification.json"), JSON.stringify({ status: "passed", checks: [] }));
  await writeFile(path.join(runDir, "history-recall.json"), JSON.stringify({ matches: [], skipped: [] }));
  await writeAiCalls(path.join(runDir, "ai-calls.jsonl"), [
    aiCall || {
      stage: "clarify",
      model: "mimo-v2.5",
      prompt_version: "1.0.0-llm",
      input_summary: "archived input",
      output_summary: "archived goal",
      tokens_in: 10,
      tokens_out: 4,
      latency_ms: 80,
      cost_estimate: 0.01,
      status: "completed",
    },
  ]);
  if (diff !== null) await writeFile(path.join(runDir, "diff.patch"), diff);
  await writeFile(path.join(runDir, "pr-draft.md"), "# PR\n");
}

async function writePausedArchive({
  aiCalls,
  pendingQuestions = [],
  runDir,
  runId,
  stage = "waiting_requirement_confirm",
}) {
  const paused = {
    runId,
    stage,
    at: "2026-05-21T00:00:00.000Z",
  };
  if (pendingQuestions.length) paused.pendingQuestions = pendingQuestions;
  await writeFile(path.join(runDir, "paused.json"), JSON.stringify(paused));
  await writeFile(path.join(runDir, "metadata.json"), JSON.stringify({
    stage,
    status: "paused",
    retryOf: null,
    confirmations: [],
    events: [{ stage: "clarifying", message: "Build requirement card" }],
    checkpoints: {
      clarifying: {
        at: "2026-05-21T00:00:00.000Z",
        artifacts: ["requirement.md", "history-recall.json", "ai-calls.jsonl"],
      },
    },
  }));
  await writeMarkdownJson(path.join(runDir, "requirement.md"), {
    source_input: "paused input",
    goal: "paused goal",
    scope: { include: ["paused include"], exclude: ["paused exclude"] },
    assumptions: ["paused assumption"],
    clarifications: ["paused clarification"],
    acceptance: ["paused acceptance"],
    level: "L1",
  });
  await writeFile(path.join(runDir, "history-recall.json"), JSON.stringify({ matches: [], skipped: [] }));
  if (aiCalls !== null) {
    await writeAiCalls(path.join(runDir, "ai-calls.jsonl"), aiCalls || [
      {
        stage: "clarify",
        model: "rules-first-p0",
        prompt_version: "rules-first-p0",
        input_summary: "paused input",
        output_summary: "paused goal",
        tokens_in: 0,
        tokens_out: 0,
        latency_ms: 0,
        cost_estimate: 0,
        status: "reviewed",
      },
    ]);
  }
}
