import { existsSync } from "node:fs";
import path from "node:path";
import {
  normalizeFailureRun,
  normalizePausedRun,
  normalizeSuccessfulRun,
} from "./runArchiveNormalize.js";
import {
  readFailureArchive,
  readPausedArchive,
  readSuccessfulArchive,
} from "./runArchiveReaders.js";

export async function loadArchivedRun(runId, projectRoot) {
  const runDir = path.join(projectRoot, "docs/reports/runs", runId);
  if (!existsSync(runDir)) return null;
  if (existsSync(path.join(runDir, "failure.json"))) {
    return normalizeFailureRun(await readFailureArchive(runDir), projectRoot);
  }
  if (existsSync(path.join(runDir, "paused.json"))) {
    return normalizePausedRun(await readPausedArchive(runDir), projectRoot);
  }

  return normalizeSuccessfulRun(await readSuccessfulArchive(runDir), projectRoot);
}
