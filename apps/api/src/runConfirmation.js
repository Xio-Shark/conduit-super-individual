export class RunConfirmationError extends Error {}

const CONFIRMATION_TARGETS = new Set(["requirement", "plan", "pr"]);
const CONFIRMATION_DECISIONS = new Set(["approved", "rejected"]);

export async function confirmRun({ requestBody, run, runStore }) {
  const confirmation = buildConfirmation(requestBody);
  const nextRun = {
    ...run,
    confirmations: [...run.confirmations, confirmation],
    events: [
      ...run.events,
      {
        at: confirmation.at,
        stage: "human_confirm",
        message: `${confirmation.target} ${confirmation.decision}`,
      },
    ],
  };
  await runStore.persistMetadata(nextRun);
  runStore.set(nextRun);
  return nextRun;
}

function buildConfirmation(requestBody) {
  const target = requestBody?.target;
  const decision = requestBody?.decision;
  if (!CONFIRMATION_TARGETS.has(target)) {
    throw new RunConfirmationError("Invalid confirmation target");
  }
  if (!CONFIRMATION_DECISIONS.has(decision)) {
    throw new RunConfirmationError("Invalid confirmation decision");
  }
  return {
    target,
    decision,
    note: optionalNote(requestBody?.note),
    at: new Date().toISOString(),
  };
}

function optionalNote(note) {
  if (note === undefined || note === null) return null;
  if (typeof note !== "string") {
    throw new RunConfirmationError("Confirmation note must be a string");
  }
  return note.trim() || null;
}
