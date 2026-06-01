#!/usr/bin/env node
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { resolveProjectWriteTarget, resolveSafeWriteTarget, writeGeneratedOutput } from "./submission-write-guard.mjs";

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = fileURLToPath(new URL("..", import.meta.url));
const COMMAND_SAFETY = {
  createsFinalEvidenceByDefault: false,
  validatesByDefault: false,
  copyFinalOptInEnv: "SCAFFOLD_SUBMISSION_EVIDENCE_COPY_FINAL=1",
  validationOptInEnv: "SCAFFOLD_SUBMISSION_EVIDENCE_RUN_VALIDATION=1",
  note: "Generated commands do not copy final evidence files or run validation unless explicitly opted in.",
};
const TEMPLATES = [
  {
    kind: "u6-rehearsal",
    label: "U6 timed rehearsal manifest",
    output: "docs/reports/submission/u6-rehearsal-manifest.template.json",
    finalPath: "docs/reports/submission/u6-rehearsal-manifest.json",
    checkCommand: "npm run check:u6 -- --manifest docs/reports/submission/u6-rehearsal-manifest.json",
    command: "scripts/scaffold-u6-rehearsal.mjs",
    args: ["--output", "docs/reports/submission/u6-rehearsal-manifest.template.json"],
  },
  {
    kind: "video-evidence",
    label: "S7 local video evidence",
    output: "docs/reports/submission/video-evidence.template.json",
    finalPath: "docs/reports/submission/video-evidence.json",
    checkCommand: "npm run check:video-evidence -- --file docs/reports/submission/video-evidence.json",
    command: "scripts/check-video-evidence.mjs",
    args: ["--write-template", "docs/reports/submission/video-evidence.template.json"],
  },
  {
    kind: "external-submission",
    label: "S6/S8/S9/S10 external submission evidence",
    output: "docs/reports/submission/external-submission-evidence.template.json",
    finalPath: "docs/reports/submission/external-submission-evidence.json",
    checkCommand: "npm run check:external-submission -- --file docs/reports/submission/external-submission-evidence.json --public-repo <fresh-clone-path>",
    command: "scripts/check-external-submission.mjs",
    args: ["--write-template", "docs/reports/submission/external-submission-evidence.template.json"],
  },
  {
    kind: "defense-rehearsal",
    label: "S10 defense rehearsal evidence",
    output: "docs/reports/submission/defense-rehearsal-evidence.template.json",
    finalPath: "docs/reports/submission/defense-rehearsal-evidence.json",
    checkCommand: "npm run check:defense-rehearsal -- --file docs/reports/submission/defense-rehearsal-evidence.json",
    command: "scripts/check-defense-rehearsal.mjs",
    args: ["--write-template", "docs/reports/submission/defense-rehearsal-evidence.template.json"],
  },
];

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const writeTarget = options.writeTo ? await resolveWriteTarget(options.writeTo) : undefined;
  const templates = filterTemplates(options);
  const results = [];
  for (const template of templates) {
    results.push(await writeTemplate(template, options));
  }
  const finalEvidence = options.copyFinal ? await copyFinalEvidenceFiles(results, options) : [];
  const nextSteps = results.map((result) => ({
    kind: result.kind,
    copyFrom: result.output,
    writeTo: result.finalPath,
    validateWith: result.checkCommand,
  }));
  const actionPlan = buildActionPlan(nextSteps);
  const templateChecks = results.map((result) => ({
    name: `template:${result.output}`,
    status: "passed",
    detail: "placeholder template written",
  }));
  const finalChecks = finalEvidence.map((result) => ({
    name: `final:${result.finalPath}`,
    status: result.status === "copied" || result.status === "skipped-existing" ? "passed" : "failed",
    detail: result.detail,
  }));
  const checks = [...templateChecks, ...finalChecks];
  const summary = {
    mode: "submission-evidence-scaffold",
    status: "scaffolded",
    availableKinds: availableKinds(),
    kindFilter: options.kind,
    publicRepo: options.publicRepo,
    outputs: results,
    finalEvidence,
    nextSteps,
    actionPlan,
    safety: COMMAND_SAFETY,
    checkCounts: countChecks(checks),
    checks,
    note: "Templates only. Copy or rename them to the non-template evidence filenames, replace placeholders with real human/external evidence, then run the corresponding check commands.",
  };
  const output = formatSummary(summary, options.format);
  if (writeTarget) await writeOutput(writeTarget, output);
  console.log(output);
}

