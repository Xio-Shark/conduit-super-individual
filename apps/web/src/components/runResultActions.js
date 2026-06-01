export function buildRunResultActions(actions) {
  return {
    confirm: actions.confirm,
    continueRun: actions.continueRun,
    refreshClarificationHistory: actions.refreshClarificationHistory,
    resume: actions.resume,
    retry: actions.retry,
    submitPr: actions.submitPr,
  };
}

export function createResumeFromEditHandler(actions) {
  return () => actions.resume("editing");
}

export function createResumeClarificationHandler(actions) {
  return () => actions.resume("clarifying");
}

export function isClarificationAwaitingAnswer(run) {
  return run?.status === "paused" && run?.stage === "clarifying_awaiting_answer";
}

export function canContinueAfterConfirm(run) {
  return run?.status === "paused" && !isClarificationAwaitingAnswer(run);
}

export function canResumeClarification(run) {
  return (
    isClarificationAwaitingAnswer(run)
    && (run.pendingQuestions || []).length === 0
    && (run.clarificationHistory || []).length > 0
  );
}
