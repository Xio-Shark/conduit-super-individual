export function buildEvidenceState(run, events) {
  const reachedVerification = hasReached(run, events, ["verifying", "pr_drafting", "ready_for_pr", "failed"]);
  const reachedDiff = hasReached(run, events, ["editing", "verifying", "pr_drafting", "ready_for_pr", "failed"]);
  const reachedPrDraft = hasReached(run, events, ["pr_drafting", "ready_for_pr"]);
  const reachedClarify = hasReached(run, events, [
    "clarifying",
    "waiting_requirement_confirm",
    "planning",
    "waiting_plan_confirm",
    "editing",
    "verifying",
    "pr_drafting",
    "ready_for_pr",
    "failed",
  ]);

  return {
    verification: evidenceState({
      available: Boolean(run.verification),
      expected: reachedVerification,
      message: `Verification evidence missing for ${run.runId} at ${run.stage}`,
    }),
    diff: evidenceState({
      available: hasText(run.diff),
      expected: reachedDiff,
      message: `Diff evidence missing for ${run.runId} at ${run.stage}`,
    }),
    prDraft: evidenceState({
      available: hasText(run.prDraft),
      expected: reachedPrDraft,
      message: `PR draft evidence missing for ${run.runId} at ${run.stage}`,
    }),
    aiUsage: evidenceState({
      available: Boolean(run.aiUsage) && Array.isArray(run.aiCalls) && run.aiCalls.length > 0,
      expected: reachedClarify,
      message: `AI usage evidence missing for ${run.runId} at ${run.stage}`,
    }),
  };
}

export function requireRunEvents(run) {
  if (!Array.isArray(run.events)) {
    throw new Error(`Run ${run.runId} events evidence is required`);
  }
  return run.events;
}

function evidenceState({ available, expected, message }) {
  if (available) return { status: "available" };
  if (expected) return { status: "missing", message };
  return { status: "pending" };
}

function hasReached(run, events, stages) {
  if (stages.includes(run.stage)) return true;
  return events.some((event) => stages.includes(event.stage));
}

function hasText(value) {
  return typeof value === "string" && value.trim() !== "";
}
