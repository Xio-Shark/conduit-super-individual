import { submitDraftPr } from "./prSubmission.js";
import { confirmRun } from "./runConfirmation.js";
import { findRun, sendRunNotFound } from "./runRouteHelpers.js";
import { buildSubmissionItems } from "./submissionItems.js";

export function registerRunReviewRoutes(app, { gitProvider, projectRoot, runStore }) {
  app.post("/api/runs/:id/confirm", async (req, res, next) => {
    const run = await findRun(req.params.id, runStore);
    if (!run) return sendRunNotFound(res);
    try {
      res.json(await confirmRun({ requestBody: req.body, run, runStore }));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/runs/:id/pr", async (req, res, next) => {
    const run = await findRun(req.params.id, runStore);
    if (!run) return sendRunNotFound(res);

    try {
      const updatedRun = await submitDraftPr({
        env: process.env,
        gitProvider,
        requestBody: req.body,
        run,
        runStore,
      });
      res.status(201).json(updatedRun);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/runs/:id/submission", async (req, res, next) => {
    const run = await findRun(req.params.id, runStore);
    if (!run) return sendRunNotFound(res);
    res.json({
      runId: run.runId,
      evidenceDir: run.evidenceDir,
      items: buildSubmissionItems(projectRoot),
    });
  });
}
