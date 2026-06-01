import "dotenv/config";
import { runP0Delivery } from "./orchestrator.js";
import { PROJECT_ROOT } from "./deliveryConfig.js";

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli({ args: process.argv.slice(2), runDelivery: runP0Delivery });
}

export function runCli({ args = [], runDelivery = runP0Delivery, projectRoot = PROJECT_ROOT } = {}) {
  const cliInput = args.join(" ").trim();
  if (!cliInput) {
    console.log(JSON.stringify(failureSummary(new Error("Requirement input is required.")), null, 2));
    process.exit(1);
  }

  return runDelivery({ input: cliInput, projectRoot })
    .then((result) => {
      console.log(JSON.stringify({
        mode: "delivery-cli",
        runId: result.runId,
        status: result.status,
        stage: result.stage,
        evidenceDir: result.evidenceDir,
      }, null, 2));
      if (result.status !== "passed") {
        process.exitCode = 1;
      }
    })
    .catch((error) => {
      console.log(JSON.stringify(failureSummary(error), null, 2));
      process.exitCode = 1;
    });
}

function failureSummary(error) {
  return {
    mode: "delivery-cli",
    status: "failed",
    checks: [
      {
        name: "fatal",
        status: "failed",
        detail: error.message,
      },
    ],
  };
}
