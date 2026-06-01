import "dotenv/config";
import { fileURLToPath } from "node:url";
import { resumeFromStage } from "../services/orchestrator/src/deliveryPipeline.js";
import { PROJECT_ROOT } from "../services/orchestrator/src/deliveryConfig.js";

export async function runResumeClarifyCli({
  args = process.argv.slice(2),
  projectRoot = PROJECT_ROOT,
  resume = resumeFromStage,
} = {}) {
  let runId;
  try {
    ({ runId } = parseArgs(args));
  } catch (error) {
    printFatal(error.message);
    process.exitCode = 1;
    return;
  }

  try {
    const result = await resume({
      runId,
      stage: "clarifying",
      projectRoot,
    });
    const passed = result.status === "passed" || result.status === "paused";
    const checks = [
      {
        name: "resume-clarify-result",
        status: passed ? "passed" : "failed",
        detail: `resume returned status=${result.status}, stage=${result.stage}`,
      },
    ];
    console.log(JSON.stringify({
      mode: "resume-clarify",
      runId: result.runId,
      status: result.status,
      stage: result.stage,
      evidenceDir: result.evidenceDir,
      checkCounts: countChecks(checks),
      checks,
    }, null, 2));
    if (!passed) {
      process.exitCode = 1;
    }
  } catch (error) {
    printFatal(error.message, runId);
    process.exitCode = 1;
  }
}

function parseArgs(args) {
  const runIds = [];
  for (const arg of args) {
    if (arg === "--json") continue;
    if (arg.startsWith("--")) throw new Error(usage());
    runIds.push(arg);
  }
  if (runIds.length !== 1) throw new Error(usage());
  return { runId: runIds[0] };
}

function printFatal(detail, runId) {
  const checks = [fatalCheck(detail)];
  console.log(JSON.stringify({
    mode: "resume-clarify",
    status: "failed",
    ...(runId ? { runId } : {}),
    checkCounts: countChecks(checks),
    checks,
  }, null, 2));
}

function usage() {
  return "Usage: node scripts/resume-clarify.mjs <runId>";
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
  runResumeClarifyCli();
}
