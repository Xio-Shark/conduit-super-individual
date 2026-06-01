import { summarizeCrossRunAiUsage } from "../../../services/orchestrator/src/aiUsageSummary.js";
import { recallHistory } from "../../../services/orchestrator/src/historyRecall.js";
import { listRunArchives } from "../../../services/orchestrator/src/runIndex.js";
import { listSkills } from "../../../services/skills/src/registry.js";

export function registerSystemRoutes(app, projectRoot) {
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/skills", (req, res) => {
    res.json({ skills: listSkills() });
  });

  app.get("/api/ai-usage/summary", async (req, res, next) => {
    try {
      res.json(await summarizeCrossRunAiUsage(projectRoot));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/runs-index", async (req, res, next) => {
    try {
      res.json(await listRunArchives(projectRoot));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/history", async (req, res, next) => {
    try {
      res.json(await recallHistory({ input: requireQueryInput(req.query?.input), projectRoot }));
    } catch (error) {
      next(error);
    }
  });
}

function requireQueryInput(input) {
  if (typeof input !== "string" || input.trim() === "") {
    const error = new Error("History query input is required");
    error.statusCode = 400;
    throw error;
  }
  return input.trim();
}
