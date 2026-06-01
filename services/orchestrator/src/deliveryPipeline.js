import path from "node:path";
import { RUN_STAGES } from "../../../libs/types/src/stages.js";
import { createDeliveryContext, loadResumeContext, loadUpstreamState } from "./deliveryContext.js";
import { RESUME_STAGE_ORDER } from "./deliveryConfig.js";
import { record } from "./deliveryEvents.js";
import { markdownFromObject } from "./evidence.js";
import { normalizeResumeStage, readOptionalJson, requireString } from "./deliveryIo.js";
import { persistFailure, persistPaused, persistSuccess } from "./deliveryPersistence.js";
import { serializeAiCallLog } from "./aiUsage.js";
import { PendingClarificationError } from "./aiArtifacts.js";
import {
  clarifyRequirement,
  draftPr,
  editSandbox,
  planDelivery,
  verifySandbox,
} from "./deliveryStages.js";

export { RESUME_STAGE_ORDER };

const PIPELINE_STEPS = Object.freeze([
  {
    pauseStage: RUN_STAGES.REQUIREMENT_CONFIRM,
    run: (context, state, options) => clarifyRequirement(context, options),
    stage: RUN_STAGES.CLARIFYING,
  },
  {
    pauseStage: RUN_STAGES.PLAN_CONFIRM,
    run: (context, state, options) => planDelivery(context, state.requirementCard, state.historyRecall, options),
    stage: RUN_STAGES.PLANNING,
  },
  {
    run: (context, state) => editSandbox(context, state.skill),
    stage: RUN_STAGES.EDITING,
  },
  {
    run: (context, state) => verifySandbox(context, state),
    stage: RUN_STAGES.VERIFYING,
  },
  {
    run: (context, state) => draftPr(context, state),
    stage: RUN_STAGES.PR_DRAFTING,
  },
]);

export async function runDelivery(options = {}) {
  const context = await createDeliveryContext(options);
  return executeFromStage(context, RUN_STAGES.CLARIFYING, options);
}

export async function resumeFromStage(options = {}) {
  const runId = requireString(options.runId, "runId");
  const stage = normalizeResumeStage(options.stage);
  rejectIgnoredRevisedInput(stage, options.revisedInput);
  const context = await loadResumeContext({
    runId,
    projectRoot: options.projectRoot,
    revisedInput: options.revisedInput,
    repoPath: options.repoPath,
  });
  record(context.events, "resume", `resume-from-stage:${stage}`);
  return executeFromStage(context, stage, options);
}

export async function continueDelivery(options = {}) {
  const runId = requireString(options.runId, "runId");
  const context = await loadResumeContext({
    runId,
    projectRoot: options.projectRoot,
    repoPath: options.repoPath,
  });
  const paused = await readOptionalJson(path.join(context.evidence.runDir, "paused.json"));
  if (!paused?.stage) {
    throw new Error(`Run ${runId} is not waiting for confirmation`);
  }
  const pauseStage = paused.stage;
  const metadata = await readOptionalJson(path.join(context.evidence.runDir, "metadata.json"));
  const confirmations = Array.isArray(metadata?.confirmations) ? metadata.confirmations : [];

  if (pauseStage === RUN_STAGES.REQUIREMENT_CONFIRM) {
    requireApprovedConfirmation(confirmations, "requirement");
    record(context.events, "continue", "continue-after-requirement-confirm");
    return executeFromStage(context, RUN_STAGES.PLANNING, options);
  }

  if (pauseStage === RUN_STAGES.PLAN_CONFIRM) {
    requireApprovedConfirmation(confirmations, "plan");
    record(context.events, "continue", "continue-after-plan-confirm");
    return executeFromStage(context, RUN_STAGES.EDITING, options);
  }

  if (pauseStage === RUN_STAGES.CLARIFYING_AWAITING_ANSWER) {
    record(context.events, "continue", "continue-after-clarification-answer");
    return executeFromStage(context, RUN_STAGES.CLARIFYING, options);
  }

  throw new Error(`Run ${runId} has unsupported pause stage: ${pauseStage}`);
}

async function executeFromStage(context, startStage, options) {
  const state = {};
  const startIndex = RESUME_STAGE_ORDER.indexOf(startStage);
  if (startIndex < 0) {
    throw new Error(`Unsupported resume stage: ${startStage}`);
  }
  const startStepIndex = PIPELINE_STEPS.findIndex((step) => step.stage === startStage);
  if (startStepIndex < 0) {
    throw new Error(`Unsupported pipeline stage: ${startStage}`);
  }

  try {
    if (startIndex > 0) {
      Object.assign(state, await loadUpstreamState(context, startStage));
    }

    for (const step of PIPELINE_STEPS.slice(startStepIndex)) {
      Object.assign(state, await step.run(context, state, options));
      if (step.pauseStage && shouldBlockOnConfirm(options.env || process.env)) {
        return persistPaused(context, step.pauseStage, state);
      }
    }

    return await persistSuccess(context, state);
  } catch (error) {
    if (error instanceof PendingClarificationError) {
      await persistPendingClarification(context, state, error);
      return persistPaused(context, RUN_STAGES.CLARIFYING_AWAITING_ANSWER, state, {
        pendingQuestions: error.pendingQuestions,
      });
    }
    await persistFailure(context, error, state);
    throw error;
  }
}

async function persistPendingClarification(context, state, error) {
  state.aiArtifacts = state.aiArtifacts || { mode: "llm", aiCalls: error.aiCalls };
  state.pendingQuestions = error.pendingQuestions;
  const partialCard = {
    id: "REQ-PENDING-CLARIFICATION",
    source_input: context.input,
    goal: "pending: awaiting PM clarification",
    scope: { include: ["pending"], exclude: ["pending"] },
    assumptions: ["awaiting PM answers"],
    clarifications: error.pendingQuestions.map((q) => `${q.id}: ${q.text}`),
    acceptance: ["pending"],
    level: "L3",
  };
  await context.evidence.writeText(
    "requirement.md",
    markdownFromObject("Requirement (pending clarification)", partialCard),
  );
  await context.evidence.writeText(
    "ai-calls.jsonl",
    serializeAiCallLog(error.aiCalls),
  );
}

function shouldBlockOnConfirm(env = process.env) {
  return env.BLOCK_ON_CONFIRM === "1" || env.BLOCK_ON_CONFIRM === "true";
}

function rejectIgnoredRevisedInput(stage, revisedInput) {
  if (typeof revisedInput !== "string" || revisedInput.trim() === "") return;
  if (stage === RUN_STAGES.CLARIFYING || stage === RUN_STAGES.PLANNING) return;
  throw new Error("revisedInput is only supported when resuming from clarifying or planning");
}

function requireApprovedConfirmation(confirmations, target) {
  const approved = confirmations.some(
    (confirmation) => confirmation.target === target && confirmation.decision === "approved",
  );
  if (!approved) {
    throw new Error(`Missing approved confirmation for ${target}`);
  }
}
