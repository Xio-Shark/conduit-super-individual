import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import test from "node:test";
import { createApp } from "./app.js";
import {
  makeRunDir,
  mkdtempProjectRoot,
  postJson,
  successfulRun,
} from "./appTestHelpers.js";

test("GET /api/runs/:id/submission reports generated and human-pending items", async () => {
  const projectRoot = await mkdtempProjectRoot("super-individual-submission-");
  await writeSubmissionFixture(projectRoot, {
    checklist: pendingChecklist(),
    teamInfo: pendingTeamInfo(),
  });
  const evidenceDir = await makeRunDir("run-submission", projectRoot);
  const app = createApp({
    projectRoot,
    runDelivery: async ({ input }) => successfulRun({
      runId: "run-submission",
      evidenceDir,
      input,
    }),
  });
  const server = app.listen(0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    await postJson(`${baseUrl}/api/runs`, { input: "submission requirement" });
    const response = await fetch(`${baseUrl}/api/runs/run-submission/submission`);
    const payload = await response.json();
    const statuses = new Map(payload.items.map((item) => [item.id, item.status]));

    assert.equal(response.status, 200);
    assert.equal(statuses.get("readme"), "generated");
    assert.equal(statuses.get("demo"), "pending_human");
    assert.equal(statuses.get("video"), "pending_human");
    assert.equal(statuses.get("repository"), "pending_human");
    assert.equal(statuses.get("team_info"), "pending_human");
    assert.equal(statuses.get("checklist"), "pending_human");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("GET /api/runs/:id/submission marks filled external links as unverified", async () => {
  const projectRoot = await mkdtempProjectRoot("super-individual-submission-ready-");
  await writeSubmissionFixture(projectRoot, {
    checklist: readyChecklist(),
    teamInfo: readyTeamInfo(),
  });
  const evidenceDir = await makeRunDir("run-submission-ready", projectRoot);
  const app = createApp({
    projectRoot,
    runDelivery: async ({ input }) => successfulRun({
      runId: "run-submission-ready",
      evidenceDir,
      input,
    }),
  });
  const server = app.listen(0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    await postJson(`${baseUrl}/api/runs`, { input: "submission requirement" });
    const response = await fetch(`${baseUrl}/api/runs/run-submission-ready/submission`);
    const payload = await response.json();
    const statuses = new Map(payload.items.map((item) => [item.id, item.status]));

    assert.equal(response.status, 200);
    assert.equal(statuses.get("demo"), "provided_unverified");
    assert.equal(statuses.get("video"), "provided_unverified");
    assert.equal(statuses.get("repository"), "provided_unverified");
    assert.equal(statuses.get("team_info"), "generated");
    assert.equal(statuses.get("checklist"), "generated");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("POST /api/runs/:id/confirm records human confirmation", async () => {
  const evidenceDir = await makeRunDir("run-confirm");
  const app = createApp({
    runDelivery: async ({ input }) => successfulRun({
      runId: "run-confirm",
      evidenceDir,
      input,
    }),
  });
  const server = app.listen(0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    await postJson(`${baseUrl}/api/runs`, { input: "confirm requirement" });
    const response = await postJson(`${baseUrl}/api/runs/run-confirm/confirm`, {
      target: "plan",
      decision: "approved",
      note: "looks good",
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.confirmations[0].target, "plan");
    assert.equal(payload.confirmations[0].note, "looks good");
    assert.equal(payload.events.at(-1).stage, "human_confirm");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("POST /api/runs/:id/confirm exposes metadata persistence failure", async () => {
  const evidenceDir = await makeRunDir("run-confirm-persist-fails");
  const app = createApp({
    runDelivery: async ({ input }) => successfulRun({
      runId: "run-confirm-persist-fails",
      evidenceDir,
      input,
    }),
  });
  const server = app.listen(0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    await postJson(`${baseUrl}/api/runs`, { input: "confirm requirement" });
    await rm(evidenceDir, { recursive: true, force: true });
    const response = await postJson(`${baseUrl}/api/runs/run-confirm-persist-fails/confirm`, {
      target: "plan",
      decision: "approved",
    });
    const payload = await response.json();

    assert.equal(response.status, 500);
    assert.match(payload.error.message, /metadata.json|ENOENT/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("POST /api/runs/:id/confirm rejects invalid target", async () => {
  const evidenceDir = await makeRunDir("run-confirm-invalid");
  const app = createApp({
    runDelivery: async ({ input }) => successfulRun({
      runId: "run-confirm-invalid",
      evidenceDir,
      input,
    }),
  });
  const server = app.listen(0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    await postJson(`${baseUrl}/api/runs`, { input: "confirm requirement" });
    const response = await postJson(`${baseUrl}/api/runs/run-confirm-invalid/confirm`, {
      target: "deploy",
    });

    assert.equal(response.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

async function writeSubmissionFixture(projectRoot, { checklist, teamInfo }) {
  const submissionDir = `${projectRoot}/docs/reports/submission`;
  await mkdir(submissionDir, { recursive: true });
  await Promise.all([
    writeFile(`${projectRoot}/README.md`, "# Test Project\n"),
    writeFile(`${submissionDir}/architecture.md`, "# Architecture\n"),
    writeFile(`${submissionDir}/ai-usage.md`, "# AI Usage\n"),
    writeFile(`${submissionDir}/engineering-notes.md`, "# Engineering Notes\n"),
    writeFile(`${submissionDir}/checklist.md`, checklist),
    writeFile(`${submissionDir}/team-info.md`, teamInfo),
  ]);
}

function pendingTeamInfo() {
  return `# 团队与交付链接

| 字段 | 内容 |
|------|------|
| 团队名称 | _（待填）_ |
| 成员名单 | _（待填：姓名 / 角色）_ |

| 材料 | 链接 | 状态 |
|------|------|------|
| 在线 Demo | _（待填：如 Vercel URL）_ | 待部署 |
| 演示视频（3-8 分钟） | _（待填：视频 URL）_ | 待录制 |
| AI 系统主仓（公开） | _（待填：GitHub URL）_ | 待发布 |
`;
}

function readyTeamInfo() {
  return `# 团队与交付链接

| 字段 | 内容 |
|------|------|
| 团队名称 | Conduit Delivery |
| 成员名单 | 张三 / 全栈交付 |

| 材料 | 链接 | 状态 |
|------|------|------|
| 在线 Demo | https://demo.example.com | 已部署 |
| 演示视频（3-8 分钟） | https://video.example.com/watch/demo | 已录制 |
| AI 系统主仓（公开） | https://github.com/example/conduit-super-individual | 已发布 |
`;
}

function pendingChecklist() {
  return `# Submission Checklist

- 在线 Demo 链接：_（待填 URL）_
- [ ] 6.10 前对外提交：团队链接 + 视频 + 公开 AI 系统主仓（人工）
`;
}

function readyChecklist() {
  return `# Submission Checklist

- 在线 Demo 链接：https://demo.example.com
- [x] 6.10 前对外提交：团队链接 + 视频 + 公开 AI 系统主仓
`;
}
