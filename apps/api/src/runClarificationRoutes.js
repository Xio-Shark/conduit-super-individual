import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import { findRun, sendRunNotFound } from "./runRouteHelpers.js";

export class ClarificationAnswerError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
    this.name = "ClarificationAnswerError";
  }
}

export function registerRunClarificationRoutes(app, { runStore }) {
  app.post("/api/runs/:id/answer-clarification", async (req, res, next) => {
    const run = await findRun(req.params.id, runStore);
    if (!run) return sendRunNotFound(res);
    try {
      const result = await recordClarificationAnswer({ run, body: req.body });
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/runs/:id/clarification-history", async (req, res, next) => {
    const run = await findRun(req.params.id, runStore);
    if (!run) return sendRunNotFound(res);
    try {
      res.json(await readClarificationHistory(run));
    } catch (error) {
      next(error);
    }
  });
}

export async function recordClarificationAnswer({ run, body }) {
  if (!run?.evidenceDir) {
    throw new ClarificationAnswerError("run evidenceDir is required", 500);
  }
  if (!body || typeof body !== "object") {
    throw new ClarificationAnswerError("request body must be an object");
  }
  const questionId = requireNonEmptyString(body.questionId, "questionId");
  const answer = requireNonEmptyString(body.answer, "answer");
  const question = requirePendingQuestion(run, questionId);
  requireSubmittedQuestionMatches(body, question);
  await requireQuestionNotAnswered(run, question);

  const entry = {
    runId: run.runId,
    questionId,
    question: pendingQuestionText(question),
    answer,
    answeredAt: new Date().toISOString(),
  };
  await appendFile(
    path.join(run.evidenceDir, "clarification-history.jsonl"),
    `${JSON.stringify(entry)}\n`,
    "utf8",
  );
  return entry;
}

export async function readClarificationHistory(run) {
  if (!run?.evidenceDir) {
    throw new ClarificationAnswerError("run evidenceDir is required", 500);
  }
  const filePath = path.join(run.evidenceDir, "clarification-history.jsonl");
  let content;
  try {
    content = await readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return { runId: run.runId, entries: [] };
    }
    throw error;
  }
  const entries = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  return { runId: run.runId, entries };
}

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ClarificationAnswerError(`${label} is required`);
  }
  return value.trim();
}

function requireSubmittedQuestionMatches(body, question) {
  if (!Object.hasOwn(body, "question")) return;
  const submittedQuestion = requireNonEmptyString(body.question, "question");
  const currentQuestion = pendingQuestionText(question);
  if (submittedQuestion !== currentQuestion) {
    throw new ClarificationAnswerError(`clarification question changed: ${question.id}`);
  }
}

function requirePendingQuestion(run, questionId) {
  const pendingQuestions = Array.isArray(run.pendingQuestions) ? run.pendingQuestions : [];
  if (!pendingQuestions.length) {
    throw new ClarificationAnswerError("run has no pending clarification questions");
  }
  const found = pendingQuestions.find((question) => question?.id === questionId);
  if (!found) {
    throw new ClarificationAnswerError(`unknown clarification questionId: ${questionId}`);
  }
  return found;
}

async function requireQuestionNotAnswered(run, question) {
  const history = await readClarificationHistory(run);
  const alreadyAnswered = history.entries.some((entry) =>
    isClarificationEntryForQuestion(entry, question),
  );
  if (alreadyAnswered) {
    throw new ClarificationAnswerError(`clarification question already answered: ${question.id}`);
  }
}

export function isClarificationEntryForQuestion(entry, question) {
  if (!entry || !question || entry.questionId !== question.id) return false;
  const entryQuestion = typeof entry.question === "string" ? entry.question.trim() : "";
  const currentQuestion = pendingQuestionText(question);
  if (entryQuestion && currentQuestion) return entryQuestion === currentQuestion;
  if (currentQuestion) return false;
  return entryQuestion === currentQuestion;
}

function pendingQuestionText(question) {
  return String(question?.text ?? question?.question ?? "").trim();
}
