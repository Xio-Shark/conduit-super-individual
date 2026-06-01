import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export async function makeRunDir(runId, root) {
  const projectRoot = root || await mkdtempProjectRoot("super-individual-api-");
  const runDir = path.join(projectRoot, "docs/reports/runs", runId);
  await mkdir(runDir, { recursive: true });
  return runDir;
}

export function successfulRun({
  evidenceDir,
  input,
  prDraft = "# PR\n",
  requirementCard,
  runId,
}) {
  return {
    runId,
    stage: "ready_for_pr",
    status: "passed",
    evidenceDir,
    requirementCard: requirementCard || {
      goal: "展示阅读量",
      source_input: input,
    },
    plan: {
      summary: "在 Conduit 文章列表卡片增加确定性阅读量展示。",
      skill_id: "article-list-display-field",
      target_files: ["frontend/src/components/ArticlesPreview/ArticlesPreview.jsx"],
    },
    edit: {
      changedFiles: ["frontend/src/components/ArticlesPreview/ArticlesPreview.jsx"],
      summary: "Article list cards now show read count.",
    },
    verification: { status: "passed", checks: [{ command: "npm test", exitCode: 0 }] },
    diff: "diff --git a/file b/file\n",
    prDraft,
    aiCalls: [
      {
        stage: "clarify",
        model: "rules-first-p0",
        prompt_version: "rules-first-p0",
        input_summary: input,
        output_summary: "展示阅读量",
        tokens_in: 0,
        tokens_out: 0,
        latency_ms: 0,
        cost_estimate: 0,
        status: "reviewed",
      },
    ],
    aiUsage: {
      stages: 1,
      tokensIn: 0,
      tokensOut: 0,
      latencyMs: 0,
      costEstimate: 0,
    },
    events: [],
  };
}

export function writeMarkdownJson(filePath, value) {
  return writeFile(
    filePath,
    `# Data\n\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`,
  );
}

export function writeAiCalls(filePath, calls) {
  return writeFile(
    filePath,
    calls.map((call) => JSON.stringify(call)).join("\n").concat("\n"),
  );
}

export function mkdtempProjectRoot(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

export function postJson(url, body) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
