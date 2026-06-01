#!/usr/bin/env node
import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { commandFailureDetail, countChecks, parseJsonSummary, summaryConsistencyErrors } from "./json-gate-summary.mjs";

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = process.env.SUBMISSION_GATES_PROJECT_ROOT
  ? normalizeProjectRootPath(process.env.SUBMISSION_GATES_PROJECT_ROOT)
  : normalizeProjectRootPath(fileURLToPath(new URL("..", import.meta.url)));
const DEFAULT_U6_MANIFEST = "docs/reports/submission/u6-rehearsal-manifest.json";
const NOTE = "This aggregates local final-submission gates only. It does not create team information, URLs, recordings, public repositories, remote secret scanning results, or final submission confirmations.";
const MAX_OUTPUT = 20 * 1024 * 1024;
const TAIL_LENGTH = 2400;
const GATE_METADATA = {
  archive: {
    planItems: ["R1", "S8"],
    requiredEvidence: "Candidate archive contains required release files and 12 key runs.",
    nextStep: {
      validateWith: "npm run archive:dry-run",
    },
  },
  u6: {
    planItems: ["U6", "B27"],
    requiredEvidence: "Real timed U6 rehearsal manifest with run evidence, Skill files, change lists, timestamps, and recordings.",
    nextStep: {
      copyFrom: "docs/reports/submission/u6-rehearsal-manifest.template.json",
      writeTo: "docs/reports/submission/u6-rehearsal-manifest.json",
      validateWith: "npm run check:u6 -- --manifest docs/reports/submission/u6-rehearsal-manifest.json",
    },
  },
  video: {
    planItems: ["S7", "B33"],
    requiredEvidence: "docs/reports/submission/video-evidence.json plus local recording, notes, timeline, and evidence refs.",
    nextStep: {
      copyFrom: "docs/reports/submission/video-evidence.template.json",
      writeTo: "docs/reports/submission/video-evidence.json",
      validateWith: "npm run check:video-evidence -- --file docs/reports/submission/video-evidence.json",
    },
  },
  external: {
    planItems: ["R2", "S6", "S8", "S9", "S10", "B29", "B34", "B35", "B37"],
    requiredEvidence: "docs/reports/submission/external-submission-evidence.json with real team, Demo, video, repo, remote scan, and final submission confirmation.",
    nextStep: {
      copyFrom: "docs/reports/submission/external-submission-evidence.template.json",
      writeTo: "docs/reports/submission/external-submission-evidence.json",
      validateWith: "npm run check:external-submission -- --file docs/reports/submission/external-submission-evidence.json --public-repo <fresh-clone-path>",
    },
  },
  defense: {
    planItems: ["S10", "B38"],
    requiredEvidence: "docs/reports/submission/defense-rehearsal-evidence.json plus recording, notes, answered questions, follow-ups, and evidence refs.",
    nextStep: {
      copyFrom: "docs/reports/submission/defense-rehearsal-evidence.template.json",
      writeTo: "docs/reports/submission/defense-rehearsal-evidence.json",
      validateWith: "npm run check:defense-rehearsal -- --file docs/reports/submission/defense-rehearsal-evidence.json",
    },
  },
  "public-repo": {
    planItems: ["S8", "B34"],
    requiredEvidence: "Fresh clone path for the published AI system repository containing sandbox-repo/.",
    nextStep: {
      provide: "--public-repo <fresh-clone-path> or PUBLIC_REPO_CLONE_PATH",
      validateWith: "npm run check:public-repo -- --repo <fresh-clone-path>",
    },
  },
  "pre-submission": {
    planItems: ["S9", "S10", "B35", "B37"],
    requiredEvidence: "Release-day pre-submission check with PUBLIC_REPO_CLONE_PATH and all external evidence completed.",
    nextStep: {
      provide: "PUBLIC_REPO_CLONE_PATH=<fresh-clone-path>",
      validateWith: "PUBLIC_REPO_CLONE_PATH=<fresh-clone-path> bash scripts/pre-submission-check.sh",
    },
  },
  verify: {
    planItems: ["S9", "S10"],
    requiredEvidence: "Local implementation verification must pass before final submission.",
    nextStep: {
      validateWith: "npm run verify",
    },
  },
};
const CATEGORY_NEXT_STEPS = {
  "git-tracking": {
    validateWith: "git status --short",
  },
  "submission-materials": {
    validateWith: "PUBLIC_REPO_CLONE_PATH=<fresh-clone-path> bash scripts/pre-submission-check.sh",
  },
  "u6-evidence": GATE_METADATA.u6.nextStep,
  "video-evidence": GATE_METADATA.video.nextStep,
  "defense-evidence": GATE_METADATA.defense.nextStep,
  "external-evidence": GATE_METADATA.external.nextStep,
  "public-repo": GATE_METADATA["public-repo"].nextStep,
  verify: GATE_METADATA.verify.nextStep,
};
const PLAN_ITEM_ORDER = ["U6", "R2", "S6", "S7", "S8", "S9", "S10", "B27", "B29", "B33", "B34", "B35", "B37", "B38"];

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const gates = await runGates(options);
  const blockers = gates.filter((gate) => gate.status === "failed");
  const blockerSummaries = blockers.map(blockerSummary);
  const summary = {
    mode: "submission-gates-check",
    status: blockers.length ? "failed" : "passed",
    projectRoot: PROJECT_ROOT,
    gates,
    gateCounts: countGates(gates),
    delegatedCheckCounts: countDelegatedChecks(gates),
    blockerCount: blockers.length,
    openPlanItems: openPlanItems(blockers),
    blockers: blockerSummaries,
    categoryCounts: buildCategoryCounts(blockerSummaries),
    nextSteps: blockerNextSteps(blockers),
    note: NOTE,
  };

  console.log(JSON.stringify(summary, null, 2));
  if (blockers.length) process.exitCode = 1;
}

