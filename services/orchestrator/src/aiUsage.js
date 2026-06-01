const AI_USAGE_SUMMARY_KEYS = ["stages", "tokensIn", "tokensOut", "latencyMs", "costEstimate"];

export function parseAiCallLog(text) {
  if (typeof text !== "string") {
    throw new Error("ai-calls.jsonl content must be a string");
  }
  return text
    .split("\n")
    .filter(Boolean)
    .map((line, index) => parseAiCallLine(line, index));
}

export function summarizeAiCalls(calls) {
  return calls.reduce(
    (summary, call) => ({
      stages: summary.stages + 1,
      tokensIn: summary.tokensIn + requireFiniteNumber(call.tokens_in, "tokens_in"),
      tokensOut: summary.tokensOut + requireFiniteNumber(call.tokens_out, "tokens_out"),
      latencyMs: summary.latencyMs + requireFiniteNumber(call.latency_ms, "latency_ms"),
      costEstimate: summary.costEstimate + requireFiniteNumber(call.cost_estimate, "cost_estimate"),
    }),
    {
      stages: 0,
      tokensIn: 0,
      tokensOut: 0,
      latencyMs: 0,
      costEstimate: 0,
    },
  );
}

export function serializeAiCallLog(calls) {
  return calls.map((call) => JSON.stringify(call)).join("\n").concat("\n");
}

export function requireAiUsageMatchesSummary(aiUsage, expected, label) {
  for (const key of AI_USAGE_SUMMARY_KEYS) {
    if (typeof aiUsage[key] !== "number" || !Number.isFinite(aiUsage[key])) {
      throw new Error(`${label}.${key} must be a finite JSON number`);
    }
    if (aiUsage[key] !== expected[key]) {
      throw new Error(`${label}.${key} does not match ai-calls.jsonl`);
    }
  }
}

function parseAiCallLine(line, index) {
  try {
    return JSON.parse(line);
  } catch (error) {
    throw new Error(`Invalid ai-calls.jsonl line ${index + 1}: ${error.message}`);
  }
}

export function requireFiniteNumber(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`AI call ${name} must be a finite JSON number`);
  }
  return value;
}
