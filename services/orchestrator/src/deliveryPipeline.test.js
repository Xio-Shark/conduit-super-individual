import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { RUN_STAGES } from "../../../libs/types/src/stages.js";
import { loadUpstreamState } from "./deliveryContext.js";
import { markdownFromObject } from "./evidence.js";
import { resumeFromStage } from "./deliveryPipeline.js";

const PROJECT_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

test("resumeFromStage rejects unknown stage", async () => {
  await assert.rejects(
    () => resumeFromStage({ runId: "run-missing", stage: "unknown", projectRoot: PROJECT_ROOT }),
    /resume-from-stage must be one of/,
  );
});

test("resumeFromStage rejects revised input for downstream-only stages", async () => {
  await assert.rejects(
    () => resumeFromStage({
      projectRoot: PROJECT_ROOT,
      revisedInput: "改成展示收藏数",
      runId: "run-missing",
      stage: "editing",
    }),
    /revisedInput is only supported/,
  );
});

test("loadUpstreamState does not require verification evidence before verifying stage", async () => {
  const context = await createResumeContext({ includeVerification: false });
  const state = await loadUpstreamState(context, RUN_STAGES.VERIFYING);

  assert.equal(state.verification, undefined);
  assert.ok(state.diff);
  assert.equal(state.plan.skill_id, "article-list-display-field");
});

test("loadUpstreamState loads verification evidence before PR drafting stage", async () => {
  const context = await createResumeContext({ includeVerification: true });
  const state = await loadUpstreamState(context, RUN_STAGES.PR_DRAFTING);

  assert.equal(state.verification.status, "passed");
});

test("loadUpstreamState requires verification evidence before PR drafting stage", async () => {
  const context = await createResumeContext({ includeVerification: false });

  await assert.rejects(
    () => loadUpstreamState(context, RUN_STAGES.PR_DRAFTING),
    /verification\.json/,
  );
});

async function createResumeContext({ includeVerification }) {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "delivery-resume-"));
  const runId = "run-resume";
  const runDir = path.join(projectRoot, "docs/reports/runs", runId);
  await mkdir(runDir, { recursive: true });

  const requirementCard = {
    acceptance: ["文章列表展示阅读量"],
    assumptions: [],
    clarifications: [],
    goal: "文章列表展示阅读量",
    id: "REQ-001",
    level: "L1",
    scope: { exclude: ["backend"], include: ["文章列表", "阅读量"] },
    source_input: "给文章列表加阅读量展示，前端假数据即可，不改后端。",
  };
  const plan = {
    requirement_id: requirementCard.id,
    risks: ["P0 只展示前端假数据，不代表真实阅读量统计"],
    skill_id: "article-list-display-field",
    summary: "在 Conduit 文章列表卡片增加确定性阅读量展示。",
    target_files: ["frontend/src/components/ArticlesPreview/ArticlesPreview.jsx"],
  };

  await writeFile(path.join(runDir, "requirement.md"), markdownFromObject("Requirement", requirementCard), "utf8");
  await writeFile(path.join(runDir, "history-recall.json"), JSON.stringify({ matches: [], skipped: [] }), "utf8");
  await writeFile(path.join(runDir, "plan.md"), markdownFromObject("Plan", plan), "utf8");
  await writeFile(path.join(runDir, "diff.patch"), "diff --git a/frontend/src/App.jsx b/frontend/src/App.jsx\n", "utf8");
  await writeFile(
    path.join(runDir, "ai-calls.jsonl"),
    `${JSON.stringify({ cost_estimate: 0, latency_ms: 0, stage: "clarify", tokens_in: 0, tokens_out: 0 })}\n`,
    "utf8",
  );
  if (includeVerification) {
    await writeFile(path.join(runDir, "verification.json"), JSON.stringify({ checks: [], status: "passed" }), "utf8");
  }

  return {
    evidence: { runDir },
    runId,
    sandbox: {
      assertConduitOrigin: async () => ({ remote: "conduit-realworld-example-app" }),
    },
  };
}
