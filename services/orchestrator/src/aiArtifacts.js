import { buildRequirement } from "../../agents/src/requirementAgent.js";
import {
  clarifyWithLlm,
  proposeClarifications,
  refineWithAnswers,
} from "../../agents/src/clarifyWithLlm.js";
import { createLlmClient } from "./llmClient.js";

const RULES_MODE = "rules";
const LLM_MODE = "llm";
const RULES_PROMPT_VERSION = "rules-first-p0";

export class PendingClarificationError extends Error {
  constructor(pendingQuestions, aiCalls) {
    super("Clarification awaiting PM answer");
    this.name = "PendingClarificationError";
    this.pendingQuestions = pendingQuestions;
    this.aiCalls = aiCalls;
  }
}

export async function buildAiArtifacts({ env = process.env, input, modelClient, clarificationHistory = [] }) {
  const mode = requireAiMode(env);

  if (mode === RULES_MODE) {
    return buildRulesArtifacts(input);
  }

  if (mode === LLM_MODE) {
    return buildLlmArtifacts({
      env,
      input,
      modelClient: modelClient || createLlmClient(env),
      clarificationHistory,
    });
  }

  throw new Error(`Unsupported AI_MODE: ${mode}. Use "rules" or "llm".`);
}

function requireAiMode(env) {
  if (typeof env.AI_MODE !== "string" || env.AI_MODE.trim() === "") {
    throw new Error('AI_MODE is required. Use "rules" for local P0 or "llm" for LLM clarify.');
  }
  return env.AI_MODE.trim().toLowerCase();
}

function buildRulesArtifacts(input) {
  const requirementCard = buildRequirement(input);
  return {
    mode: RULES_MODE,
    requirementCard,
    aiCalls: [
      {
        stage: "clarify",
        model: "rules-first-p0",
        prompt_version: RULES_PROMPT_VERSION,
        input_summary: truncate(requirementCard.source_input, 240),
        output_summary: truncate(requirementCard.goal, 240),
        tokens_in: 0,
        tokens_out: 0,
        latency_ms: 0,
        cost_estimate: 0,
        status: "reviewed",
      },
    ],
  };
}

async function buildLlmArtifacts({ env, input, modelClient, clarificationHistory }) {
  const useRefine = Array.isArray(clarificationHistory) && clarificationHistory.length > 0;
  const turn = useRefine
    ? await refineWithAnswers({ input, modelClient, history: clarificationHistory })
    : await proposeClarifications({ input, modelClient });

  if (turn.decision === "clarify") {
    throw new PendingClarificationError(turn.pendingQuestions, [turn.aiCall]);
  }
  return {
    mode: LLM_MODE,
    requirementCard: turn.requirementCard,
    aiCalls: [turn.aiCall],
  };
}

function truncate(text, max) {
  const value = String(text);
  return value.length <= max ? value : `${value.slice(0, max)}...`;
}

export { clarifyWithLlm };
