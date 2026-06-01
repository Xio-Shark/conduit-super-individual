import assert from "node:assert/strict";
import test from "node:test";
import { answerClarification } from "./api.js";

test("answerClarification includes current question text when provided", async () => {
  await withFetchMock(async (path, init) => {
    assert.equal(path, "/api/runs/run-1/answer-clarification");
    assert.equal(init.method, "POST");
    assert.deepEqual(JSON.parse(init.body), {
      questionId: "Q1",
      question: "是否只改前端？",
      answer: "只改前端",
    });
    return jsonResponse(201, { questionId: "Q1", answer: "只改前端" });
  }, async () => {
    const result = await answerClarification("run-1", {
      questionId: "Q1",
      question: "是否只改前端？",
      answer: "只改前端",
    });

    assert.deepEqual(result, { questionId: "Q1", answer: "只改前端" });
  });
});

test("answerClarification keeps legacy payload when question text is omitted", async () => {
  await withFetchMock(async (path, init) => {
    assert.equal(path, "/api/runs/run-1/answer-clarification");
    assert.deepEqual(JSON.parse(init.body), {
      questionId: "Q1",
      answer: "只改前端",
    });
    return jsonResponse(201, { questionId: "Q1", answer: "只改前端" });
  }, async () => {
    await answerClarification("run-1", {
      questionId: "Q1",
      answer: "只改前端",
    });
  });
});

async function withFetchMock(handler, callback) {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = handler;

  try {
    await callback();
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
