import { continueDelivery } from "../../../services/orchestrator/src/orchestrator.js";
import { RUN_STAGES } from "../../../libs/types/src/stages.js";
import { requireAnsweredPendingClarifications } from "./clarificationAnswerGuards.js";
import { toRunResponse } from "./runWorkflow.js";

export async function executeContinue({ runId, runStore, projectRoot }) {
  const existing = await runStore.find(runId);
  if (!existing) {
    const error = new Error("Run not found");
    error.statusCode = 404;
    throw error;
  }

  if (existing.status !== "paused") {
    const error = new Error("Only paused runs can continue");
    error.statusCode = 400;
    throw error;
  }

  if (existing.stage === RUN_STAGES.CLARIFYING_AWAITING_ANSWER) {
    await requireAnsweredPendingClarifications(existing);
  }

  try {
    const result = await continueDelivery({
      runId,
      projectRoot,
      env: process.env,
    });
    const response = toRunResponse(result, existing.sourceInput, existing.retryOf);
    runStore.set(response);
    await runStore.persistMetadata(response);
    return { statusCode: result.status === "paused" ? 202 : 200, body: response };
  } catch (error) {
    if (!error.runResult) throw error;

    const response = toRunResponse(error.runResult, existing.sourceInput, existing.retryOf);
    runStore.set(response);
    await runStore.persistMetadata(response);
    return {
      statusCode: 500,
      body: {
        error: { message: error.message },
        run: response,
      },
    };
  }
}

export function canContinuePausedRun(run) {
  return run?.status === "paused" && run?.stage !== RUN_STAGES.CLARIFYING_AWAITING_ANSWER;
}
