import assert from "node:assert/strict";
import test from "node:test";
import { createConsoleActions } from "./useConsoleController.js";

test("start creates a run and loads submission evidence", async () => {
  const run = { runId: "run-1", status: "passed" };
  const submission = { status: "pending_human" };
  const { calls, state } = createState({ input: "给文章列表加阅读量" });

  await withFetchMock((path) => {
    if (path === "/api/runs") return jsonResponse(200, run);
    if (path === "/api/runs/run-1/clarification-history") {
      return jsonResponse(200, { runId: "run-1", entries: [] });
    }
    if (path === "/api/runs/run-1/submission") return jsonResponse(200, submission);
    throw new Error(`Unexpected request: ${path}`);
  }, async (requests) => {
    await createConsoleActions(state).start();

    assert.equal(requests.length, 3);
    assert.equal(requests[0].path, "/api/runs");
    assert.equal(requests[0].init.method, "POST");
    assert.deepEqual(JSON.parse(requests[0].init.body), { input: "给文章列表加阅读量" });
    assert.deepEqual(state.run, { ...run, clarificationHistory: [] });
    assert.deepEqual(state.submission, submission);
    assert.equal(state.error, "");
    assert.equal(state.loading, false);
    assert.deepEqual(calls.map((call) => call[0]), [
      "loading",
      "error",
      "submission",
      "run",
      "submission",
      "loading",
    ]);
  });
});

test("start keeps failed run evidence when API error includes a run", async () => {
  const failedRun = { runId: "run-failed", status: "failed" };
  const submission = { status: "invalid" };
  const { state } = createState({ input: "模糊需求" });

  await withFetchMock((path) => {
    if (path === "/api/runs") {
      return jsonResponse(500, { error: { message: "Run failed at verify" }, run: failedRun });
    }
    if (path === "/api/runs/run-failed/clarification-history") {
      return jsonResponse(200, { runId: "run-failed", entries: [] });
    }
    if (path === "/api/runs/run-failed/submission") return jsonResponse(200, submission);
    throw new Error(`Unexpected request: ${path}`);
  }, async () => {
    await createConsoleActions(state).start();

    assert.deepEqual(state.run, { ...failedRun, clarificationHistory: [] });
    assert.deepEqual(state.submission, submission);
    assert.equal(state.error, "Run failed at verify");
    assert.equal(state.loading, false);
  });
});

test("inactive run actions expose active-run errors", async () => {
  const { state } = createState();
  const actions = createConsoleActions(state);

  await assert.rejects(actions.retry(), /Cannot retry without an active run/);
  await assert.rejects(actions.resume("editing"), /Cannot resume without an active run/);
  await assert.rejects(actions.continueRun(), /Cannot continue without an active run/);
  await assert.rejects(
    actions.refreshClarificationHistory(),
    /Cannot refresh clarification history without an active run/,
  );

  await actions.confirm("plan");
  assert.equal(state.error, "Cannot confirm without an active run");

  await actions.submitPr();
  assert.equal(state.error, "Cannot submit PR without an active run");
  assert.equal(state.loading, false);
});

test("submitPr updates run without reloading submission", async () => {
  const submittedRun = { runId: "run-1", status: "ready_for_pr", prUrl: "https://example.test/pr/1" };
  const existingSubmission = { status: "pending_human" };
  const { state } = createState({
    prRefs: { base: "main", head: "feature/read-count" },
    run: { runId: "run-1", status: "ready_for_pr" },
    submission: existingSubmission,
  });

  await withFetchMock((path) => {
    if (path === "/api/runs/run-1/pr") return jsonResponse(200, submittedRun);
    throw new Error(`Unexpected request: ${path}`);
  }, async (requests) => {
    await createConsoleActions(state).submitPr();

    assert.equal(requests.length, 1);
    assert.equal(requests[0].path, "/api/runs/run-1/pr");
    assert.deepEqual(JSON.parse(requests[0].init.body), {
      base: "main",
      confirm: true,
      head: "feature/read-count",
    });
    assert.deepEqual(state.run, submittedRun);
    assert.deepEqual(state.submission, existingSubmission);
    assert.equal(state.loading, false);
  });
});

test("refreshClarificationHistory loads answers and removes answered pending questions", async () => {
  const { state } = createState({
    run: {
      runId: "run-clarify",
      status: "paused",
      stage: "clarifying_awaiting_answer",
      pendingQuestions: [
        { id: "Q1", text: "是否只改前端？" },
        { id: "Q2", text: "展示在哪个位置？" },
      ],
    },
  });

  await withFetchMock((path) => {
    if (path === "/api/runs/run-clarify/clarification-history") {
      return jsonResponse(200, {
        runId: "run-clarify",
        entries: [{ questionId: "Q1", question: "是否只改前端？", answer: "只改前端" }],
      });
    }
    throw new Error(`Unexpected request: ${path}`);
  }, async (requests) => {
    await createConsoleActions(state).refreshClarificationHistory();

    assert.equal(requests.length, 1);
    assert.deepEqual(state.run.clarificationHistory, [
      { questionId: "Q1", question: "是否只改前端？", answer: "只改前端" },
    ]);
    assert.deepEqual(state.run.pendingQuestions, [
      { id: "Q2", text: "展示在哪个位置？" },
    ]);
  });
});

test("refreshClarificationHistory keeps reused question ids when question text changed", async () => {
  const { state } = createState({
    run: {
      runId: "run-clarify-reused-id",
      status: "paused",
      stage: "clarifying_awaiting_answer",
      pendingQuestions: [
        { id: "Q1", text: "是否需要同步后端接口？" },
      ],
    },
  });

  await withFetchMock((path) => {
    if (path === "/api/runs/run-clarify-reused-id/clarification-history") {
      return jsonResponse(200, {
        runId: "run-clarify-reused-id",
        entries: [{ questionId: "Q1", question: "是否只改前端？", answer: "只改前端" }],
      });
    }
    throw new Error(`Unexpected request: ${path}`);
  }, async () => {
    await createConsoleActions(state).refreshClarificationHistory();

    assert.deepEqual(state.run.pendingQuestions, [
      { id: "Q1", text: "是否需要同步后端接口？" },
    ]);
  });
});

function createState({
  input = "",
  prRefs = { base: "", head: "" },
  run = null,
  submission = null,
} = {}) {
  const calls = [];
  const state = {
    error: "previous error",
    input,
    loading: false,
    prRefs,
    run,
    setError(value) {
      state.error = value;
      calls.push(["error", value]);
    },
    setInput(value) {
      state.input = value;
      calls.push(["input", value]);
    },
    setLoading(value) {
      state.loading = value;
      calls.push(["loading", value]);
    },
    setPrRefs(value) {
      state.prRefs = value;
      calls.push(["prRefs", value]);
    },
    setRun(value) {
      state.run = value;
      calls.push(["run", value]);
    },
    setSubmission(value) {
      state.submission = value;
      calls.push(["submission", value]);
    },
    submission,
  };
  return { calls, state };
}

async function withFetchMock(handler, callback) {
  const previousFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (path, init = {}) => {
    requests.push({ init, path });
    return handler(path, init);
  };

  try {
    await callback(requests);
  } finally {
    globalThis.fetch = previousFetch;
  }
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}
