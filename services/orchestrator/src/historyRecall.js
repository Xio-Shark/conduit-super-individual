import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  embed,
  cosineSimilarity,
  readEmbeddingsIndex,
} from "../../index/src/embeddingIndex.js";

const DEFAULT_LIMIT = 3;
const MIN_SCORE = 0.12;
const MIN_SEMANTIC_SCORE = 0.18;
const NGRAM_SIZE = 2;

export async function recallHistory({ input, projectRoot, runId, limit = DEFAULT_LIMIT }) {
  const reportsDir = path.join(projectRoot, "docs/reports/runs");
  if (!existsSync(reportsDir)) {
    return {
      status: "missing_history",
      matches: [],
      invalidRuns: [{ reason: "reports directory missing", path: reportsDir }],
    };
  }

  const runDirs = await readdir(reportsDir, { withFileTypes: true });
  const candidates = await Promise.all(
    runDirs
      .filter((entry) => entry.isDirectory() && entry.name !== runId)
      .map((entry) => loadCandidate(reportsDir, entry.name)),
  );
  const queryTokens = tokenize(input);
  const tokenScored = candidates
    .filter((candidate) => candidate.match)
    .map(({ match }) => ({
      ...match,
      score: scoreTokens(queryTokens, match.tokens),
      matchType: "skill_id",
      similarityScore: null,
    }))
    .filter((match) => match.score >= MIN_SCORE);

  const semanticScored = await semanticRecall({ input, projectRoot, runId, limit });

  const matches = mergeRecallResults(tokenScored, semanticScored, limit);
  const skipped = candidates
    .filter((candidate) => candidate.invalid)
    .map((candidate) => candidate.invalid);

  return {
    status: recallStatus(candidates, skipped),
    matches,
    skipped,
    invalidRuns: skipped,
  };
}

async function semanticRecall({ input, projectRoot, runId, limit }) {
  const records = await readEmbeddingsIndex(projectRoot);
  if (records.length === 0) return [];
  const queryVector = embed(input);
  return records
    .filter((rec) => rec.runId !== runId)
    .map((rec) => {
      const sim = cosineSimilarity(queryVector, rec.vector);
      return {
        runId: rec.runId,
        goal: rec.goal,
        skillId: rec.skill_id ?? rec.skillId,
        sourceInput: rec.text,
        summary: rec.goal,
        targetFiles: [],
        score: Number(sim.toFixed(3)),
        similarityScore: Number(sim.toFixed(3)),
        matchType: "semantic",
      };
    })
    .filter((entry) => entry.score >= MIN_SEMANTIC_SCORE)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

function mergeRecallResults(tokenScored, semanticScored, limit) {
  const byRunId = new Map();
  for (const match of tokenScored) {
    byRunId.set(match.runId, { ...match });
  }
  for (const match of semanticScored) {
    const existing = byRunId.get(match.runId);
    if (existing) {
      existing.matchType = "both";
      existing.similarityScore = match.similarityScore;
    } else {
      byRunId.set(match.runId, { ...match });
    }
  }
  return Array.from(byRunId.values())
    .sort((a, b) => matchRank(b) - matchRank(a))
    .slice(0, limit)
    .map(({ tokens, ...rest }) => rest);
}

function matchRank(match) {
  const base = match.score ?? 0;
  if (match.matchType === "both") return base + 1;
  return base;
}

function recallStatus(candidates, skipped) {
  if (!candidates.length) return "empty_history";
  if (skipped.length) return "degraded";
  return "ready";
}

async function loadCandidate(reportsDir, name) {
  const runDir = path.join(reportsDir, name);
  try {
    const requirement = await readMarkdownJson(path.join(runDir, "requirement.md"));
    const plan = await readMarkdownJson(path.join(runDir, "plan.md"));
    const acceptance = requireStringArray(requirement.acceptance, "requirement.acceptance", name);
    const targetFiles = requireStringArray(plan.target_files, "plan.target_files", name);
    const sourceInput = requireString(requirement.source_input, "requirement.source_input", name);
    const goal = requireString(requirement.goal, "requirement.goal", name);
    const summary = requireString(plan.summary, "plan.summary", name);
    const skillId = requireString(plan.skill_id, "plan.skill_id", name);
    const tokens = tokenize([
      sourceInput,
      goal,
      ...acceptance,
      summary,
      skillId,
    ].join(" "));
    return {
      match: {
        runId: name,
        goal,
        sourceInput,
        skillId,
        summary,
        targetFiles,
        tokens,
      },
    };
  } catch (error) {
    return { invalid: { runId: name, reason: error.message } };
  }
}

function requireString(value, field, runId) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Archived run ${runId} missing ${field}`);
  }
  return value.trim();
}

function requireStringArray(value, field, runId) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new Error(`Archived run ${runId} missing ${field}`);
  }
  return value.map((item) => item.trim());
}

async function readMarkdownJson(filePath) {
  const text = await readFile(filePath, "utf8");
  const match = text.match(/```json\n([\s\S]*?)\n```/);
  if (!match) throw new Error(`Missing JSON block in ${filePath}`);
  return JSON.parse(match[1]);
}

function tokenize(text) {
  const normalized = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  if (normalized.length <= NGRAM_SIZE) return new Set(normalized ? [normalized] : []);
  const tokens = [];
  for (let index = 0; index <= normalized.length - NGRAM_SIZE; index += 1) {
    tokens.push(normalized.slice(index, index + NGRAM_SIZE));
  }
  return new Set(tokens);
}

function scoreTokens(queryTokens, candidateTokens) {
  if (!queryTokens.size || !candidateTokens.size) return 0;
  let overlap = 0;
  for (const token of queryTokens) {
    if (candidateTokens.has(token)) overlap += 1;
  }
  return Number((overlap / queryTokens.size).toFixed(3));
}
