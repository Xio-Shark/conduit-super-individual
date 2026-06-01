import path from "node:path";
import { existsSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { RUN_STAGES } from "../../../libs/types/src/stages.js";
import { summarizeAiCalls } from "./aiUsage.js";
import { record } from "./deliveryEvents.js";

export async function persistPaused(context, stage, state, options = {}) {
  record(context.events, stage, "Waiting for human confirmation");
  const aiCalls = state.aiArtifacts?.aiCalls || null;
  const pendingQuestions = options.pendingQuestions || state.pendingQuestions || null;
  const result = {
    runId: context.runId,
    stage,
    status: "paused",
    origin: state.origin,
    repoPath: path.resolve(context.repoPath),
    evidenceDir: context.evidence.runDir,
    requirementCard: state.requirementCard,
    historyRecall: state.historyRecall,
    plan: state.plan || null,
    events: context.events,
    checkpoints: context.checkpoints,
    aiMode: state.aiArtifacts?.mode || "rules",
    aiCalls,
    aiUsage: aiCalls ? summarizeAiCalls(aiCalls) : null,
    pendingQuestions,
  };
  const pausedRecord = {
    stage,
    at: new Date().toISOString(),
    runId: context.runId,
  };
  if (pendingQuestions?.length) {
    pausedRecord.pendingQuestions = pendingQuestions;
  }
  await context.evidence.writeJson("paused.json", pausedRecord);
  if (state.plan) {
    await context.evidence.writeJson("checkpoints.json", context.checkpoints);
  }
  return result;
}

export async function persistSuccess(context, state) {
  const pausedPath = path.join(context.evidence.runDir, "paused.json");
  if (existsSync(pausedPath)) {
    await unlink(pausedPath);
  }
  const result = buildRunResult(context, state);
  await context.evidence.writeJson("run-summary.json", summarizeRun(result));
  await context.evidence.writeJson("checkpoints.json", context.checkpoints);
  result.checkpoints = context.checkpoints;
  return result;
}

export async function persistFailure(context, error, state) {
  record(context.events, RUN_STAGES.FAILED, error.message);
  const failure = {
    runId: context.runId,
    stage: RUN_STAGES.FAILED,
    status: "failed",
    error: error.message,
    repoPath: path.resolve(context.repoPath),
    evidenceDir: context.evidence.runDir,
    events: context.events,
    checkpoints: context.checkpoints,
    ...failureEvidence(state),
  };
  await context.evidence.writeJson("failure.json", failure);
  if (Object.keys(context.checkpoints).length) {
    await context.evidence.writeJson("checkpoints.json", context.checkpoints);
  }
  error.runResult = failure;
}

function buildRunResult(context, state) {
  return {
    runId: context.runId,
    stage: RUN_STAGES.READY_FOR_PR,
    status: state.verification.status,
    origin: state.origin,
    repoPath: path.resolve(context.repoPath),
    evidenceDir: context.evidence.runDir,
    requirementCard: state.requirementCard,
    historyRecall: state.historyRecall,
    plan: state.plan,
    edit: state.edit,
    verification: state.verification,
    diff: state.diff,
    prDraft: state.prDraft,
    events: context.events,
    aiMode: state.aiArtifacts.mode,
    aiCalls: state.aiCalls,
    aiUsage: state.aiUsage,
    checkpoints: context.checkpoints,
  };
}

function failureEvidence(state) {
  const aiCalls = state.aiCalls || state.aiArtifacts?.aiCalls || null;
  return {
    requirementCard: state.requirementCard,
    historyRecall: state.historyRecall,
    plan: state.plan,
    edit: state.edit,
    diff: state.diff,
    verification: state.verification,
    aiCalls,
    aiUsage: aiCalls ? summarizeAiCalls(aiCalls) : null,
  };
}

function summarizeRun(result) {
  return {
    runId: result.runId,
    stage: result.stage,
    status: result.status,
    repoPath: result.repoPath,
    evidenceDir: result.evidenceDir,
    aiMode: result.aiMode,
    aiUsage: result.aiUsage,
    historyRecall: result.historyRecall,
    targetFiles: result.plan.target_files,
    verificationStatus: result.verification.status,
    events: result.events,
    checkpoints: result.checkpoints,
  };
}
