import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const VECTOR_DIM = 256;
const ASCII_WORD_PATTERN = /[a-z0-9]+/g;
const CHINESE_RANGE = /[一-龥]/;

export function tokenize(text) {
  const lower = String(text ?? "").toLowerCase();
  const tokens = [];
  for (const match of lower.matchAll(ASCII_WORD_PATTERN)) {
    if (match[0].length >= 2) tokens.push(match[0]);
  }
  for (let i = 0; i < lower.length - 1; i++) {
    if (CHINESE_RANGE.test(lower[i]) && CHINESE_RANGE.test(lower[i + 1])) {
      tokens.push(lower.slice(i, i + 2));
    }
  }
  return tokens;
}

export function embed(text) {
  const tokens = tokenize(text);
  if (tokens.length === 0) {
    return new Float32Array(VECTOR_DIM);
  }
  const vector = new Float32Array(VECTOR_DIM);
  for (const token of tokens) {
    const idx = hashToken(token);
    vector[idx] += 1;
  }
  return l2Normalize(vector);
}

export function cosineSimilarity(a, b) {
  if (a.length !== b.length) {
    throw new Error(`embeddingIndex: vector length mismatch (${a.length} vs ${b.length})`);
  }
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

export async function indexPassedRuns(projectRoot) {
  const runsDir = path.join(projectRoot, "docs/reports/runs");
  if (!existsSync(runsDir)) return [];
  const entries = await readdir(runsDir, { withFileTypes: true });
  const records = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const runDir = path.join(runsDir, entry.name);
    const record = await maybeBuildRunRecord(runDir, entry.name);
    if (record) records.push(record);
  }
  return records;
}

export async function writeEmbeddingsIndex(projectRoot, records) {
  const indexDir = path.join(projectRoot, "docs/reports/run-index");
  await mkdir(indexDir, { recursive: true });
  const filePath = path.join(indexDir, "embeddings.jsonl");
  const lines = records.map((rec) => JSON.stringify({
    runId: rec.runId,
    text: rec.text,
    skill_id: rec.skillId,
    goal: rec.goal,
    vector: Array.from(rec.vector),
  }));
  await writeFile(filePath, `${lines.join("\n")}\n`, "utf8");
  return filePath;
}

export async function readEmbeddingsIndex(projectRoot) {
  const filePath = path.join(projectRoot, "docs/reports/run-index/embeddings.jsonl");
  if (!existsSync(filePath)) return [];
  const content = await readFile(filePath, "utf8");
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parsed = JSON.parse(line);
      return {
        ...parsed,
        vector: Float32Array.from(parsed.vector),
      };
    });
}

export function recallTopK(queryVector, records, k = 3) {
  return records
    .map((rec) => ({
      runId: rec.runId,
      skillId: rec.skill_id ?? rec.skillId,
      goal: rec.goal,
      similarity: cosineSimilarity(queryVector, rec.vector),
    }))
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, k);
}

async function maybeBuildRunRecord(runDir, runId) {
  const summaryPath = path.join(runDir, "run-summary.json");
  if (!existsSync(summaryPath)) return null;
  let summary;
  try {
    summary = JSON.parse(await readFile(summaryPath, "utf8"));
  } catch {
    return null;
  }
  if (summary.status !== "passed") return null;
  const requirementPath = path.join(runDir, "requirement.md");
  if (!existsSync(requirementPath)) return null;
  const requirementCard = await readRequirementCard(requirementPath);
  if (!requirementCard) return null;
  const text = [
    requirementCard.source_input ?? "",
    requirementCard.goal ?? "",
    ...(requirementCard.clarifications ?? []),
  ].join("\n");
  return {
    runId,
    text,
    skillId: await extractSkillId(summary, runDir),
    goal: requirementCard.goal ?? "",
    vector: embed(text),
  };
}

async function readRequirementCard(filePath) {
  const content = await readFile(filePath, "utf8");
  const match = content.match(/```json\s*([\s\S]*?)```/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

async function extractSkillId(summary, runDir) {
  if (summary.skillId) return summary.skillId;
  const planPath = path.join(runDir, "plan.md");
  if (!existsSync(planPath)) return null;
  try {
    const text = await readFile(planPath, "utf8");
    const match = text.match(/"skill_id":\s*"([^"]+)"/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function hashToken(token) {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash % VECTOR_DIM;
}

function l2Normalize(vector) {
  let sumSq = 0;
  for (let i = 0; i < vector.length; i++) sumSq += vector[i] * vector[i];
  const norm = Math.sqrt(sumSq) || 1;
  for (let i = 0; i < vector.length; i++) vector[i] /= norm;
  return vector;
}