function parseArgs(args) {
  const options = { format: "json", copyFinal: false, kind: undefined, writeTo: undefined, publicRepo: undefined };
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (name === "--json") {
      options.format = "json";
    } else if (name === "--markdown") {
      options.format = "markdown";
    } else if (name === "--commands") {
      options.format = "commands";
    } else if (name === "--copy-final") {
      options.copyFinal = true;
    } else if (name === "--kind") {
      const value = args[index + 1];
      if (isMissingFlagValue(value)) throw new Error(usage());
      options.kind = value;
      index += 1;
    } else if (name === "--write") {
      const value = args[index + 1];
      if (isMissingFlagValue(value)) throw new Error(usage());
      options.writeTo = value;
      index += 1;
    } else if (name === "--public-repo") {
      const value = args[index + 1];
      if (isMissingFlagValue(value)) throw new Error(usage());
      options.publicRepo = value;
      index += 1;
    } else if (name === "--format") {
      const value = args[index + 1];
      if (isMissingFlagValue(value) || !["json", "markdown", "commands"].includes(value)) throw new Error(usage());
      options.format = value;
      index += 1;
    } else {
      throw new Error(usage());
    }
  }
  return options;
}

function filterTemplates(options) {
  if (!options.kind) return TEMPLATES;
  const selected = TEMPLATES.filter((template) => template.kind === options.kind);
  if (!selected.length) {
    throw new Error(`Unknown evidence kind ${options.kind}. Available kinds: ${availableKinds().join(", ")}`);
  }
  return selected;
}

function availableKinds() {
  return TEMPLATES.map((template) => template.kind);
}

async function copyFinalEvidenceFiles(results) {
  const finalEvidence = [];
  for (const result of results) {
    const source = path.join(PROJECT_ROOT, result.output);
    const target = await resolveProjectWriteTarget(PROJECT_ROOT, result.finalPath, "final evidence placeholder");
    const exists = await pathExists(target);
    if (exists) {
      finalEvidence.push({
        kind: result.kind,
        finalPath: result.finalPath,
        template: result.output,
        status: "skipped-existing",
        detail: "final evidence file already exists; not overwritten",
      });
      continue;
    }
    const text = await readTemplateSource(source, result.output);
    await writeGeneratedOutput(target, text);
    finalEvidence.push({
      kind: result.kind,
      finalPath: result.finalPath,
      template: result.output,
      status: "copied",
      detail: "template copied; replace placeholders with real human/external evidence before validation",
    });
  }
  return finalEvidence;
}

