import assert from "node:assert/strict";
import test from "node:test";
import { GitHubConfigError } from "../../../external/git-provider/src/githubPrClient.js";
import { createApp } from "./app.js";
import {
  makeRunDir,
  postJson,
  successfulRun,
} from "./appTestHelpers.js";

test("POST /api/runs/:id/pr requires explicit confirmation", async () => {
  const evidenceDir = await makeRunDir("run-pr-confirm");
  const app = createApp({
    runDelivery: async ({ input }) => successfulRun({
      runId: "run-pr-confirm",
      evidenceDir,
      input,
      prDraft: "# PR\n",
    }),
  });
  const server = app.listen(0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    await postJson(`${baseUrl}/api/runs`, { input: "pr requirement" });
    const response = await postJson(`${baseUrl}/api/runs/run-pr-confirm/pr`, {});

    assert.equal(response.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("POST /api/runs/:id/pr creates a pull request through provider", async () => {
  const evidenceDir = await makeRunDir("run-pr-submit");
  const submissions = [];
  const app = createApp({
    gitProvider: () => ({
      createPullRequest: async (input) => {
        submissions.push(input);
        return {
          number: 12,
          url: "https://github.test/owner/repo/pull/12",
          state: "open",
        };
      },
    }),
    runDelivery: async ({ input }) => successfulRun({
      runId: "run-pr-submit",
      evidenceDir,
      input,
      requirementCard: { goal: "展示阅读量", source_input: "input" },
      prDraft: "# PR\n",
    }),
  });
  const server = app.listen(0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    await postJson(`${baseUrl}/api/runs`, { input: "pr requirement" });
    const response = await postJson(`${baseUrl}/api/runs/run-pr-submit/pr`, {
      confirm: true,
      head: "agent/run-pr-submit",
      base: "main",
    });
    const payload = await response.json();

    assert.equal(response.status, 201);
    assert.equal(submissions[0].title, "P0: 展示阅读量");
    assert.equal(submissions[0].draft, true);
    assert.equal(payload.prSubmission.number, 12);
    assert.equal(payload.events.at(-1).stage, "pr_submitted");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("POST /api/runs/:id/pr requires explicit head and base", async () => {
  const evidenceDir = await makeRunDir("run-pr-missing-ref");
  const submissions = [];
  const app = createApp({
    gitProvider: () => ({
      createPullRequest: async (input) => {
        submissions.push(input);
        return { number: 12, url: "https://github.test/owner/repo/pull/12", state: "open" };
      },
    }),
    runDelivery: async ({ input }) => successfulRun({
      runId: "run-pr-missing-ref",
      evidenceDir,
      input,
      requirementCard: { goal: "展示阅读量", source_input: "input" },
      prDraft: "# PR\n",
    }),
  });
  const server = app.listen(0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    await postJson(`${baseUrl}/api/runs`, { input: "pr requirement" });
    const response = await postJson(`${baseUrl}/api/runs/run-pr-missing-ref/pr`, {
      confirm: true,
      head: "agent/run-pr-missing-ref",
    });
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.error.message, "PR submission requires base");
    assert.deepEqual(submissions, []);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("POST /api/runs/:id/pr exposes missing GitHub config", async () => {
  const evidenceDir = await makeRunDir("run-pr-missing-config");
  const app = createApp({
    gitProvider: () => {
      throw new GitHubConfigError("GITHUB_TOKEN is required");
    },
    runDelivery: async ({ input }) => successfulRun({
      runId: "run-pr-missing-config",
      evidenceDir,
      input,
      requirementCard: { goal: "展示阅读量", source_input: "input" },
      prDraft: "# PR\n",
    }),
  });
  const server = app.listen(0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    await postJson(`${baseUrl}/api/runs`, { input: "pr requirement" });
    const response = await postJson(`${baseUrl}/api/runs/run-pr-missing-config/pr`, {
      confirm: true,
      head: "agent/run-pr-missing-config",
      base: "main",
    });
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.error.message, "GITHUB_TOKEN is required");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
