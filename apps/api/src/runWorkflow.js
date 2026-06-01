import { runEvidence } from "./runEvidenceGuards.js";

export async function executeRun({ input, projectRoot, retryOf, runDelivery, runStore }) {
  const requirementInput = requireRequirementInput(input);
  try {
    const result = await runDelivery({ input: requirementInput, projectRoot, env: process.env });
    const response = toRunResponse(result, requirementInput, retryOf);
    runStore.set(response);
    await runStore.persistMetadata(response);
    const statusCode = result.status === "paused" ? 202 : 201;
    return { statusCode, body: response };
  } catch (error) {
    if (!error.runResult) throw error;

    const response = toRunResponse(error.runResult, requirementInput, retryOf);
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

export function toRunResponse(result, input, retryOf) {
  const status = runEvidence.text(result.status, "status");
  const stage = runEvidence.text(result.stage, "stage");
  const events = [...runEvidence.array(result.events, "events")];
  const aiCalls = runEvidence.optionalArray(result.aiCalls, "aiCalls");
  const aiUsage = result.aiUsage || null;
  if (retryOf) {
    events.push({
      at: new Date().toISOString(),
      stage: "retry",
      message: `retried from ${retryOf}`,
    });
  }
  const response = {
    runId: runEvidence.text(result.runId, "runId"),
    sourceInput: result.requirementCard
      ? runEvidence.text(result.requirementCard.source_input, "requirementCard.source_input")
      : input,
    retryOf: retryOf || result.retryOf || null,
    stage,
    status,
    repoPath: result.repoPath ?? null,
    evidenceDir: runEvidence.text(result.evidenceDir, "evidenceDir"),
    error: result.error,
    requirementCard: result.requirementCard || null,
    historyRecall: result.historyRecall ?? null,
    pendingQuestions: runEvidence.optionalArray(result.pendingQuestions, "pendingQuestions") || [],
    plan: result.plan || null,
    edit: result.edit || null,
    verification: result.verification || null,
    aiCalls,
    aiUsage,
    diff: result.diff ?? null,
    events,
    confirmations: runEvidence.optionalArray(result.confirmations, "confirmations") || [],
    prSubmission: result.prSubmission || null,
    prDraft: result.prDraft ?? null,
    checkpoints: result.checkpoints || null,
  };
  requireAiEvidenceAfterClarify(response);
  requireReadyForPrEvidence(response);
  return response;
}

function requireAiEvidenceAfterClarify(run) {
  if (!hasReachedClarify(run)) return;
  runEvidence.object(run.aiUsage, "aiUsage");
  runEvidence.nonEmptyArray(run.aiCalls, "aiCalls");
}

function requireReadyForPrEvidence(run) {
  if (run.status !== "passed" && run.stage !== "ready_for_pr") {
    return;
  }
  runEvidence.object(run.requirementCard, "requirementCard");
  runEvidence.object(run.plan, "plan");
  runEvidence.object(run.edit, "edit");
  runEvidence.object(run.verification, "verification");
  runEvidence.text(run.diff, "diff");
  runEvidence.text(run.prDraft, "prDraft");
  runEvidence.object(run.aiUsage, "aiUsage");
  runEvidence.nonEmptyArray(run.aiCalls, "aiCalls");
}

function hasReachedClarify(run) {
  return Boolean(
    run.aiUsage
      || run.aiCalls
      || run.requirementCard
      || run.historyRecall
      || run.plan
      || run.edit
      || run.verification
      || run.diff
      || run.prDraft,
  );
}

function requireRequirementInput(input) {
  if (typeof input !== "string" || input.trim() === "") {
    const error = new Error("Requirement input is required");
    error.statusCode = 400;
    throw error;
  }
  return input.trim();
}