async function pathExists(target) {
  try {
    await access(target, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readTemplateSource(source, relativePath) {
  await resolveSafeWriteTarget(PROJECT_ROOT, relativePath, "submission evidence template");
  const text = await readFile(source, "utf8");
  return text.replace(/\n$/u, "");
}

async function writeTemplate(template, options = {}) {
  await resolveSafeWriteTarget(PROJECT_ROOT, template.output, "submission evidence template");
  await execFileAsync(process.execPath, [template.command, ...template.args], {
    cwd: PROJECT_ROOT,
  });
  const checkedOutputTarget = await resolveSafeWriteTarget(PROJECT_ROOT, template.output, "submission evidence template");
  await access(checkedOutputTarget);
  return {
    kind: template.kind,
    label: template.label,
    output: template.output,
    finalPath: template.finalPath,
    checkCommand: buildCheckCommand(template, options),
  };
}

function buildCheckCommand(template, options = {}) {
  if (template.kind !== "external-submission" || !options.publicRepo) return template.checkCommand;
  return template.checkCommand.replace("<fresh-clone-path>", shellArg(options.publicRepo));
}

function fatalSummary(error) {
  const checks = [
    {
      name: "fatal",
      status: "failed",
      detail: error.message,
    },
  ];
  return {
    mode: "submission-evidence-scaffold",
    status: "failed",
    availableKinds: availableKinds(),
    outputs: [],
    finalEvidence: [],
    checkCounts: countChecks(checks),
    checks,
    actionPlan: [],
    safety: COMMAND_SAFETY,
    usage: usage(),
    note: "Templates were not fully scaffolded. Fix the failing delegated template command and rerun.",
  };
}

function buildActionPlan(nextSteps) {
  return nextSteps.map((step) => ({
    kind: step.kind,
    copyCommand: buildCopyCommand(step),
    copyFinalCommand: `npm run scaffold:submission-evidence -- --kind ${step.kind} --copy-final`,
    editTarget: step.writeTo,
    validateCommand: step.validateWith,
    validationSafety: buildValidationSafety(step.validateWith),
  }));
}

function buildCopyCommand(step) {
  return `npm run scaffold:submission-evidence -- --kind ${shellArg(step.kind)} --copy-final`;
}

function formatSummary(summary, format) {
  if (format === "markdown") return formatMarkdown(summary);
  if (format === "commands") return formatCommands(summary);
  return JSON.stringify(summary, null, 2);
}

async function writeOutput(target, output) {
  await writeGeneratedOutput(target, output);
}

async function resolveWriteTarget(writeTo) {
  return resolveSafeWriteTarget(PROJECT_ROOT, writeTo, "scaffold output");
}

function formatMarkdown(summary) {
  const lines = [
    "# Submission Evidence Scaffold",
    "",
    `Status: ${summary.status}`,
    `Available kinds: ${summary.availableKinds.join(", ")}`,
    `Kind filter: ${summary.kindFilter ?? "none"}`,
    `Templates: ${summary.outputs.length}`,
    `Final evidence files copied: ${summary.finalEvidence.filter((item) => item.status === "copied").length}`,
    `Safety: commands copy final evidence by default=${summary.safety.createsFinalEvidenceByDefault}; validate by default=${summary.safety.validatesByDefault}`,
    `Opt in: ${summary.safety.copyFinalOptInEnv}; ${summary.safety.validationOptInEnv}`,
    "",
    summary.note,
    "",
    "## Templates",
  ];
  for (const output of summary.outputs) {
    lines.push(`- ${output.kind}: \`${output.output}\` -> \`${output.finalPath}\``);
    lines.push(`  - Validate: \`${output.checkCommand}\``);
  }
  if (summary.finalEvidence.length) {
    lines.push("", "## Final Evidence Files");
    for (const item of summary.finalEvidence) {
      lines.push(`- ${item.kind}: ${item.status} \`${item.finalPath}\``);
      lines.push(`  - ${item.detail}`);
    }
  }
  lines.push("", "## Manual Next Steps");
  for (const action of summary.actionPlan) {
    lines.push(`- ${action.kind}`);
    lines.push(`  - Prepare final placeholder explicitly: \`${action.copyFinalCommand}\``);
    lines.push(`  - Fill real evidence: \`${action.editTarget}\``);
    lines.push(`  - Validate: \`${action.validateCommand}\``);
    lines.push(`  - ${formatValidationSafety(action.validationSafety)}`);
  }
  return formatMarkdownLines(lines);
}

function formatCommands(summary) {
  const needsFreshClonePath = summary.actionPlan.some((action) => action.validationSafety?.mayRequireFreshClonePath);
  const hasProvidedPublicRepo = Boolean(summary.publicRepo);
  const usesFreshClonePath = needsFreshClonePath || hasProvidedPublicRepo;
  const lines = [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    `cd ${shellQuote(PROJECT_ROOT)}`,
    "",
    "# Submission evidence scaffold commands",
    "# Templates have already been generated by scaffold:submission-evidence.",
    "# These commands do not copy final evidence files or run validation by default.",
    "# Fill every copied file with real human/external evidence before validation.",
    "# To copy placeholder templates directly, rerun with SCAFFOLD_SUBMISSION_EVIDENCE_COPY_FINAL=1.",
    "# To validate after filling real evidence, rerun with SCAFFOLD_SUBMISSION_EVIDENCE_RUN_VALIDATION=1.",
    "# To focus one evidence type, add: --kind video-evidence",
    `# available_kinds=${summary.availableKinds.join(",")}`,
    `# safety_copy_final_by_default=${summary.safety.createsFinalEvidenceByDefault}`,
    `# safety_validate_by_default=${summary.safety.validatesByDefault}`,
    `# safety_copy_final_opt_in=${summary.safety.copyFinalOptInEnv}`,
    `# safety_validation_opt_in=${summary.safety.validationOptInEnv}`,
    "",
  ];
  if (usesFreshClonePath) {
    lines.push("# Set FRESH_CLONE_PATH before running external submission validation.");
    lines.push(hasProvidedPublicRepo
      ? `: \${FRESH_CLONE_PATH:=${shellQuote(summary.publicRepo)}}`
      : ": \"${FRESH_CLONE_PATH:=}\"");
    lines.push("");
  }
  const hasCopyCommands = summary.actionPlan.some((action) => action.copyCommand);
  if (hasCopyCommands) {
    lines.push(
      "# Final evidence placeholder creation is opt-in.",
      "if [ \"${SCAFFOLD_SUBMISSION_EVIDENCE_COPY_FINAL:-0}\" != \"1\" ]; then",
      "  echo 'Skipped final evidence placeholder creation. Rerun with SCAFFOLD_SUBMISSION_EVIDENCE_COPY_FINAL=1 only when you are ready to fill real evidence.'",
      "else",
    );
  }
  for (const action of summary.actionPlan) {
    lines.push(`## ${action.kind}`);
    lines.push("# safe placeholder copy only; fill real evidence before expecting validation to pass");
    lines.push(action.copyCommand);
    lines.push(`# fill real evidence in ${action.editTarget}`);
    lines.push("");
  }
  if (hasCopyCommands) {
    lines.push("fi", "");
  }
  const validationActions = summary.actionPlan
    .map((action) => ({ action, validateCommand: shellSafeValidateCommand(action.validateCommand, summary) }))
    .filter((entry) => entry.validateCommand);
  if (validationActions.length) {
    lines.push(
      "# Validation is opt-in so placeholder evidence is not checked immediately.",
      "if [ \"${SCAFFOLD_SUBMISSION_EVIDENCE_RUN_VALIDATION:-0}\" != \"1\" ]; then",
      "  echo 'Fill real evidence, then rerun with SCAFFOLD_SUBMISSION_EVIDENCE_RUN_VALIDATION=1 to validate.'",
      "  exit 0",
      "fi",
      "",
      "# Validate after filling real evidence",
    );
    for (const { action, validateCommand } of validationActions) {
      lines.push(`## ${action.kind}`);
      lines.push(`# validation opt-in: ${action.validationSafety.optInEnv}`);
      lines.push(`# fresh clone path required: ${action.validationSafety.mayRequireFreshClonePath || hasProvidedPublicRepo ? "yes" : "no"}`);
      if (action.validationSafety.mayRequireFreshClonePath || hasProvidedPublicRepo) {
        lines.push("test -n \"$FRESH_CLONE_PATH\" || { echo 'FRESH_CLONE_PATH is required'; exit 1; }");
      }
      lines.push(validateCommand);
      lines.push("");
    }
  }
  return formatCommandLines(lines).trimEnd();
}

function formatValidationSafety(safety) {
  const optIn = safety.optInRequired ? `Validation safety: opt-in via \`${safety.optInEnv}\`` : "Validation safety: no opt-in required";
  const freshClone = safety.mayRequireFreshClonePath ? "fresh clone path required" : "fresh clone path not required";
  return `${optIn}; ${freshClone}`;
}

function buildValidationSafety(command) {
  if (!command) return undefined;
  return {
    optInRequired: true,
    optInEnv: COMMAND_SAFETY.validationOptInEnv,
    mayRequireFreshClonePath: requiresFreshClonePath(command),
  };
}

function shellSafeValidateCommand(command, summary = {}) {
  const publicRepoCommand = summary.publicRepo
    ? String(command).replace(`--public-repo ${shellArg(summary.publicRepo)}`, "--public-repo \"$FRESH_CLONE_PATH\"")
    : command;
  return publicRepoCommand
    .replaceAll("--public-repo <fresh-clone-path>", "--public-repo \"$FRESH_CLONE_PATH\"")
    .replaceAll("--repo <fresh-clone-path>", "--repo \"$FRESH_CLONE_PATH\"")
    .replaceAll("PUBLIC_REPO_CLONE_PATH=<fresh-clone-path>", "PUBLIC_REPO_CLONE_PATH=\"$FRESH_CLONE_PATH\"");
}

function requiresFreshClonePath(command) {
  return String(command ?? "").includes("<fresh-clone-path>");
}

function shellQuote(value) {
  return `'${escapeControlChars(value).replaceAll("'", "'\\''")}'`;
}

function shellArg(value) {
  const text = String(value);
  return /^[A-Za-z0-9_./:=+-]+$/u.test(text) ? text : shellQuote(text);
}

function isMissingFlagValue(value) {
  return value === undefined || value.startsWith("--");
}

function escapeControlChars(value) {
  return String(value).replace(/[\u0000-\u001F\u007F]/gu, (char) => {
    if (char === "\n") return "\\n";
    if (char === "\r") return "\\r";
    if (char === "\t") return "\\t";
    return `\\x${char.codePointAt(0).toString(16).padStart(2, "0")}`;
  });
}

function formatMarkdownLines(lines) {
  return lines.map((line) => escapeControlChars(line)).join("\n");
}

function formatCommandLines(lines) {
  return lines.map((line) => (
    String(line).startsWith("#") ? sanitizeShellComment(line) : line
  )).join("\n");
}

function sanitizeShellComment(line) {
  return String(line).replace(/[\r\n]/gu, "\\n");
}

function usage() {
  return "Usage: node scripts/scaffold-submission-evidence.mjs [--json|--markdown|--commands|--format json|markdown|commands] [--copy-final] [--kind <u6-rehearsal|video-evidence|external-submission|defense-rehearsal>] [--write <path>] [--public-repo <fresh-clone-path>]";
}

function countChecks(checks) {
  return {
    total: checks.length,
    passed: checks.filter((check) => check.status === "passed").length,
    failed: checks.filter((check) => check.status === "failed").length,
  };
}

main().catch((error) => {
  console.log(JSON.stringify(fatalSummary(error), null, 2));
  process.exit(1);
});
