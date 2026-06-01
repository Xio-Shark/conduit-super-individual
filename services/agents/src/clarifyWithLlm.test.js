import assert from "node:assert/strict";
import test from "node:test";
import { clarifyWithLlm, proposeClarifications, refineWithAnswers, CLARIFY_PROMPT_VERSION } from "./clarifyWithLlm.js";

const CARD_JSON = {
  id: "REQ-LLM-READS",
  source_input: "给文章列表加阅读量展示",
  goal: "文章列表卡片展示阅读量",
  scope: {
    include: ["文章列表", "阅读量", "展示字段", "Conduit frontend"],
    exclude: ["后端 schema", "数据库迁移"],
  },
  assumptions: ["P0 使用前端假数据"],
  clarifications: ["阅读量是否仅展示在 ArticlePreview 卡片？"],
  acceptance: ["列表卡片显示 eye icon 和 reads"],
  level: "L1",
};

function buildClient({ contentBuilder, model = "mimo-v2.5-pro", tokensIn = 90, tokensOut = 60 }) {
  const calls = [];
  return {
    model,
    calls,
    async chat({ messages }) {
      calls.push(messages);
      const content = typeof contentBuilder === "function" ? contentBuilder(messages, calls.length) : contentBuilder;
      return { content, tokensIn, tokensOut, latencyMs: 120, costEstimate: 0.0003 };
    },
  };
}

test("clarifyWithLlm returns validated card and non-zero usage (legacy shape)", async () => {
  const client = buildClient({ contentBuilder: () => JSON.stringify(CARD_JSON) });
  const result = await clarifyWithLlm({ input: "给文章列表加阅读量展示", modelClient: client });

  assert.equal(result.requirementCard.level, "L1");
  assert.equal(result.aiCall.model, "mimo-v2.5-pro");
  assert.ok(result.aiCall.tokens_in > 0);
  assert.equal(result.aiCall.prompt_version, CLARIFY_PROMPT_VERSION);
});

test("proposeClarifications returns pendingQuestions when LLM decides clarify", async () => {
  const client = buildClient({
    contentBuilder: () => JSON.stringify({
      decision: "clarify",
      requirement_card: null,
      pending_questions: [
        { id: "Q1", text: "阅读量数据来源是前端假数据还是后端 API？" },
        { id: "Q2", text: "是否需要修改后端 schema 添加 reads 字段？" },
      ],
    }),
  });

  const turn = await proposeClarifications({
    input: "文章列表想好看一点，加点数据，别动太多代码。",
    modelClient: client,
  });

  assert.equal(turn.decision, "clarify");
  assert.equal(turn.requirementCard, null);
  assert.equal(turn.pendingQuestions.length, 2);
  assert.equal(turn.pendingQuestions[0].id, "Q1");
  assert.equal(turn.aiCall.stage, "clarify");
});

test("refineWithAnswers includes prior PM answers in prompt", async () => {
  const client = buildClient({
    contentBuilder: () => JSON.stringify({ decision: "finalize", requirement_card: CARD_JSON, pending_questions: [] }),
  });

  const turn = await refineWithAnswers({
    input: "文章列表想好看一点，加点数据，别动太多代码。",
    modelClient: client,
    history: [
      { questionId: "Q1", question: "阅读量数据来源？", answer: "前端假数据" },
      { questionId: "Q2", question: "需要改后端吗？", answer: "不改" },
    ],
  });

  assert.equal(turn.decision, "finalize");
  assert.equal(turn.aiCall.stage, "clarify-refine");
  const userMessage = client.calls[0][1].content;
  assert.ok(userMessage.includes("前端假数据"));
  assert.ok(userMessage.includes("不改"));
});

test("refineWithAnswers refuses empty history", async () => {
  const client = buildClient({ contentBuilder: () => "{}" });
  await assert.rejects(
    () => refineWithAnswers({ input: "x", modelClient: client, history: [] }),
    /non-empty PM answer history/,
  );
});

test("clarifyWithLlm rejects clarify decision (must use multi-turn API)", async () => {
  const client = buildClient({
    contentBuilder: () => JSON.stringify({
      decision: "clarify",
      requirement_card: null,
      pending_questions: [{ id: "Q1", text: "?" }],
    }),
  });
  await assert.rejects(
    () => clarifyWithLlm({ input: "vague", modelClient: client }),
    /did not finalize/,
  );
});

test("proposeClarifications rejects empty pending_questions when decision=clarify", async () => {
  const client = buildClient({
    contentBuilder: () => JSON.stringify({ decision: "clarify", requirement_card: null, pending_questions: [] }),
  });
  await assert.rejects(
    () => proposeClarifications({ input: "x", modelClient: client }),
    /non-empty pending_questions/,
  );
});
