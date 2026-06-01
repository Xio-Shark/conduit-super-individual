import { validateRequirementCard } from "./requirementCard.js";

export const CLARIFY_PROMPT_VERSION = "2.0.0-llm";

const MULTITURN_SYSTEM_PROMPT = `You are the Requirement Agent for the Conduit super-individual delivery system.

This is a multi-turn clarification dialog. The user message may contain (a) the original PM input and (b) any prior PM answers to clarification questions.

Return ONLY one JSON object (no markdown prose) with this exact shape:
{
  "decision": "finalize" | "clarify",
  "requirement_card": {
    "id": "REQ-...",
    "source_input": "<echo of PM input>",
    "goal": "<one sentence goal>",
    "scope": { "include": ["..."], "exclude": ["..."] },
    "assumptions": ["..."],
    "clarifications": ["..."],
    "acceptance": ["..."],
    "level": "L1" | "L2" | "L3"
  } | null,
  "pending_questions": [
    { "id": "Q1", "text": "Open question for PM" }
  ]
}

Rules:
- If PM input + prior answers are sufficient, decision="finalize", set requirement_card, leave pending_questions=[].
- If still ambiguous, decision="clarify", set pending_questions (non-empty open questions for PM), leave requirement_card=null.
- Each pending_question id and text must be unique non-empty strings.
- requirement_card.scope.include / scope.exclude / assumptions / clarifications / acceptance each have ≥1 non-empty string.
- For L1 list-display style tasks, never invent backend/database changes unless PM explicitly asks.
- LANGUAGE: when the PM input is primarily Chinese, write requirement_card.goal / scope / assumptions / clarifications / acceptance in Chinese to keep downstream keyword matching deterministic.
- For backwards compatibility: if the response is just the raw requirement card object (legacy shape), the caller will infer decision=finalize.`;

export async function proposeClarifications({ input, modelClient }) {
  return runClarifyTurn({ input, modelClient, history: [] });
}

export async function refineWithAnswers({ input, modelClient, history }) {
  if (!Array.isArray(history) || history.length === 0) {
    throw new Error("refineWithAnswers requires non-empty PM answer history");
  }
  for (const entry of history) {
    if (!entry || typeof entry !== "object") {
      throw new Error("history entries must be objects");
    }
    if (typeof entry.question !== "string" || !entry.question.trim()) {
      throw new Error("history.question must be a non-empty string");
    }
    if (typeof entry.answer !== "string" || !entry.answer.trim()) {
      throw new Error("history.answer must be a non-empty string");
    }
  }
  return runClarifyTurn({ input, modelClient, history });
}

export async function clarifyWithLlm({ input, modelClient }) {
  const turn = await runClarifyTurn({ input, modelClient, history: [] });
  if (turn.decision !== "finalize" || !turn.requirementCard) {
    throw new Error(
      "LLM clarify did not finalize a requirement card; use proposeClarifications/refineWithAnswers for multi-turn flow",
    );
  }
  return { requirementCard: turn.requirementCard, aiCall: turn.aiCall };
}

async function runClarifyTurn({ input, modelClient, history }) {
  if (!modelClient?.chat) {
    throw new Error("modelClient is required for LLM clarify");
  }
  const trimmed = input.trim();
  if (!trimmed) throw new Error("clarify input must be non-empty");
  const userMessage = buildUserMessage(trimmed, history);

  const response = await modelClient.chat({
    messages: [
      { role: "system", content: MULTITURN_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
  });

  const tokensIn = response.tokensIn;
  const tokensOut = response.tokensOut;
  if (tokensIn + tokensOut <= 0) {
    throw new Error("LLM clarify must report non-zero token usage");
  }

  const parsed = parseClarifyResponse(response.content, trimmed);
  return {
    decision: parsed.decision,
    requirementCard: parsed.requirementCard,
    pendingQuestions: parsed.pendingQuestions,
    aiCall: buildAiCall({
      modelClient,
      response,
      userMessage,
      parsed,
      isRefine: history.length > 0,
      tokensIn,
      tokensOut,
    }),
  };
}

function buildUserMessage(input, history) {
  if (history.length === 0) return input;
  const transcript = history
    .map((entry, idx) => `Q${idx + 1} (${entry.questionId ?? `Q${idx + 1}`}): ${entry.question}\nA${idx + 1}: ${entry.answer}`)
    .join("\n\n");
  return `Original PM input:\n${input}\n\nPrior clarifications:\n${transcript}\n\nBased on the above, decide finalize or ask new clarification questions.`;
}

function buildAiCall({ modelClient, response, userMessage, parsed, isRefine, tokensIn, tokensOut }) {
  return {
    stage: isRefine ? "clarify-refine" : "clarify",
    model: modelClient.model,
    prompt_version: CLARIFY_PROMPT_VERSION,
    input_summary: truncate(userMessage, 240),
    output_summary: truncate(buildOutputSummary(parsed), 240),
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    latency_ms: response.latencyMs,
    cost_estimate: response.costEstimate,
    status: "completed",
  };
}

function buildOutputSummary(parsed) {
  if (parsed.decision === "clarify") {
    return `decision=clarify; pending=${parsed.pendingQuestions.map((q) => q.id).join(",")}`;
  }
  return `decision=finalize; goal=${parsed.requirementCard.goal}; clarifications=${parsed.requirementCard.clarifications.join(" | ")}`;
}

function parseClarifyResponse(content, sourceInput) {
  const raw = extractJson(content);
  if (raw?.decision === "clarify") {
    return {
      decision: "clarify",
      pendingQuestions: validatePendingQuestions(raw.pending_questions ?? raw.pendingQuestions),
      requirementCard: null,
    };
  }
  if (raw?.decision === "finalize") {
    return {
      decision: "finalize",
      pendingQuestions: [],
      requirementCard: validateRequirementCard(
        normalizeCard(raw.requirement_card ?? raw.requirementCard, sourceInput),
      ),
    };
  }
  return {
    decision: "finalize",
    pendingQuestions: [],
    requirementCard: validateRequirementCard(normalizeCard(raw, sourceInput)),
  };
}

function validatePendingQuestions(questions) {
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error("clarify response with decision=clarify must include non-empty pending_questions");
  }
  const seen = new Set();
  return questions.map((q, idx) => {
    const id = String(q?.id ?? `Q${idx + 1}`).trim();
    const text = String(q?.text ?? q?.question ?? "").trim();
    if (!id) throw new Error("pending_question.id must be non-empty");
    if (!text) throw new Error("pending_question.text must be non-empty");
    if (seen.has(id)) throw new Error(`pending_question.id must be unique: ${id}`);
    seen.add(id);
    return { id, text };
  });
}

function normalizeCard(parsed, sourceInput) {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("LLM clarify response must include a requirement card");
  }
  return {
    id: parsed.id,
    source_input: parsed.source_input ?? sourceInput,
    goal: parsed.goal,
    scope: {
      include: parsed.scope?.include,
      exclude: parsed.scope?.exclude,
    },
    assumptions: parsed.assumptions,
    clarifications: parsed.clarifications,
    acceptance: parsed.acceptance,
    level: parsed.level,
  };
}

function extractJson(content) {
  const trimmed = String(content).trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(candidate);
}

function truncate(text, max) {
  const value = String(text);
  return value.length <= max ? value : `${value.slice(0, max)}...`;
}
