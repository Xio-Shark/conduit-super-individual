import { executeContinue } from "./continueWorkflow.js";
import { executeResume } from "./resumeWorkflow.js";
import { executeRun } from "./runWorkflow.js";
import { findRun, sendRunNotFound } from "./runRouteHelpers.js";

export function registerRunExecutionRoutes(app, context) {
  const { projectRoot, runDelivery, runStore } = context;

  app.post("/api/runs", async (req, res, next) => {
    await sendWorkflowOutcome(res, next, () =>
      executeRun({
        input: req.body?.input,
        projectRoot,
        runDelivery,
        runStore,
      }),
    );
  });

  app.post("/api/runs/:id/retry", async (req, res, next) => {
    const run = await findRun(req.params.id, runStore);
    if (!run) return sendRunNotFound(res);
    const input = Object.hasOwn(req.body ?? {}, "input") ? req.body.input : run.sourceInput;
    await sendWorkflowOutcome(res, next, () =>
      executeRun({
        input,
        projectRoot,
        retryOf: run.runId,
        runDelivery,
        runStore,
      }),
    );
  });

  app.post("/api/runs/:id/resume-from-stage", async (req, res, next) => {
    await sendWorkflowOutcome(res, next, () =>
      executeResume({
        runId: req.params.id,
        stage: req.body?.stage,
        revisedInput: req.body?.revisedInput,
        projectRoot,
        runStore,
      }),
    );
  });

  app.post("/api/runs/:id/continue", async (req, res, next) => {
    await sendWorkflowOutcome(res, next, () =>
      executeContinue({
        runId: req.params.id,
        projectRoot,
        runStore,
      }),
    );
  });
}

async function sendWorkflowOutcome(res, next, workflow) {
  try {
    const outcome = await workflow();
    res.status(outcome.statusCode).json(outcome.body);
  } catch (error) {
    next(error);
  }
}
