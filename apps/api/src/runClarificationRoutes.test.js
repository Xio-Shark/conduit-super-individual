import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  recordClarificationAnswer,
  readClarificationHistory,
  ClarificationAnswerError,
} from "./runClarificationRoutes.js";

async function makeRun(pendingQuestions = [
  { id: "Q1", text: "是否只改前端？" },
  { id: "Q2", text: "展示在哪个位置？" },
]) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "clarify-route-"));
  return { runId: "run-test", evidenceDir: dir, pendingQuestions };
}

test("recordClarificationAnswer appends jsonl entry", async () => {
  const run = await makeRun();
  await recordClarificationAnswer({
    run,
    body: { questionId: "Q1", answer: "前端假数据可接受" },
  });
  await recordClarificationAnswer({
    run,
    body: { questionId: "Q2", answer: "草稿默认 false" },
  });
  const file = path.join(run.evidenceDir, "clarification-history.jsonl");
  const text = await fs.readFile(file, "utf8");
  const lines = text.trim().split("\n");
  assert.equal(lines.length, 2);
  const first = JSON.parse(lines[0]);
  assert.equal(first.questionId, "Q1");
  assert.equal(first.question, "是否只改前端？");
  assert.equal(first.answer, "前端假数据可接受");
  assert.ok(first.answeredAt);
});

test("recordClarificationAnswer accepts matching submitted question text", async () => {
  const run = await makeRun([{ id: "Q1", text: "是否只改前端？" }]);

  await recordClarificationAnswer({
    run,
    body: { questionId: "Q1", question: "是否只改前端？", answer: "只改前端" },
  });

  const history = await readClarificationHistory(run);
  assert.equal(history.entries.length, 1);
  assert.equal(history.entries[0].question, "是否只改前端？");
});

test("recordClarificationAnswer rejects stale submitted question text", async () => {
  const run = await makeRun([{ id: "Q1", text: "是否需要同步后端接口？" }]);

  await assert.rejects(
    () => recordClarificationAnswer({
      run,
      body: { questionId: "Q1", question: "是否只改前端？", answer: "只改前端" },
    }),
    /clarification question changed: Q1/,
  );
});

test("recordClarificationAnswer rejects empty body", async () => {
  const run = await makeRun();
  await assert.rejects(
    () => recordClarificationAnswer({ run, body: null }),
    ClarificationAnswerError,
  );
  await assert.rejects(
    () => recordClarificationAnswer({ run, body: { questionId: "Q1" } }),
    /answer is required/,
  );
  await assert.rejects(
    () => recordClarificationAnswer({ run, body: { answer: "x" } }),
    /questionId is required/,
  );
});

test("recordClarificationAnswer rejects answers without pending questions", async () => {
  const run = await makeRun([]);

  await assert.rejects(
    () => recordClarificationAnswer({
      run,
      body: { questionId: "Q1", answer: "OK" },
    }),
    /run has no pending clarification questions/,
  );
});

test("recordClarificationAnswer rejects unknown question id", async () => {
  const run = await makeRun([{ id: "Q1", text: "是否只改前端？" }]);

  await assert.rejects(
    () => recordClarificationAnswer({
      run,
      body: { questionId: "Q2", answer: "OK" },
    }),
    /unknown clarification questionId: Q2/,
  );
});

test("recordClarificationAnswer rejects duplicate answer for same question", async () => {
  const run = await makeRun([{ id: "Q1", text: "是否只改前端？" }]);
  await recordClarificationAnswer({
    run,
    body: { questionId: "Q1", answer: "只改前端" },
  });

  await assert.rejects(
    () => recordClarificationAnswer({
      run,
      body: { questionId: "Q1", answer: "重复答复" },
    }),
    /clarification question already answered: Q1/,
  );
});

test("recordClarificationAnswer allows reused question ids for a new pending question", async () => {
  const run = await makeRun([{ id: "Q1", text: "是否只改前端？" }]);
  await recordClarificationAnswer({
    run,
    body: { questionId: "Q1", answer: "只改前端" },
  });

  run.pendingQuestions = [{ id: "Q1", text: "是否需要同步后端接口？" }];
  await recordClarificationAnswer({
    run,
    body: { questionId: "Q1", answer: "不改后端" },
  });

  const history = await readClarificationHistory(run);
  assert.equal(history.entries.length, 2);
  assert.deepEqual(
    history.entries.map((entry) => entry.question),
    ["是否只改前端？", "是否需要同步后端接口？"],
  );
});

test("readClarificationHistory returns empty when file missing", async () => {
  const run = await makeRun();
  const history = await readClarificationHistory(run);
  assert.deepEqual(history.entries, []);
});

test("readClarificationHistory parses appended entries", async () => {
  const run = await makeRun();
  await recordClarificationAnswer({
    run,
    body: { questionId: "Q1", answer: "OK" },
  });
  const history = await readClarificationHistory(run);
  assert.equal(history.entries.length, 1);
  assert.equal(history.entries[0].questionId, "Q1");
});
