import assert from "node:assert/strict";
import test from "node:test";
import { createLlmClient, resolveChatCompletionsUrl } from "./llmClient.js";

test("resolveChatCompletionsUrl appends v1 path", () => {
  assert.equal(
    resolveChatCompletionsUrl("https://ai.example.com"),
    "https://ai.example.com/v1/chat/completions",
  );
  assert.equal(
    resolveChatCompletionsUrl("https://ai.example.com/v1"),
    "https://ai.example.com/v1/chat/completions",
  );
  assert.equal(
    resolveChatCompletionsUrl("https://token-plan-cn.xiaomimimo.com/anthropic"),
    "https://token-plan-cn.xiaomimimo.com/v1/chat/completions",
  );
});

test("createLlmClient requires credentials", () => {
  assert.throws(() => createLlmClient({ AI_MODE: "llm" }), /LLM_API_KEY/);
});

test("createLlmClient parses chat response", async () => {
  const card = {
    id: "REQ-LLM",
    source_input: "给文章列表加阅读量展示",
    goal: "文章列表卡片展示阅读量",
    scope: { include: ["文章列表", "阅读量", "展示字段"], exclude: ["后端 schema"] },
    assumptions: ["前端假数据"],
    clarifications: ["阅读量展示在列表卡片？"],
    acceptance: ["列表显示 reads"],
    level: "L1",
  };

  const fetchImpl = async () => ({
    ok: true,
    async text() {
      return JSON.stringify({
        choices: [{ message: { content: JSON.stringify(card) } }],
        usage: { prompt_tokens: 120, completion_tokens: 80 },
      });
    },
  });

  const client = createLlmClient(
    {
      LLM_API_KEY: "test-key",
      LLM_BASE_URL: "https://ai.example.com",
      LLM_MODEL: "test-model",
    },
    fetchImpl,
  );

  const result = await client.chat({ messages: [{ role: "user", content: "hi" }] });
  assert.equal(result.tokensIn, 120);
  assert.equal(result.tokensOut, 80);
  assert.ok(result.latencyMs >= 0);
  assert.ok(result.costEstimate > 0);
});

test("createLlmClient rejects responses without usage", async () => {
  const client = createLlmClient(
    {
      LLM_API_KEY: "test-key",
      LLM_BASE_URL: "https://ai.example.com",
      LLM_MODEL: "test-model",
    },
    async () => ({
      ok: true,
      async text() {
        return JSON.stringify({
          choices: [{ message: { content: "{}" } }],
        });
      },
    }),
  );

  await assert.rejects(
    () => client.chat({ messages: [{ role: "user", content: "hi" }] }),
    /missing usage/,
  );
});

test("createLlmClient rejects non-positive usage token counts", async () => {
  const client = createLlmClient(
    {
      LLM_API_KEY: "test-key",
      LLM_BASE_URL: "https://ai.example.com",
      LLM_MODEL: "test-model",
    },
    async () => ({
      ok: true,
      async text() {
        return JSON.stringify({
          choices: [{ message: { content: "{}" } }],
          usage: { prompt_tokens: 0, completion_tokens: 12 },
        });
      },
    }),
  );

  await assert.rejects(
    () => client.chat({ messages: [{ role: "user", content: "hi" }] }),
    /prompt_tokens\/input_tokens/,
  );
});
