import { useState } from "react";
import {
  confirmRun as confirmDeliveryRun,
  continueRun as continueDeliveryRun,
  createRun,
  loadClarificationHistory,
  loadSubmission,
  resumeFromStage as resumeDeliveryRun,
  retryRun as retryDeliveryRun,
  submitPr as submitDraftPr,
} from "./api.js";

export function useConsoleController() {
  const consoleState = useConsoleState();
  const actions = createConsoleActions(consoleState);

  return { actions, consoleState };
}

function useConsoleState() {
  const [input, setInput] = useState("");
  const [run, setRun] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [prRefs, setPrRefs] = useState({ base: "", head: "" });
  const [submission, setSubmission] = useState(null);
  return {
    error,
    input,
    loading,
    prRefs,
    run,
    setError,
    setInput,
    setLoading,
    setPrRefs,
    setRun,
    setSubmission,
    submission,
  };
}

export function createConsoleActions(consoleState) {
  const { input, prRefs, run } = consoleState;

  async function startRun() {
    await executeRunRequest(consoleState, () => createRun(input));
  }

  async function retryRun() {
    const activeRun = requireActiveRun(run, "retry");
    await executeRunRequest(consoleState, () => retryDeliveryRun(activeRun.runId, input));
  }

  async function resumeRun(stage) {
    const activeRun = requireActiveRun(run, "resume");
    await executeRunRequest(consoleState, () =>
      resumeDeliveryRun(activeRun.runId, { stage, revisedInput: input }),
    );
  }

  async function confirmRun(target) {
    await executeRunAction(consoleState, "confirm", async (activeRun) => {
      consoleState.setRun(await confirmDeliveryRun(activeRun.runId, target));
    });
  }

  async function submitPr() {
    consoleState.setLoading(true);
    await executeRunAction(consoleState, "submit PR", async (activeRun) => {
      consoleState.setRun(await submitDraftPr(activeRun.runId, prRefs));
    });
    consoleState.setLoading(false);
  }

  async function continueRun() {
    const activeRun = requireActiveRun(run, "continue");
    await executeRunRequest(consoleState, () => continueDeliveryRun(activeRun.runId));
  }

  async function refreshClarificationHistory() {
    const activeRun = requireActiveRun(consoleState.run, "refresh clarification history");
    const history = await loadClarificationHistory(activeRun.runId);
    consoleState.setRun({
      ...activeRun,
      clarificationHistory: history.entries,
      pendingQuestions: (activeRun.pendingQuestions || []).filter(
        (question) => !history.entries.some((entry) =>
          isClarificationEntryForQuestion(entry, question),
        ),
      ),
    });
  }

  return {
    confirm: confirmRun,
    continueRun,
    refreshClarificationHistory,
    resume: resumeRun,
    retry: retryRun,
    start: startRun,
    submitPr,
  };
}

async function executeRunRequest(consoleState, requestRun) {
  consoleState.setLoading(true);
  consoleState.setError("");
  consoleState.setSubmission(null);
  try {
    await setRunWithSubmission(consoleState, await requestRun());
  } catch (runError) {
    if (runError.run) await setRunWithSubmission(consoleState, runError.run);
    consoleState.setError(runError.message);
  } finally {
    consoleState.setLoading(false);
  }
}

async function setRunWithSubmission(consoleState, nextRun) {
  const history = await loadClarificationHistory(nextRun.runId);
  consoleState.setRun({ ...nextRun, clarificationHistory: history.entries });
  consoleState.setSubmission(await loadSubmission(nextRun.runId));
}

async function executeRunAction(consoleState, actionName, action) {
  consoleState.setError("");
  try {
    await action(requireActiveRun(consoleState.run, actionName));
  } catch (actionError) {
    consoleState.setError(actionError.message);
  }
}

function requireActiveRun(run, actionName) {
  if (!run) {
    throw new Error(`Cannot ${actionName} without an active run`);
  }
  return run;
}

function isClarificationEntryForQuestion(entry, question) {
  if (!entry || !question || entry.questionId !== question.id) return false;
  const entryQuestion = typeof entry.question === "string" ? entry.question.trim() : "";
  const currentQuestion = String(question.text ?? question.question ?? "").trim();
  if (entryQuestion && currentQuestion) return entryQuestion === currentQuestion;
  if (currentQuestion) return false;
  return entryQuestion === currentQuestion;
}
