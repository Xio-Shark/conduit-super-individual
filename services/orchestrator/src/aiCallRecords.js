import { requireFiniteNumber } from "./aiUsage.js";

export function buildAiCallRecords({ aiArtifacts, plan, runId }) {
  const sourceCalls = [...aiArtifacts.aiCalls];
  if (plan?.ai_call) {
    sourceCalls.push(plan.ai_call);
  }
  const aiCalls = normalizeAiCalls(sourceCalls);
  return aiCalls.map((call) => ({
    run_id: runId,
    stage: call.stage,
    model: call.model,
    prompt_version: call.prompt_version,
    skill_id: plan.skill_id,
    input_summary: call.input_summary,
    output_summary: call.output_summary,
    tokens_in: call.tokens_in,
    tokens_out: call.tokens_out,
    latency_ms: call.latency_ms,
    cost_estimate: call.cost_estimate,
    status: call.status,
  }));
}

function normalizeAiCalls(calls) {
  return calls.map((call) => ({
    stage: requireNonEmptyString(call.stage, "stage"),
    model: requireNonEmptyString(call.model, "model"),
    prompt_version: requireNonEmptyString(call.prompt_version, "prompt_version"),
    input_summary: requireNonEmptyString(call.input_summary, "input_summary"),
    output_summary: requireNonEmptyString(call.output_summary, "output_summary"),
    tokens_in: requireFiniteNumber(call.tokens_in, "tokens_in"),
    tokens_out: requireFiniteNumber(call.tokens_out, "tokens_out"),
    latency_ms: requireFiniteNumber(call.latency_ms, "latency_ms"),
    cost_estimate: requireFiniteNumber(call.cost_estimate, "cost_estimate"),
    status: call.status,
  }));
}

function requireNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`AI call ${name} is required`);
  }
  return value;
}
