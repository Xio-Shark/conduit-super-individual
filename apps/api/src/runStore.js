import { writeFile } from "node:fs/promises";
import path from "node:path";
import { loadArchivedRun } from "./runArchive.js";

export function createRunStore(projectRoot) {
  const runs = new Map();

  return {
    set(run) {
      runs.set(run.runId, run);
    },

    async find(runId) {
      const run = runs.get(runId);
      if (run) return run;

      const archivedRun = await loadArchivedRun(runId, projectRoot);
      if (archivedRun) runs.set(runId, archivedRun);
      return archivedRun;
    },

    async persistMetadata(run) {
      if (!run.evidenceDir) {
        throw new Error("Run evidenceDir is required to persist metadata");
      }
      const metadata = {
        stage: run.stage,
        status: run.status,
        retryOf: run.retryOf || null,
        confirmations: requireArray(run.confirmations, "confirmations"),
        events: requireArray(run.events, "events"),
        checkpoints: run.checkpoints || null,
        prSubmission: run.prSubmission || null,
      };
      await writeFile(
        path.join(run.evidenceDir, "metadata.json"),
        `${JSON.stringify(metadata, null, 2)}\n`,
        "utf8",
      );
    },
  };
}

function requireArray(value, name) {
  if (!Array.isArray(value)) {
    throw new Error(`Run metadata ${name} must be an array`);
  }
  return value;
}
