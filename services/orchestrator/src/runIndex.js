import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export async function listRunArchives(projectRoot) {
  const runsDir = path.join(projectRoot, "docs/reports/runs");
  if (!existsSync(runsDir)) {
    return { runs: [], prunedCandidates: [] };
  }

  const entries = await readdir(runsDir, { withFileTypes: true });
  const runs = [];
  const prunedCandidates = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const runDir = path.join(runsDir, entry.name);
    const hasSummary = existsSync(path.join(runDir, "run-summary.json"));
    const hasFailure = existsSync(path.join(runDir, "failure.json"));
    const hasPaused = existsSync(path.join(runDir, "paused.json"));
    const hasRequirement = existsSync(path.join(runDir, "requirement.md"));

    if (!hasSummary && hasFailure && !hasRequirement) {
      prunedCandidates.push({ runId: entry.name, reason: "failure-only orphan" });
      continue;
    }

    const record = { runId: entry.name, status: "unknown", stage: "unknown" };
    if (hasSummary) {
      const summary = JSON.parse(await readFile(path.join(runDir, "run-summary.json"), "utf8"));
      record.status = summary.status || record.status;
      record.stage = summary.stage || record.stage;
      record.aiMode = summary.aiMode;
    } else if (hasFailure) {
      const failure = JSON.parse(await readFile(path.join(runDir, "failure.json"), "utf8"));
      record.status = failure.status || "failed";
      record.stage = failure.stage || "failed";
    } else if (hasPaused) {
      const paused = JSON.parse(await readFile(path.join(runDir, "paused.json"), "utf8"));
      record.status = "paused";
      record.stage = paused.stage || record.stage;
    }
    runs.push(record);
  }

  runs.sort((left, right) => right.runId.localeCompare(left.runId));
  return { runs, prunedCandidates };
}

export async function writeRunIndex(projectRoot) {
  const index = await listRunArchives(projectRoot);
  const indexPath = path.join(projectRoot, "docs/reports/runs/index.json");
  const payload = {
    generatedAt: new Date().toISOString(),
    runCount: index.runs.length,
    runs: index.runs,
    prunedCandidates: index.prunedCandidates,
  };
  await import("node:fs/promises").then(({ writeFile, mkdir }) =>
    mkdir(path.dirname(indexPath), { recursive: true }).then(() =>
      writeFile(indexPath, `${JSON.stringify(payload, null, 2)}\n`),
    ),
  );
  return payload;
}
