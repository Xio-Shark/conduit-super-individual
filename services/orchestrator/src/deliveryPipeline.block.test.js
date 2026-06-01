import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { runDelivery } from "./deliveryPipeline.js";

const PROJECT_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

test("runDelivery pauses at requirement confirm when BLOCK_ON_CONFIRM=1", async () => {
  const result = await runDelivery({
    input: "给文章列表加阅读量展示，前端假数据即可，不改后端。",
    projectRoot: PROJECT_ROOT,
    env: { AI_MODE: "rules", BLOCK_ON_CONFIRM: "1" },
  });

  assert.equal(result.status, "paused");
  assert.equal(result.stage, "waiting_requirement_confirm");
  assert.ok(result.requirementCard);
  assert.equal(result.plan, null);

  const aiCalls = await readFile(`${result.evidenceDir}/ai-calls.jsonl`, "utf8");
  assert.match(aiCalls, /rules-first-p0/);
});
