import {
  isClarificationEntryForQuestion,
  readClarificationHistory,
} from "./runClarificationRoutes.js";

export async function requireAnsweredPendingClarifications(run) {
  const pendingQuestions = Array.isArray(run?.pendingQuestions) ? run.pendingQuestions : [];
  if (!pendingQuestions.length) return;

  const history = await readClarificationHistory(run);
  const missingQuestions = pendingQuestions.filter(
    (question) => !history.entries.some((entry) =>
      isClarificationEntryForQuestion(entry, question),
    ),
  );
  if (!missingQuestions.length) return;

  const error = new Error(
    `Clarification answers required before resuming: ${missingQuestions
      .map((question) => question.id || "(missing question id)")
      .join(", ")}`,
  );
  error.statusCode = 400;
  throw error;
}
