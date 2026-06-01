import { existsSync } from "node:fs";
import path from "node:path";
import { buildSandboxIndex } from "../../index/src/sandboxIndex.js";

export const PLAN_PROMPT_VERSION = "1.0.0-llm";

const SYSTEM_PROMPT = `You are the Planning Agent for the Conduit super-individual delivery system.

Inputs the user message contains:
- requirement_card (PM-confirmed goal, scope, level)
- sandbox_index (truncated list of file paths under sandbox-repo + top-level model fields)
- history_references (similar past run goals + skill_id + summaries)
- skill (the Skill the registry already matched — its id, intent, planSummary, validation)

Return ONLY one JSON object (no markdown prose) with this exact shape:
{
  "target_files": ["frontend/src/...", "backend/..."],
  "impacted_modules": ["frontend"|"backend"|...],
  "risks": ["..."],
  "reasoning": "<one-paragraph explanation>"
}

Rules:
- target_files MUST be real paths from sandbox_index (otherwise the run will fail fast).
- target_files MUST include all paths the Skill needs to touch (preserve skill.targetPaths if provided; for schema-driven Skills, include backend/models/<Model>.js + generated frontend paths).
- risks must list ≥1 concrete risk (e.g. cross-stack drift, missing lint adapter).
- reasoning must reference at least one history_reference if the array is non-empty.
- Output the JSON object only, no markdown fences.`;

export async function planWithLlm({ requirementCard, skill, historyRecall, repoPath, modelClient }) {
  if (!modelClient?.chat) {
    throw new Error("planWithLlm requires modelClient.chat");
  }
  if (!requirementCard || !skill) {
    throw new Error("planWithLlm requires requirementCard and skill");
  }
  const sandboxIndex = await buildSandboxIndex(repoPath);
  const sandboxSummary = summarizeSandbox(sandboxIndex);
  const userMessage = buildUserMessage({ requirementCard, skill, historyRecall, sandboxSummary });

  const response = await modelClient.chat({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
  });

  if (response.tokensIn + response.tokensOut <= 0) {
    throw new Error("planWithLlm: LLM must report non-zero token usage");
  }

  const parsed = parsePlanResponse(response.content);
  assertTargetsExist(parsed.target_files, repoPath);

  return {
    plan: {
      target_files: parsed.target_files,
      impacted_modules: parsed.impacted_modules,
      risks: parsed.risks,
      reasoning: parsed.reasoning,
    },
    aiCall: {
      stage: "plan",
      model: modelClient.model,
      prompt_version: PLAN_PROMPT_VERSION,
      input_summary: truncate(userMessage, 240),
      output_summary: truncate(parsed.reasoning, 240),
      tokens_in: response.tokensIn,
      tokens_out: response.tokensOut,
      latency_ms: response.latencyMs,
      cost_estimate: response.costEstimate,
      status: "completed",
    },
  };
}

function summarizeSandbox(sandboxIndex) {
  const allPaths = [
    ...sandboxIndex.modules.frontend.slice(0, 30),
    ...sandboxIndex.modules.backend.slice(0, 20),
  ];
  return allPaths.join("\n");
}

function buildUserMessage({ requirementCard, skill, historyRecall, sandboxSummary }) {
  const historyText = (historyRecall?.matches ?? [])
    .slice(0, 3)
    .map((m, idx) => `${idx + 1}. ${m.runId} (skill=${m.skillId}, score=${m.score}): ${m.summary}`)
    .join("\n") || "(none)";
  return [
    `requirement_card: ${JSON.stringify({
      id: requirementCard.id,
      goal: requirementCard.goal,
      level: requirementCard.level,
      scope: requirementCard.scope,
    })}`,
    `skill: ${JSON.stringify({
      id: skill.id,
      intent: skill.intent,
      planSummary: skill.planSummary,
      targetPaths: skill.targetPaths ?? null,
      schemaChange: skill.schemaChange ?? null,
    })}`,
    `history_references:\n${historyText}`,
    `sandbox_index (truncated):\n${sandboxSummary}`,
  ].join("\n\n");
}

function parsePlanResponse(content) {
  const trimmed = String(content).trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const parsed = JSON.parse(candidate);
  for (const key of ["target_files", "impacted_modules", "risks", "reasoning"]) {
    if (parsed[key] === undefined) {
      throw new Error(`planWithLlm: missing field ${key} in LLM response`);
    }
  }
  if (!Array.isArray(parsed.target_files) || parsed.target_files.length === 0) {
    throw new Error("planWithLlm: target_files must be a non-empty array");
  }
  if (!Array.isArray(parsed.impacted_modules) || parsed.impacted_modules.length === 0) {
    throw new Error("planWithLlm: impacted_modules must be a non-empty array");
  }
  if (!Array.isArray(parsed.risks) || parsed.risks.length === 0) {
    throw new Error("planWithLlm: risks must be a non-empty array");
  }
  if (typeof parsed.reasoning !== "string" || !parsed.reasoning.trim()) {
    throw new Error("planWithLlm: reasoning must be a non-empty string");
  }
  return parsed;
}

function assertTargetsExist(targetFiles, repoPath) {
  for (const file of targetFiles) {
    if (typeof file !== "string" || !file.trim()) {
      throw new Error(`planWithLlm: target_file must be a non-empty string, got ${JSON.stringify(file)}`);
    }
    if (file.startsWith("frontend/src/types/") && file.endsWith(".ts")) continue;
    if (file.startsWith("frontend/src/services/") && file.endsWith(".js")) continue;
    if (file.startsWith("frontend/src/__mocks__/") && file.endsWith(".js")) continue;
    const abs = path.join(repoPath, file);
    if (!existsSync(abs)) {
      throw new Error(`planWithLlm: target_file does not exist in sandbox: ${file}`);
    }
  }
}

function truncate(text, max) {
  const value = String(text);
  return value.length <= max ? value : `${value.slice(0, max)}...`;
}
