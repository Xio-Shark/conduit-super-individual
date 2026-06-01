import { resumeFromStage } from "../../../services/orchestrator/src/orchestrator.js";
import { RUN_STAGES } from "../../../libs/types/src/stages.js";
import { requireAnsweredPendingClarifications } from "./clarificationAnswerGuards.js";
import { toRunResponse } from "./runWorkflow.js";

export async function executeResume({ runId, stage, revisedInput, runStore, projectRoot }) {
  const existing = await runStore.find(runId);
  if (!existing) {
    const error = new Error("Run not found");
    error.statusCode = 404;
    throw error;
  }

  if (!canResumeRun(existing, stage)) {
    const error = new Error("Only completed runs can resume-from-stage");
    error.statusCode = 400;
    throw error;
  }

  if (isClarificationResume(existing, stage)) {
    await requireAnsweredPendingClarifications(existing);
  }

  try {
    const result = await resumeFromStage({
      runId,
      stage,
      revisedInput,
      projectRoot,
      env: process.env,
    });
    const response = toRunResponse(result, result.requirementCard.source_input, existing.retryOf);
    runStore.set(response);
    await runStore.persistMetadata(response);
    return { statusCode: 200, body: response };
  } catch (error) {
    if (!error.runResult) throw error;

    const response = toRunResponse(error.runResult, revisedInput || existing.sourceInput, existing.retryOf);
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

function canResumeRun(run, stage) {
  const completed = run.status === "passed" && run.stage === RUN_STAGES.READY_FOR_PR;
  const clarifyingAwaitingAnswer = isClarificationResume(run, stage);
  return completed || clarifyingAwaitingAnswer;
}

function isClarificationResume(run, stage) {
  return (
    run.status === "paused"
    && run.stage === RUN_STAGES.CLARIFYING_AWAITING_ANSWER
    && (stage === RUN_STAGES.CLARIFYING || stage === "clarify")
  );
}
