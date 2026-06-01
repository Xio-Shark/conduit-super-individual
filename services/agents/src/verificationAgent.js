import { fileURLToPath } from "node:url";
import { loadChangedFileContents } from "../../checks/src/crossStackSync.js";

const PROJECT_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

export async function verifyRun({ sandbox, skill, changedFiles = [] }) {
  const scripts = await sandbox.listPackageScripts();
  const checks = [
    await runLint({ sandbox, scripts, skill }),
    await runScriptOrGap({ sandbox, scriptName: "test", scripts }),
  ];

  if (typeof skill?.crossStackCheck === "function") {
    checks.push(await runCrossStackCheck({ sandbox, skill, changedFiles }));
  }

  return {
    status: checks.every((check) => check.exitCode === 0) ? "passed" : "failed",
    checks,
  };
}

async function runCrossStackCheck({ sandbox, skill, changedFiles }) {
  try {
    const sandboxFiles = await loadChangedFileContents(sandbox, changedFiles);
    const result = skill.crossStackCheck({ sandboxFiles });
    return crossStackResult(result);
  } catch (error) {
    return crossStackResult({ status: "failed", message: error.message });
  }
}

function crossStackResult(result) {
  return {
    command: "cross-stack-sync",
    exitCode: result.status === "passed" ? 0 : 1,
    status: result.status,
    source: "implementation-checker",
    stdout: JSON.stringify(result),
    stderr: result.message || "",
    durationMs: 0,
    summary: result.message || "Cross-stack consistency check",
  };
}

async function runLint({ sandbox, scripts, skill }) {
  if (scripts.lint) {
    const result = await sandbox.runNpmScript("lint");
    return { ...result, source: "conduit-script" };
  }

  if (!skillAllowsImplementationLint(skill)) {
    return {
      command: "npm run lint",
      exitCode: 1,
      status: "gap",
      source: "conduit-script",
      stdout: "",
      stderr: "",
      durationMs: 0,
      summary: "Conduit package.json has no lint script and Skill did not declare lint:sandbox",
    };
  }

  const result = await sandbox.runCommand("npm", ["run", "lint:sandbox"], PROJECT_ROOT);
  return { ...result, source: "implementation-lint-adapter" };
}

function skillAllowsImplementationLint(skill) {
  return Array.isArray(skill?.validation) && skill.validation.includes("npm run lint:sandbox");
}

async function runScriptOrGap({ sandbox, scriptName, scripts }) {
  if (scripts[scriptName]) {
    return sandbox.runNpmScript(scriptName);
  }

  return {
    command: `npm run ${scriptName}`,
    exitCode: 1,
    status: "gap",
    source: "conduit-script",
    stdout: "",
    stderr: "",
    durationMs: 0,
    summary: `Conduit package.json has no ${scriptName} script`,
  };
}
