import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRunResultActions,
  canContinueAfterConfirm,
  canResumeClarification,
  createResumeClarificationHandler,
  createResumeFromEditHandler,
  isClarificationAwaitingAnswer,
} from "./runResultActions.js";
import {
  buildEvidenceState,
  requireRunEvents,
} from "./runEvidenceState.js";

test("buildEvidenceState marks paused-after-clarify AI usage as missing", () => {
  const state = buildEvidenceState(
    {
      runId: "run-paused",
      stage: "waiting_requirement_confirm",
      status: "paused",
      aiCalls: null,
      aiUsage: null,
    },
    [{ stage: "clarifying", message: "Build requirement card" }],
  );

  assert.deepEqual(state.aiUsage, {
    status: "missing",
    message: "AI usage evidence missing for run-paused at waiting_requirement_confirm",
  });
});

test("buildEvidenceState keeps AI usage pending before clarify", () => {
  const state = buildEvidenceState(
    {
      runId: "run-created",
      stage: "created",
      status: "running",
      aiCalls: null,
      aiUsage: null,
    },
    [],
  );

  assert.equal(state.aiUsage.status, "pending");
});

test("requireRunEvents returns persisted events", () => {
  const events = [{ stage: "planning", message: "Build plan" }];

  assert.equal(requireRunEvents({ runId: "run-1", events }), events);
});

test("requireRunEvents rejects runs without event evidence", () => {
  assert.throws(
    () => requireRunEvents({ runId: "run-missing" }),
    /Run run-missing events evidence is required/,
  );
});

test("buildRunResultActions passes resume action to RunResult", () => {
  const refreshClarificationHistory = () => {};
  const resume = () => {};
  const actions = buildRunResultActions({
    confirm: () => {},
    continueRun: () => {},
    refreshClarificationHistory,
    resume,
    retry: () => {},
    start: () => {},
    submitPr: () => {},
  });

  assert.equal(actions.resume, resume);
  assert.equal(actions.refreshClarificationHistory, refreshClarificationHistory);
});

test("createResumeFromEditHandler calls resume from editing", () => {
  let resumedStage = "";
  const resumeFromEdit = createResumeFromEditHandler({
    confirm: () => {},
    continueRun: () => {},
    resume: (stage) => {
      resumedStage = stage;
    },
    retry: () => {},
    submitPr: () => {},
  });

  resumeFromEdit();

  assert.equal(resumedStage, "editing");
});

test("createResumeClarificationHandler calls resume from clarifying", () => {
  let resumedStage = "";
  const resumeClarification = createResumeClarificationHandler({
    resume: (stage) => {
      resumedStage = stage;
    },
  });

  resumeClarification();

  assert.equal(resumedStage, "clarifying");
});

test("clarification pause actions require answers before refine", () => {
  const awaitingAnswerRun = {
    status: "paused",
    stage: "clarifying_awaiting_answer",
    pendingQuestions: [{ id: "Q1", text: "是否只改前端？" }],
    clarificationHistory: [],
  };
  const answeredRun = {
    ...awaitingAnswerRun,
    pendingQuestions: [],
    clarificationHistory: [{ questionId: "Q1", answer: "只改前端" }],
  };
  const confirmPausedRun = {
    status: "paused",
    stage: "waiting_requirement_confirm",
  };

  assert.equal(isClarificationAwaitingAnswer(awaitingAnswerRun), true);
  assert.equal(canContinueAfterConfirm(awaitingAnswerRun), false);
  assert.equal(canResumeClarification(awaitingAnswerRun), false);
  assert.equal(canResumeClarification(answeredRun), true);
  assert.equal(canContinueAfterConfirm(confirmPausedRun), true);
});
