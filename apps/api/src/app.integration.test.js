import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createApp } from "./app.js";
import { runP0Delivery } from "../../../services/orchestrator/src/orchestrator.js";

const PROJECT_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

test("integration: POST /api/runs executes real delivery pipeline", { skip: !process.env.RUN_INTEGRATION }, async () => {
  const app = createApp({
    projectRoot: PROJECT_ROOT,
    runDelivery: (options) =>
      runP0Delivery({
        ...options,
        projectRoot: PROJECT_ROOT,
        env: { ...process.env, AI_MODE: "rules" },
      }),
  });
  const server = app.listen(0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${baseUrl}/api/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: "Popular Tags 前 5 个打标，纯前端" }),
    });
    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.status, "passed");
    assert.equal(payload.plan.skill_id, "popular-tags-top-five");
    assert.match(payload.diff, /tag-top-five/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
