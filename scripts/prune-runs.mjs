#!/usr/bin/env node
import { rm, mkdir, rename, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listRunArchives, writeRunIndex } from "../services/orchestrator/src/runIndex.js";

const PROJECT_ROOT = fileURLToPath(new URL("..", import.meta.url));

const KEEP_RUNS = new Set([
  "run-2026-05-21T02-16-15-215Z",
  "run-2026-05-21T05-58-01-181Z",
  "run-2026-05-21T05-51-56-519Z",
  "run-2026-05-21T05-52-12-490Z",
  "run-2026-05-21T05-52-18-277Z",
  "run-2026-05-21T06-24-47-248Z",
  "run-l2-auto-cover-image",
  "run-l3-multi-turn-clarify",
  "run-plan-llm-driven",
  "run-semantic-recall-demo",
  "run-l2-comment-like",
]);

export async function runPruneRunsCli({
  args = process.argv.slice(2),
  projectRoot = PROJECT_ROOT,
  keepRuns = KEEP_RUNS,
  listArchives = listRunArchives,
  writeIndex = writeRunIndex,
  exists = existsSync,
  readDir = readdir,
  makeDir = mkdir,
  remove = rm,
  move = rename,
} = {}) {
  let options;
  try {
    options = parseArgs(args);
  } catch (error) {
    printFatal(error.message);
    process.exitCode = 1;
    return;
  }
  const { apply, archivePaused } = options;

  if (archivePaused) {
    return archivePausedRuns({
      apply,
      projectRoot,
      keepRuns,
      exists,
      readDir,
      makeDir,
      move,
      writeIndex,
    });
  }
  return pruneOrphans({
    apply,
    projectRoot,
    listArchives,
    writeIndex,
    remove,
  });
}

function parseArgs(args) {
  const options = { apply: false, archivePaused: false };
  for (const arg of args) {
    if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--archive-paused") {
      options.archivePaused = true;
    } else if (arg === "--json") {
      continue;
    } else {
      throw new Error(usage());
    }
  }
  return options;
}

function usage() {
  return "Usage: node scripts/prune-runs.mjs [--archive-paused] [--apply]";
}

async function pruneOrphans({ apply, projectRoot, listArchives, writeIndex, remove }) {
  const index = await listArchives(projectRoot);
  const written = await writeIndex(projectRoot);

  if (!apply) {
    const checks = [
      {
        name: "run-index-written",
        status: "passed",
        detail: `run index contains ${written.runCount} runs`,
      },
      {
        name: "prune-candidates-collected",
        status: "passed",
        detail: `${index.prunedCandidates.length} candidates found`,
      },
    ];
    console.log(JSON.stringify({
      mode: "dry-run",
      status: "passed",
      prunedCandidates: index.prunedCandidates,
      indexPath: path.join(projectRoot, "docs/reports/runs/index.json"),
      runCount: written.runCount,
      checkCounts: countChecks(checks),
      checks,
    }, null, 2));
    return;
  }

  for (const candidate of index.prunedCandidates) {
    const target = path.join(projectRoot, "docs/reports/runs", candidate.runId);
    await remove(target, { recursive: true, force: true });
    console.log(`removed ${candidate.runId}: ${candidate.reason}`);
  }

  const refreshed = await writeIndex(projectRoot);
  const checks = [
    {
      name: "prune-candidates-removed",
      status: "passed",
      detail: `${index.prunedCandidates.length} candidates removed`,
    },
    {
      name: "run-index-refreshed",
      status: "passed",
      detail: `run index contains ${refreshed.runCount} runs`,
    },
  ];
  console.log(JSON.stringify({
    mode: "apply",
    status: "passed",
    removed: index.prunedCandidates.length,
    runCount: refreshed.runCount,
    checkCounts: countChecks(checks),
    checks,
  }, null, 2));
}

async function archivePausedRuns({ apply, projectRoot, keepRuns, exists, readDir, makeDir, move, writeIndex }) {
  const runsDir = path.join(projectRoot, "docs/reports/runs");
  const archiveDir = path.join(projectRoot, "docs/reports/runs-archive");
  if (!exists(runsDir)) {
    printFatal(`runs dir not found: ${runsDir}`);
    process.exitCode = 1;
    return;
  }
  const entries = await readDir(runsDir, { withFileTypes: true });
  const targets = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (keepRuns.has(entry.name)) continue;
    const runDir = path.join(runsDir, entry.name);
    const hasPaused = exists(path.join(runDir, "paused.json"));
    const hasFailure = exists(path.join(runDir, "failure.json"));
    const hasSummary = exists(path.join(runDir, "run-summary.json"));
    if (hasPaused || (hasFailure && !hasSummary)) {
      targets.push({ runId: entry.name, reason: hasPaused ? "paused" : "failure-only" });
    }
  }

  if (!apply) {
    const checks = [
      {
        name: "archive-candidates-collected",
        status: "passed",
        detail: `${targets.length} candidates found`,
      },
    ];
    console.log(JSON.stringify({
      mode: "archive-paused dry-run",
      status: "passed",
      candidates: targets,
      candidateCount: targets.length,
      archiveDir,
      checkCounts: countChecks(checks),
      checks,
    }, null, 2));
    return;
  }

  await makeDir(archiveDir, { recursive: true });
  for (const target of targets) {
    const from = path.join(runsDir, target.runId);
    const to = path.join(archiveDir, target.runId);
    await move(from, to);
    console.log(`archived ${target.runId}: ${target.reason}`);
  }
  const refreshed = await writeIndex(projectRoot);
  const checks = [
    {
      name: "paused-runs-archived",
      status: "passed",
      detail: `${targets.length} runs archived`,
    },
    {
      name: "run-index-refreshed",
      status: "passed",
      detail: `run index contains ${refreshed.runCount} runs`,
    },
  ];
  console.log(JSON.stringify({
    mode: "archive-paused apply",
    status: "passed",
    archived: targets.length,
    runCount: refreshed.runCount,
    archiveDir,
    checkCounts: countChecks(checks),
    checks,
  }, null, 2));
}

function printFatal(detail) {
  const checks = [
    {
      name: "fatal",
      status: "failed",
      detail,
    },
  ];
  console.log(JSON.stringify({
    mode: "prune-runs",
    status: "failed",
    checkCounts: countChecks(checks),
    checks,
  }, null, 2));
}

function countChecks(checks) {
  return {
    total: checks.length,
    passed: checks.filter((check) => check.status === "passed").length,
    failed: checks.filter((check) => check.status === "failed").length,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runPruneRunsCli().catch((error) => {
    printFatal(error.message);
    process.exit(1);
  });
}
