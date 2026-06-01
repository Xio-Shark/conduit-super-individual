import { fileURLToPath } from "node:url";
import {
  indexPassedRuns,
  writeEmbeddingsIndex,
} from "../services/index/src/embeddingIndex.js";

const PROJECT_ROOT = fileURLToPath(new URL("..", import.meta.url));

export async function runBuildEmbeddingsCli({
  args = [],
  projectRoot = PROJECT_ROOT,
  indexRuns = indexPassedRuns,
  writeIndex = writeEmbeddingsIndex,
} = {}) {
  try {
    parseArgs(args);
    const records = await indexRuns(projectRoot);
    const filePath = await writeIndex(projectRoot, records);
    const checks = [
      {
        name: "embeddings-index-written",
        status: "passed",
        detail: `${records.length} records written to ${filePath}`,
      },
    ];
    console.log(JSON.stringify({
      mode: "build-embeddings",
      status: "passed",
      recordCount: records.length,
      outputPath: filePath,
      checkCounts: countChecks(checks),
      checks,
    }, null, 2));
  } catch (error) {
    const checks = [fatalCheck(error.message)];
    console.log(JSON.stringify({
      mode: "build-embeddings",
      status: "failed",
      checkCounts: countChecks(checks),
      checks,
    }, null, 2));
    process.exitCode = 1;
  }
}

function parseArgs(args) {
  for (const arg of args) {
    if (arg !== "--json") throw new Error(usage());
  }
}

function usage() {
  return "Usage: node scripts/build-embeddings.mjs";
}

function fatalCheck(detail) {
  return { name: "fatal", status: "failed", detail };
}

function countChecks(checks) {
  return {
    total: checks.length,
    passed: checks.filter((check) => check.status === "passed").length,
    failed: checks.filter((check) => check.status === "failed").length,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runBuildEmbeddingsCli({ args: process.argv.slice(2) });
}
