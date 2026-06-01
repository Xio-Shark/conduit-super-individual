export const RUN_STAGES = Object.freeze({
  CREATED: "created",
  CLARIFYING: "clarifying",
  CLARIFYING_AWAITING_ANSWER: "clarifying_awaiting_answer",
  REQUIREMENT_CONFIRM: "waiting_requirement_confirm",
  PLANNING: "planning",
  PLAN_CONFIRM: "waiting_plan_confirm",
  EDITING: "editing",
  VERIFYING: "verifying",
  PR_DRAFTING: "pr_drafting",
  READY_FOR_PR: "ready_for_pr",
  FAILED: "failed",
});

export const P0_INPUT =
  "给文章列表加阅读量展示，前端假数据即可，不改后端。";

export const FUZZY_L3_INPUT =
  "文章列表想好看一点，加点数据，别动太多代码。";
