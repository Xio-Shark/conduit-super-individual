import assert from "node:assert/strict";
import test from "node:test";
import { parseRequirementCardFromLlm, validateRequirementCard } from "./requirementCard.js";

const SAMPLE = {
  id: "REQ-TEST",
  source_input: "给文章列表加阅读量",
  goal: "文章列表展示阅读量",
  scope: { include: ["文章列表", "阅读量"], exclude: ["后端"] },
  assumptions: ["使用前端假数据"],
  clarifications: ["阅读量是否仅展示在列表卡片？"],
  acceptance: ["列表卡片可见阅读量"],
  level: "L1",
};

test("validateRequirementCard accepts complete card", () => {
  assert.deepEqual(validateRequirementCard({ ...SAMPLE }), SAMPLE);
});

test("parseRequirementCardFromLlm parses fenced JSON", () => {
  const content = "```json\n" + JSON.stringify(SAMPLE) + "\n```";
  const card = parseRequirementCardFromLlm(content);
  assert.equal(card.id, "REQ-TEST");
  assert.equal(card.level, "L1");
});

test("parseRequirementCardFromLlm rejects missing source_input", () => {
  const { source_input, ...withoutSourceInput } = SAMPLE;

  assert.throws(
    () => parseRequirementCardFromLlm(JSON.stringify(withoutSourceInput)),
    /source_input/,
  );
});

test("parseRequirementCardFromLlm rejects flattened scope aliases", () => {
  const { scope, ...withoutScope } = SAMPLE;
  const flattenedScope = {
    ...withoutScope,
    scope_include: scope.include,
    scope_exclude: scope.exclude,
  };

  assert.throws(
    () => parseRequirementCardFromLlm(JSON.stringify(flattenedScope)),
    /scope/,
  );
});

test("validateRequirementCard rejects missing clarifications", () => {
  assert.throws(
    () => validateRequirementCard({ ...SAMPLE, clarifications: [] }),
    /clarifications/,
  );
});
