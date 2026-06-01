import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { requireAnsweredPendingClarifications } from "./clarificationAnswerGuards.js";
import { recordClarificationAnswer } from "./runClarificationRoutes.js";

async function makeRun(pendingQuestions = []) {
  const evidenceDir = await fs.mkdtemp(path.join(os.tmpdir(), "clarify-guard-"));
  return { runId: "run-clarify", evidenceDir, pendingQuestions };
}

test("requireAnsweredPendingClarifications rejects unanswered pending questions", async () => {
  const run = await makeRun([
    { id: "Q1", text: "是否只改前端？" },
    { id: "Q2", text: "展示在哪个位置？" },
  ]);
  await recordClarificationAnswer({
    run,
    body: { questionId: "Q1", answer: "只改前端" },
  });

  await assert.rejects(
    () => requireAnsweredPendingClarifications(run),
    /Clarification answers required before resuming: Q2/,
  );
});

test("requireAnsweredPendingClarifications accepts fully answered pending questions", async () => {
  const run = await makeRun([
    { id: "Q1", text: "是否只改前端？" },
    { id: "Q2", text: "展示在哪个位置？" },
  ]);
  await recordClarificationAnswer({
    run,
    body: { questionId: "Q1", answer: "只改前端" },
  });
  await recordClarificationAnswer({
    run,
    body: { questionId: "Q2", answer: "列表卡片 meta 区" },
  });

  await requireAnsweredPendingClarifications(run);
});

test("requireAnsweredPendingClarifications treats reused question ids as new questions", async () => {
  const run = await makeRun([{ id: "Q1", text: "是否只改前端？" }]);
  await recordClarificationAnswer({
    run,
    body: { questionId: "Q1", answer: "只改前端" },
  });
  run.pendingQuestions = [{ id: "Q1", text: "是否需要同步后端接口？" }];

  await assert.rejects(
    () => requireAnsweredPendingClarifications(run),
    /Clarification answers required before resuming: Q1/,
  );
});

test("requireAnsweredPendingClarifications ignores runs without pending questions", async () => {
  await requireAnsweredPendingClarifications(await makeRun());
});
