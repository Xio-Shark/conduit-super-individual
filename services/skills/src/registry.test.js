import assert from "node:assert/strict";
import test from "node:test";
import { findSkill, listSkills } from "./registry.js";

test("findSkill resolves a clear registered requirement", () => {
  const skill = findSkill(requirementCard({
    acceptance: ["Popular Tags 区域最多展示前 5 个标签"],
    goal: "Popular Tags 前 5 个打标",
    include: ["Popular Tags", "前 5", "打标"],
    sourceInput: "给 Popular Tags 侧边栏前 5 个标签打醒目标记",
  }));

  assert.equal(skill.id, "popular-tags-top-five");
});

test("findSkill rejects low-confidence single-keyword matches", () => {
  assert.throws(
    () => findSkill(requirementCard({
      goal: "给标签做一点优化",
      include: ["tag"],
      sourceInput: "tag",
    })),
    /No Skill matched/,
  );
});

test("findSkill rejects ambiguous equal-score matches", () => {
  assert.throws(
    () => findSkill(requirementCard({
      acceptance: ["文章列表展示阅读量", "文章详情页展示字数"],
      goal: "文章列表和详情页都加指标",
      include: ["文章列表", "阅读量", "详情页", "字数"],
      sourceInput: "文章列表阅读量和详情页字数一起做",
    })),
    /Ambiguous Skill match/,
  );
});

test("listSkills exposes metadata without executable hooks", () => {
  const skills = listSkills();
  const draftSkill = skills.find((skill) => skill.id === "article-draft-indicator");

  assert.ok(draftSkill);
  assert.equal(typeof draftSkill.planSummary, "string");
  assert.equal("apply" in draftSkill, false);
  assert.equal("crossStackCheck" in draftSkill, false);
});

function requirementCard({
  acceptance = [],
  goal,
  include = [],
  sourceInput,
}) {
  return {
    acceptance,
    goal,
    scope: { include },
    source_input: sourceInput,
  };
}
