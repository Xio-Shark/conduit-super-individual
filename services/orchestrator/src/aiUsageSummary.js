import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  parseAiCallLog,
  requireAiUsageMatchesSummary,
  summarizeAiCalls,
} from "./aiUsage.js";

export async function summarizeCrossRunAiUsage(projectRoot) {
  const runsDir = path.join(projectRoot, "docs/reports/runs");
  if (!existsSync(runsDir)) {
    return emptySummary([
      { reason: "runs directory missing", path: runsDir },
    ]);
  }

  const runIds = await readdir(runsDir, { withFileTypes: true });
  const perRun = [];
  const skipped = [];
  let totals = emptyTotals();

  for (const entry of runIds) {
    if (!entry.isDirectory()) continue;
    const result = await readRunAiUsage(path.join(runsDir, entry.name), entry.name);
    if (result.skipped) {
      skipped.push(result.skipped);
      continue;
    }
    perRun.push(result.usage);
    totals = mergeTotals(totals, result.usage.summary);
  }

  perRun.sort((left, right) => right.summary.tokensIn - left.summary.tokensIn);

  if (perRun.length === 0) {
    return emptySummary([
      ...skipped,
      { reason: "no passed runs with valid ai-calls.jsonl" },
    ]);
  }

  return {
    status: skipped.length ? "degraded" : "ready",
    runCount: perRun.length,
    totals,
    runs: perRun,
    skipped,
    invalidRuns: skipped,
  };
}

async function readRunAiUsage(runDir, runId) {
  try {
    return { usage: await requirePassedRunAiUsage(runDir, runId) };
  } catch (error) {
    return {
      skipped: {
        runId,
        reason: error.message,
      },
    };
  }
}

async function requirePassedRunAiUsage(runDir, runId) {
  const runSummary = await readRunSummary(runDir);
  if (runSummary.status !== "passed") {
    throw new Error(`run-summary.json status is ${JSON.stringify(runSummary.status)}`);
  }

  const aiCallsPath = path.join(runDir, "ai-calls.jsonl");
  if (!existsSync(aiCallsPath)) {
    throw new Error("missing ai-calls.jsonl");
  }

  const text = await readFile(aiCallsPath, "utf8");
  if (!text.trim()) {
    throw new Error("ai-calls.jsonl is empty");
  }

  const calls = parseAiCallLog(text);
  const summary = summarizeAiCalls(calls);
  requireAiUsageMatchesCalls(runSummary.aiUsage, summary);
  const llmCalls = calls.filter((call) => call.model && call.model !== "rules-first-p0");

  return {
    runId,
    callCount: calls.length,
    llmCallCount: llmCalls.length,
    primaryModel: pickPrimaryModel(llmCalls, calls),
    summary,
  };
}

function requireAiUsageMatchesCalls(aiUsage, expected) {
  if (!aiUsage || typeof aiUsage !== "object" || Array.isArray(aiUsage)) {
    throw new Error("missing run-summary.json aiUsage");
  }
  requireAiUsageMatchesSummary(aiUsage, expected, "run-summary.json aiUsage");
}

async function readRunSummary(runDir) {
  const summaryPath = path.join(runDir, "run-summary.json");
  if (!existsSync(summaryPath)) {
    throw new Error("missing run-summary.json");
  }
  return JSON.parse(await readFile(summaryPath, "utf8"));
}

function pickPrimaryModel(llmCalls, calls) {
  const pool = llmCalls.length > 0 ? llmCalls : calls;
  return pool[0]?.model ?? "unknown";
}

function mergeTotals(left, right) {
  return {
    stages: left.stages + right.stages,
    tokensIn: left.tokensIn + right.tokensIn,
    tokensOut: left.tokensOut + right.tokensOut,
    latencyMs: left.latencyMs + right.latencyMs,
    costEstimate: left.costEstimate + right.costEstimate,
  };
}

function emptyTotals() {
  return {
    stages: 0,
    tokensIn: 0,
    tokensOut: 0,
    latencyMs: 0,
    costEstimate: 0,
  };
}

function emptySummary(skipped = []) {
  return {
    status: skipped.length ? "missing" : "ready",
    runCount: 0,
    totals: emptyTotals(),
    runs: [],
    skipped,
    invalidRuns: skipped,
  };
}