async function runGates(options) {
  const specs = gateSpecs(options);
  const results = [];
  for (const spec of specs) {
    results.push(await runGate(spec, options));
  }
  return results;
}

function gateSpecs(options) {
  const u6Manifest = normalize(options.u6Manifest ?? DEFAULT_U6_MANIFEST);
  return [
    commandGate("archive", "candidate archive dry-run", process.execPath, ["scripts/archive-dry-run.mjs"]),
    commandGate("u6", "U6 timed rehearsal manifest", process.execPath, [
      "scripts/check-u6-rehearsal.mjs",
      "--manifest",
      u6Manifest,
    ], {}, { nextStep: u6NextStep(u6Manifest) }),
    commandGate("video", "local S7 video evidence", process.execPath, ["scripts/check-video-evidence.mjs"]),
    externalSubmissionGate(options),
    commandGate("defense", "S10 Q&A rehearsal evidence", process.execPath, ["scripts/check-defense-rehearsal.mjs"]),
    publicRepoGate(options),
    preSubmissionGate(options),
  ];
}

function externalSubmissionGate(options) {
  const repo = options.publicRepo ?? process.env.PUBLIC_REPO_CLONE_PATH;
  return commandGate("external", "S6/S8/S9/S10 external submission evidence", process.execPath, [
    "scripts/check-external-submission.mjs",
    ...(repo ? ["--public-repo", repo] : []),
  ], {}, repo ? { nextStep: externalNextStep(repo) } : {});
}

function publicRepoGate(options) {
  const repo = options.publicRepo ?? process.env.PUBLIC_REPO_CLONE_PATH;
  if (!repo) {
    return missingGate(
      "public-repo",
      "S8 public repository fresh clone",
      "requires --public-repo <fresh-clone-path> or PUBLIC_REPO_CLONE_PATH",
    );
  }
  return commandGate("public-repo", "S8 public repository fresh clone", process.execPath, [
    "scripts/check-public-repo.mjs",
    "--repo",
    repo,
  ], {}, { nextStep: publicRepoNextStep(repo) });
}

function preSubmissionGate(options) {
  const repo = options.publicRepo ?? process.env.PUBLIC_REPO_CLONE_PATH;
  return commandGate("pre-submission", "S9 release-day pre-submission gate", "bash", [
    "scripts/pre-submission-check.sh",
  ], repo ? { PUBLIC_REPO_CLONE_PATH: repo } : {}, repo ? { nextStep: preSubmissionNextStep(repo) } : {});
}

async function runGate(spec) {
  if (spec.status === "failed") return spec;
  try {
    const { stdout, stderr } = await execFileAsync(spec.command, spec.args, execOptions(spec.env));
    return commandResult(spec, 0, stdout, stderr);
  } catch (error) {
    return commandResult(spec, error.code ?? 1, error.stdout ?? "", error.stderr ?? error.message);
  }
}

function commandResult(spec, exitCode, stdout, stderr) {
  const parsed = parseJsonSummary(stdout);
  const consistencyErrors = summaryConsistencyErrors(parsed);
  const status = exitCode === 0 && parsed?.status === "passed" && consistencyErrors.length === 0 ? "passed" : "failed";
  return stripEmpty({
    id: spec.id,
    label: spec.label,
    planItems: spec.planItems,
    requiredEvidence: spec.requiredEvidence,
    nextStep: spec.nextStep,
    status,
    exitCode,
    command: formatCommand(spec.command, spec.args, spec.env),
    detail: status === "failed" ? commandFailureDetail(exitCode, parsed, consistencyErrors) : undefined,
    summary: parsed,
    stdoutTail: parsed ? undefined : tail(stdout),
    stderrTail: tail(stderr),
  });
}

