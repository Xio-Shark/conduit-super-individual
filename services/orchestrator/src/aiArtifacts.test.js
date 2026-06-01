import assert from "node:assert/strict";
import test from "node:test";
import { buildAiArtifacts } from "./aiArtifacts.js";

const LLM_CARD = {
  id: "REQ-LLM-READS",
  source_input: "给文章列表加阅读量展示",
  goal: "文章列表卡片展示阅读量",
  scope: {
    include: ["文章列表", "阅读量", "展示字段"],
    exclude: ["后端 schema"],
  },
  assumptions: ["前端假数据"],
  clarifications: ["阅读量展示位置是否固定在列表卡片？"],
  acceptance: ["列表卡片显示 reads"],
  level: "L1",
};

function mockModelClient() {
  return {
    model: "test-llm",
    async chat() {
      return {
        content: JSON.stringify(LLM_CARD),
        tokensIn: 40,
        tokensOut: 30,
        latencyMs: 90,
        costEstimate: 0.00014,
      };
    },
  };
}

test("buildAiArtifacts requires explicit AI_MODE", async () => {
  await assert.rejects(
    () => buildAiArtifacts({
      env: {},
      input: "给文章列表加阅读量展示",
    }),
    /AI_MODE is required/,
  );
});

test("buildAiArtifacts uses explicit rules mode", async () => {
  const result = await buildAiArtifacts({
    env: { AI_MODE: "rules" },
    input: "给文章列表加阅读量展示",
  });

  assert.equal(result.mode, "rules");
  assert.equal(result.requirementCard.level, "L1");
  assert.equal(result.aiCalls[0].model, "rules-first-p0");
  assert.equal(result.aiCalls[0].prompt_version, "rules-first-p0");
  assert.equal(result.aiCalls[0].input_summary, "给文章列表加阅读量展示");
  assert.equal(result.aiCalls[0].output_summary, "文章列表卡片展示阅读量");
  assert.equal(result.aiCalls[0].tokens_in, 0);
});

test("buildAiArtifacts rejects unknown rules-mode requirements", async () => {
  await assert.rejects(
    () => buildAiArtifacts({
      env: { AI_MODE: "rules" },
      input: "把用户主页做得更智能一点",
    }),
    /Rules mode cannot classify requirement/,
  );
});

test("buildAiArtifacts uses llm mode with injected client", async () => {
  const result = await buildAiArtifacts({
    env: { AI_MODE: "llm" },
    input: "给文章列表加阅读量展示",
    modelClient: mockModelClient(),
  });

  assert.equal(result.mode, "llm");
  assert.equal(result.aiCalls[0].model, "test-llm");
  assert.ok(result.aiCalls[0].tokens_in > 0);
  assert.ok(result.aiCalls[0].tokens_out > 0);
});

test("buildAiArtifacts rejects unsupported mode", async () => {
  await assert.rejects(
    () => buildAiArtifacts({ env: { AI_MODE: "doubao" }, input: "test" }),
    /Unsupported AI_MODE/,
  );
});
