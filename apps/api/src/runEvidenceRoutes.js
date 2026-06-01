import { findRun, sendRunNotFound } from "./runRouteHelpers.js";

export function registerRunEvidenceRoutes(app, runStore) {
  app.get("/api/runs/:id", async (req, res, next) => {
    const run = await findRun(req.params.id, runStore);
    if (!run) return sendRunNotFound(res);
    res.json(run);
  });

  app.get("/api/runs/:id/events", async (req, res, next) => {
    const run = await findRun(req.params.id, runStore);
    if (!run) return res.status(404).end();

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    for (const event of run.events) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
    res.end();
  });

  app.get("/api/runs/:id/diff", async (req, res, next) => {
    const run = await findRun(req.params.id, runStore);
    if (!run) return sendRunNotFound(res);
    res.type("text/plain").send(run.diff);
  });

  app.get("/api/runs/:id/pr-draft", async (req, res, next) => {
    const run = await findRun(req.params.id, runStore);
    if (!run) return sendRunNotFound(res);
    res.type("text/markdown").send(run.prDraft);
  });
}