function execOptions(env = {}) {
  return {
    cwd: PROJECT_ROOT,
    env: { ...process.env, ...env },
    maxBuffer: MAX_OUTPUT,
  };
}

function parseArgs(args) {
  const options = {};
  const filteredArgs = args.filter((arg) => arg !== "--json");
  for (let index = 0; index < filteredArgs.length; index += 2) {
    const name = filteredArgs[index];
    const value = filteredArgs[index + 1];
    if (!name?.startsWith("--") || isMissingFlagValue(value)) throw new Error(usage());
    if (name === "--u6-manifest") options.u6Manifest = value;
    else if (name === "--public-repo") options.publicRepo = value;
    else throw new Error(usage());
  }
  return options;
}

function isMissingFlagValue(value) {
  return value === undefined || value.startsWith("--");
}

function commandGate(id, label, command, args, env = {}, overrides = {}) {
  return { id, label, command, args, env, ...gateMetadata(id), ...overrides };
}

function u6NextStep(manifestPath) {
  return {
    ...GATE_METADATA.u6.nextStep,
    writeTo: manifestPath,
    validateWith: `npm run check:u6 -- --manifest ${shellArg(manifestPath)}`,
  };
}

function externalNextStep(repo) {
  return {
    ...GATE_METADATA.external.nextStep,
    validateWith: `npm run check:external-submission -- --file docs/reports/submission/external-submission-evidence.json --public-repo ${shellArg(repo)}`,
  };
}

function publicRepoNextStep(repo) {
  return {
    ...GATE_METADATA["public-repo"].nextStep,
    provide: undefined,
    validateWith: `npm run check:public-repo -- --repo ${shellArg(repo)}`,
  };
}

function preSubmissionNextStep(repo) {
  return {
    ...GATE_METADATA["pre-submission"].nextStep,
    provide: undefined,
    validateWith: `PUBLIC_REPO_CLONE_PATH=${shellArg(repo)} bash scripts/pre-submission-check.sh`,
  };
}

function missingGate(id, label, detail) {
  return {
    id,
    label,
    ...gateMetadata(id),
    status: "failed",
    exitCode: null,
    command: "not executed",
    detail,
  };
}

function tail(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return undefined;
  return trimmed.length > TAIL_LENGTH ? trimmed.slice(-TAIL_LENGTH) : trimmed;
}

function formatCommand(command, args, env = {}) {
  return [
    ...Object.entries(env).map(([name, value]) => `${name}=${value}`),
    command,
    ...args,
  ].map(shellArgUnlessAssignment).join(" ");
}

function shellQuote(value) {
  return `'${escapeControlChars(value).replaceAll("'", "'\\''")}'`;
}

function escapeControlChars(value) {
  return String(value).replace(/[\u0000-\u001F\u007F]/gu, (char) => {
    if (char === "\n") return "\\n";
    if (char === "\r") return "\\r";
    if (char === "\t") return "\\t";
    return `\\x${char.codePointAt(0).toString(16).padStart(2, "0")}`;
  });
}

function shellArg(value) {
  const text = String(value);
  return /^[A-Za-z0-9_./:=+-]+$/u.test(text) ? text : shellQuote(text);
}

function shellArgUnlessAssignment(value) {
  const text = String(value);
  const assignmentMatch = text.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u);
  if (!assignmentMatch) return shellArg(text);
  return `${assignmentMatch[1]}=${shellArg(assignmentMatch[2])}`;
}

