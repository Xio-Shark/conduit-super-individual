import path from "node:path";
import { existsSync } from "node:fs";
import { RUN_STAGES } from "../../../libs/types/src/stages.js";
import { findSkill } from "../../skills/src/registry.js";
import { ConduitSandbox } from "../../sandbox/src/conduitSandbox.js";
import { createEvidenceWriter } from "./evidence.js";
import { parseAiCallLog } from "./aiUsage.js";
import { readJson, readMarkdownJson, readOptionalJson, readText, requireRequirementInput } from "./deliveryIo.js";

export async function createDeliveryContext(options) {
  const input = requireRequirementInput(options.input);
  const projectRoot = requireProjectRoot(options.projectRoot);
  const runId = options.runId || `run-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const repoPath = options.repoPath || process.env.SANDBOX_REPO_PATH || path.join(projectRoot, "sandbox-repo");
  const evidence = options.evidence || (await createEvidenceWriter({ runId, projectRoot }));
  return {
    checkpoints: {},
    evidence,
    events: [],
    input,
    projectRoot,
    repoPath,
    runId,
    sandbox: new ConduitSandbox(repoPath),
  };
}

export async function loadResumeContext({ runId, projectRoot, revisedInput, repoPath }) {
  const resolvedProjectRoot = requireProjectRoot(projectRoot);
  const runDir = path.join(resolvedProjectRoot, "docs/reports/runs", runId);
  if (!existsSync(runDir)) {
    throw new Error(`Run evidence not found: ${runId}`);
  }

  const metadata = await readOptionalJson(path.join(runDir, "metadata.json"));
  const checkpoints = await readCheckpoints(runDir, metadata);
  const requirementCard = await readMarkdownJson(path.join(runDir, "requirement.md"));
  const resolvedRepoPath = repoPath || process.env.SANDBOX_REPO_PATH || path.join(resolvedProjectRoot, "sandbox-repo");

  return {
    checkpoints,
    evidence: await createEvidenceWriter({ runId, projectRoot: resolvedProjectRoot }),
    events: Array.isArray(metadata?.events) ? [...metadata.events] : [],
    input: resolveResumeInput(revisedInput, requirementCard),
    projectRoot: resolvedProjectRoot,
    repoPath: resolvedRepoPath,
    runId,
    sandbox: new ConduitSandbox(resolvedRepoPath),
  };
}

export async function loadUpstreamState(context, startStage) {
  const runDir = context.evidence.runDir;
  const requirementCard = await readMarkdownJson(path.join(runDir, "requirement.md"));
  const historyRecall = await readJson(path.join(runDir, "history-recall.json"));
  const origin = await context.sandbox.assertConduitOrigin();
  const aiArtifacts = await loadAiArtifacts(context);
  const state = { aiArtifacts, historyRecall, origin, requirementCard };

  if (startStage === RUN_STAGES.PLANNING) return state;

  const plan = await readMarkdownJson(path.join(runDir, "plan.md"));
  const skill = findSkill(requirementCard);
  Object.assign(state, { plan, skill });

  if (startStage === RUN_STAGES.EDITING) return state;

  const diff = await readText(path.join(runDir, "diff.patch"));
  const verification = startStage === RUN_STAGES.PR_DRAFTING
    ? await readJson(path.join(runDir, "verification.json"))
    : undefined;
  Object.assign(state, {
    diff,
    edit: { changedFiles: plan.target_files, summary: plan.summary },
    verification,
  });

  return state;
}

async function readCheckpoints(runDir, metadata) {
  if (metadata?.checkpoints && typeof metadata.checkpoints === "object") {
    return { ...metadata.checkpoints };
  }
  return (await readOptionalJson(path.join(runDir, "checkpoints.json"))) || {};
}

function resolveResumeInput(revisedInput, requirementCard) {
  return typeof revisedInput === "string" && revisedInput.trim()
    ? revisedInput.trim()
    : requirementCard.source_input;
}

function requireProjectRoot(projectRoot) {
  if (typeof projectRoot !== "string" || projectRoot.trim() === "") {
    throw new Error("projectRoot is required for delivery context");
  }
  return projectRoot;
}

async function loadAiArtifacts(context) {
  const aiCallsPath = path.join(context.evidence.runDir, "ai-calls.jsonl");
  if (!existsSync(aiCallsPath)) {
    throw new Error(`Run ${context.runId} is missing ai-calls.jsonl`);
  }
  const aiCalls = parseAiCallLog(await readText(aiCallsPath));
  const hasLlmUsage = aiCalls.some((call) => call.tokens_in + call.tokens_out > 0);
  return {
    mode: hasLlmUsage ? "llm" : "rules",
    aiCalls,
  };
}
