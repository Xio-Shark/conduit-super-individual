import path from "node:path";
import { summarizeAiCalls } from "../../../services/orchestrator/src/aiUsage.js";
import { archiveEvidence } from "./runEvidenceGuards.js";

export function normalizeFailureRun(run, projectRoot) {
  const aiCalls = archiveEvidence.optionalArray(run.aiCalls, "aiCalls");
  const aiUsage = archiveEvidence.optionalObject(run.aiUsage, "aiUsage");
  if (aiCalls && !aiUsage) {
    throw new Error("Archived run evidence aiUsage is required when aiCalls are present");
  }
  if (aiUsage && !aiCalls) {
    throw new Error("Archived run evidence aiCalls are required when aiUsage is present");
  }
  if (aiCalls && aiUsage) {
    archiveEvidence.aiUsageMatchesCalls(aiUsage, aiCalls);
  }
  return {
    runId: archiveEvidence.text(run.runId, "runId"),
    sourceInput: optionalRequirementSource(run),
    retryOf: archiveEvidence.optionalText(run.retryOf, "retryOf"),
    stage: archiveEvidence.text(run.stage, "stage"),
    status: archiveEvidence.text(run.status ?? run.verificationStatus, "status"),
    repoPath: run.repoPath ?? null,
    evidenceDir: archiveEvidence.optionalText(run.evidenceDir, "evidenceDir") ?? runEvidenceDir(projectRoot, run),
    error: run.error,
    requirementCard: run.requirementCard || null,
    historyRecall: run.historyRecall || null,
    plan: run.plan || null,
    edit: run.edit || null,
    verification: run.verification || null,
    diff: run.diff ?? null,
    events: archiveEvidence.array(run.events, "events"),
    confirmations: archiveEvidence.optionalArray(run.confirmations, "confirmations") || [],
    aiCalls,
    aiUsage,
    prSubmission: run.prSubmission || null,
    prDraft: run.prDraft ?? null,
    checkpoints: run.checkpoints || null,
  };
}

export function normalizePausedRun(run, projectRoot) {
  if (!run.requirementCard.source_input) {
    throw new Error("Archived paused run requirement.md missing source_input");
  }
  const aiCalls = archiveEvidence.nonEmptyArray(run.aiCalls, "ai-calls.jsonl");
  const aiUsage = summarizeAiCalls(aiCalls);
  return {
    runId: archiveEvidence.text(run.runId, "runId"),
    sourceInput: run.requirementCard.source_input,
    retryOf: archiveEvidence.optionalText(run.retryOf, "retryOf"),
    stage: archiveEvidence.text(run.stage, "stage"),
    status: "paused",
    repoPath: run.repoPath ?? null,
    evidenceDir: archiveEvidence.optionalText(run.evidenceDir, "evidenceDir") ?? runEvidenceDir(projectRoot, run),
    error: run.error,
    requirementCard: run.requirementCard,
    historyRecall: archiveEvidence.object(run.historyRecall, "history-recall.json"),
    plan: run.plan || null,
    edit: null,
    verification: null,
    diff: null,
    events: archiveEvidence.array(run.events, "events"),
    confirmations: archiveEvidence.optionalArray(run.confirmations, "confirmations") || [],
    aiCalls,
    aiUsage,
    pendingQuestions: archiveEvidence.optionalArray(run.pendingQuestions, "pendingQuestions") || [],
    prSubmission: null,
    prDraft: null,
    checkpoints: run.checkpoints || null,
  };
}

export function normalizeSuccessfulRun(run, projectRoot) {
  if (!run.requirementCard.source_input) {
    throw new Error("Archived run evidence requirement.md missing source_input");
  }
  const normalized = normalizeFailureRun({
    ...run,
    edit: run.edit || editFromPlan(run.plan),
  }, projectRoot);
  archiveEvidence.nonEmptyArray(normalized.aiCalls, "ai-calls.jsonl");
  archiveEvidence.object(normalized.aiUsage, "aiUsage");
  archiveEvidence.object(normalized.plan, "plan.md");
  archiveEvidence.object(normalized.verification, "verification.json");
  archiveEvidence.text(normalized.diff, "diff.patch");
  archiveEvidence.text(normalized.prDraft, "pr-draft.md");
  return normalized;
}

function optionalRequirementSource(run) {
  return run.requirementCard?.source_input ?? null;
}

function editFromPlan(plan) {
  archiveEvidence.object(plan, "plan.md");
  return {
    changedFiles: archiveEvidence.nonEmptyArray(plan.target_files, "plan.md target_files"),
    summary: archiveEvidence.text(plan.summary, "plan.md summary"),
  };
}

function runEvidenceDir(projectRoot, run) {
  return path.join(projectRoot, "docs/reports/runs", archiveEvidence.text(run.runId, "runId"));
}