function stripEmpty(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function countGates(gates) {
  return {
    total: gates.length,
    passed: gates.filter((gate) => gate.status === "passed").length,
    failed: gates.filter((gate) => gate.status === "failed").length,
  };
}

function countDelegatedChecks(gates) {
  return countChecks(gates.flatMap((gate) => Array.isArray(gate.summary?.checks) ? gate.summary.checks : []));
}

function blockerSummary(gate) {
  const consistencyErrors = summaryConsistencyErrors(gate.summary);
  const categories = consistencyErrors.length
    ? { [gate.id]: { total: 1, failed: 1 } }
    : gate.summary?.categories ?? { [gate.id]: { total: 1, failed: 1 } };
  return stripEmpty({
    id: gate.id,
    label: gate.label,
    planItems: gate.planItems,
    requiredEvidence: gate.requiredEvidence,
    detail: blockerDetail(gate),
    categories,
    categoryNextSteps: consistencyErrors.length ? undefined : categoryNextSteps(gate.summary?.categories, gate),
    details: consistencyErrors.length ? undefined : failedCheckDetails(gate.summary) ?? undefined,
    nextStep: gate.nextStep,
  });
}

function categoryNextSteps(categories, gate) {
  if (!categories) return undefined;
  const nextSteps = {};
  for (const category of Object.keys(categories)) {
    if (gate.id === "u6" && category === "u6-evidence") nextSteps[category] = gate.nextStep;
    else if (CATEGORY_NEXT_STEPS[category]) nextSteps[category] = CATEGORY_NEXT_STEPS[category];
  }
  return Object.keys(nextSteps).length ? nextSteps : undefined;
}

function buildCategoryCounts(blockers) {
  const categoryCounts = {};
  for (const blocker of blockers) {
    if (!blocker.categories) continue;
    for (const [name, counts] of Object.entries(blocker.categories)) {
      const failed = counts.failed ?? counts.total ?? 0;
      const total = counts.total ?? failed;
      const current = categoryCounts[name] ?? { total: 0, failed: 0 };
      current.total += total;
      current.failed += failed;
      categoryCounts[name] = current;
    }
  }
  return categoryCounts;
}

function blockerNextSteps(blockers) {
  return blockers
    .filter((gate) => gate.nextStep)
    .map((gate) => ({
      id: gate.id,
      label: gate.label,
      ...gate.nextStep,
    }));
}

function blockerDetail(gate) {
  return gate.detail
    ?? failedCheckDetailText(gate.summary)
    ?? gate.stderrTail
    ?? gate.stdoutTail
    ?? "failed";
}

function failedCheckDetails(summary) {
  if (!summary || !Array.isArray(summary.checks)) return null;
  const failures = summary.checks
    .filter((check) => check.status === "failed")
    .map((check) => stripEmpty({
      name: check.name,
      detail: check.detail,
      evidence: Array.isArray(check.evidence) ? check.evidence : undefined,
    }));
  if (failures.length === 0) return null;
  return failures;
}

function failedCheckDetailText(summary) {
  const details = failedCheckDetails(summary);
  if (!details) return null;
  return details.map((check) => `${check.name}: ${check.detail}`).join("; ");
}

function openPlanItems(blockers) {
  const items = blockers.flatMap((gate) => gate.planItems ?? []);
  return [...new Set(items)].sort(comparePlanItems);
}

function gateMetadata(id) {
  return GATE_METADATA[id] ?? {
    planItems: [],
    requiredEvidence: "See gate output.",
    nextStep: {
      validateWith: "See gate output.",
    },
  };
}

function comparePlanItems(left, right) {
  const leftIndex = PLAN_ITEM_ORDER.indexOf(left);
  const rightIndex = PLAN_ITEM_ORDER.indexOf(right);
  if (leftIndex !== -1 || rightIndex !== -1) {
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  }
  return left.localeCompare(right);
}

function normalize(relativePath) {
  return relativePath.split(path.sep).join("/").replace(/^\/+/u, "").replace(/\/+$/u, "");
}

function normalizeProjectRootPath(projectRoot) {
  const resolved = path.resolve(projectRoot);
  try {
    return realpathSync(resolved);
  } catch {
    return resolved;
  }
}

function usage() {
  return "Usage: node scripts/check-submission-gates.mjs [--u6-manifest <path>] [--public-repo <fresh-clone-path>]";
}

function fatalSummary(error) {
  const gates = [];
  const checks = [
    {
      name: "fatal",
      status: "failed",
      detail: error.message,
    },
  ];
  return {
    mode: "submission-gates-check",
    status: "failed",
    projectRoot: PROJECT_ROOT,
    gates,
    gateCounts: countGates(gates),
    delegatedCheckCounts: countDelegatedChecks(gates),
    blockerCount: 1,
    openPlanItems: [],
    categoryCounts: {},
    blockers: [
      {
        id: "fatal",
        label: "submission gates invocation",
        planItems: [],
        requiredEvidence: "Valid CLI arguments.",
        detail: error.message,
        nextStep: {
          validateWith: usage(),
        },
      },
    ],
    nextSteps: [
      {
        id: "fatal",
        label: "submission gates invocation",
        validateWith: usage(),
      },
    ],
    checkCounts: countChecks(checks),
    checks,
    usage: usage(),
    note: NOTE,
  };
}

main().catch((error) => {
  console.log(JSON.stringify(fatalSummary(error), null, 2));
  process.exitCode = 1;
});
