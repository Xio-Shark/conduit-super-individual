#!/usr/bin/env node
import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { countChecks, parseJsonSummary } from "./json-gate-summary.mjs";
import { resolveSafeWriteTarget, writeGeneratedOutput } from "./submission-write-guard.mjs";

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = process.env.SUBMISSION_GATES_PROJECT_ROOT
  ? normalizeProjectRootPath(process.env.SUBMISSION_GATES_PROJECT_ROOT)
  : normalizeProjectRootPath(fileURLToPath(new URL("..", import.meta.url)));
const MAX_OUTPUT = 20 * 1024 * 1024;
const MAX_EVIDENCE_ITEMS = 5;
const MAX_EVIDENCE_ITEM_LENGTH = 160;
const NOTE = "Read-only summary of final submission blockers. This command does not create evidence, publish repositories, upload videos, or mark external/human gates complete.";
const BLOCKER_STRING_FIELDS = ["label", "detail", "requiredEvidence"];
const COMMAND_SAFETY = {
  createsEvidenceByDefault: false,
  validatesByDefault: false,
  defaultBlockedExitCode: 1,
  placeholderOptInEnv: "SUBMISSION_NEXT_STEPS_PREPARE_PLACEHOLDERS=1",
  validationOptInEnv: "SUBMISSION_NEXT_STEPS_RUN_VALIDATION=1",
  note: "Generated commands print TODOs by default; they do not create final evidence or run validation unless explicitly opted in.",
};
const FORMATS = ["json", "summary", "markdown", "commands"];
const NEXT_STEP_STRING_FIELDS = ["label", "provide", "copyFrom", "writeTo", "validateWith"];
const NEXT_STEP_ACTION_FIELDS = ["provide", "copyFrom", "writeTo", "validateWith"];
const SCRIPT_WRITE_RECOMMENDATION = {
  preferWriteFlag: true,
  commandsWriteFlag: "--commands --write docs/reports/submission/next-steps.sh",
  commandsWriteScript: "npm run submission:next-steps:commands:write",
  nextCommandsWriteScript: "npm run submission:next-steps:next:commands:write",
  avoidShellRedirection: true,
  reason: "Use --write or the package shortcuts for commands output so npm banners are not redirected into executable bash scripts.",
};
const SUMMARY_WRITE_RECOMMENDATION = {
  preferWriteFlag: true,
  summaryWriteFlag: "--summary --write docs/reports/submission/next-steps-summary.json",
  summaryWriteScript: "npm run submission:next-steps:summary:write",
  nextSummaryWriteScript: "npm run submission:next-steps:next:summary:write",
  avoidShellRedirection: true,
  reason: "Use --summary --write or the package shortcuts for summary output so npm banners are not redirected into JSON files.",
};
const SCAFFOLD_KIND_BY_BLOCKER = {
  u6: "u6-rehearsal",
  video: "video-evidence",
  external: "external-submission",
  defense: "defense-rehearsal",
};
const CLOSURE_SEQUENCE = [
  {
    id: "local-evidence",
    order: 1,
    label: "Fill local evidence JSONs",
    blockerIds: ["u6", "video", "defense"],
    rationale: "Close rehearsal, video, and defense evidence before publishing or final submission checks.",
  },
  {
    id: "public-repo",
    order: 2,
    label: "Publish and fresh-clone the public AI system repository",
    blockerIds: ["public-repo"],
    rationale: "External evidence and final checks must point at a real fresh clone path.",
  },
  {
    id: "external-submission",
    order: 3,
    label: "Fill external submission evidence",
    blockerIds: ["external"],
    rationale: "Record real team, demo, video, public repository, and final submission fields after URLs exist.",
  },
  {
    id: "pre-submission",
    order: 4,
    label: "Run the release-day pre-submission gate",
    blockerIds: ["pre-submission"],
    rationale: "Run this only after every human and external evidence item is real.",
  },
];
const CLOSURE_ORDER_BY_BLOCKER = new Map(CLOSURE_SEQUENCE.flatMap((step) => (
  step.blockerIds.map((blockerId, index) => [blockerId, { stepOrder: step.order, index }])
)));

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const writeTarget = options.writeTo ? await resolveWriteTarget(options.writeTo) : undefined;
  const gateSummary = await runSubmissionGates(options.forwardedArgs);
  const summary = summarize(gateSummary, options);
  const output = formatSummary(summary, options.format);
  if (writeTarget) await writeOutput(writeTarget, output);
  console.log(output);
  if (summary.status === "failed") process.exit(1);
}

function parseArgs(args) {
  const options = { format: "json", forwardedArgs: [], writeTo: undefined, category: undefined, planItem: undefined, blocker: undefined, next: false };
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (name === "--json") {
      options.format = "json";
    } else if (name === "--summary") {
      options.format = "summary";
    } else if (name === "--markdown") {
      options.format = "markdown";
    } else if (name === "--commands") {
      options.format = "commands";
    } else if (name === "--next") {
      options.next = true;
    } else if (name === "--format") {
      const value = args[index + 1];
      if (isMissingFlagValue(value) || !FORMATS.includes(value)) throw new Error(usage());
      options.format = value;
      index += 1;
    } else if (name === "--u6-manifest" || name === "--public-repo") {
      const value = args[index + 1];
      if (isMissingFlagValue(value)) throw new Error(usage());
      options.forwardedArgs.push(name, value);
      index += 1;
    } else if (name === "--write") {
      const value = args[index + 1];
      if (isMissingFlagValue(value)) throw new Error(usage());
      options.writeTo = value;
      index += 1;
    } else if (name === "--category") {
      const value = args[index + 1];
      if (isMissingFlagValue(value)) throw new Error(usage());
      options.category = value;
      index += 1;
    } else if (name === "--plan-item") {
      const value = args[index + 1];
      if (isMissingFlagValue(value)) throw new Error(usage());
      options.planItem = value;
      index += 1;
    } else if (name === "--blocker") {
      const value = args[index + 1];
      if (isMissingFlagValue(value)) throw new Error(usage());
      options.blocker = value;
      index += 1;
    } else {
      throw new Error(usage());
    }
  }
  return options;
}

function isMissingFlagValue(value) {
  return value === undefined || value.startsWith("--");
}

async function runSubmissionGates(args) {
  const commandArgs = ["scripts/check-submission-gates.mjs", "--json", ...args];
  try {
    const { stdout } = await execFileAsync(process.execPath, commandArgs, execOptions());
    return requireGateSummary(stdout);
  } catch (error) {
    if (error.stdout) return requireGateSummary(error.stdout);
    throw error;
  }
}

function execOptions() {
  return {
    cwd: PROJECT_ROOT,
    env: process.env,
    maxBuffer: MAX_OUTPUT,
  };
}

function requireGateSummary(stdout) {
  const summary = parseJsonSummary(stdout);
  if (!summary) throw new Error("check-submission-gates did not emit a parseable JSON summary");
  const protocolError = gateSummaryProtocolError(summary);
  if (protocolError) throw new Error(protocolError);
  return summary;
}

function gateSummaryProtocolError(summary) {
  if (summary.mode !== "submission-gates-check") {
    return `check-submission-gates emitted unexpected mode: ${String(summary.mode)}`;
  }
  if (summary.status !== "passed" && summary.status !== "failed") {
    return `check-submission-gates emitted invalid status: ${String(summary.status)}`;
  }
  const projectRootError = projectRootProtocolError(summary.projectRoot);
  if (projectRootError) return projectRootError;
  if (!Array.isArray(summary.blockers)) {
    return "check-submission-gates summary is missing blockers[]";
  }
  const invalidBlockerIndex = summary.blockers.findIndex((blocker) => !blocker || typeof blocker !== "object" || Array.isArray(blocker));
  if (invalidBlockerIndex !== -1) {
    return `check-submission-gates summary has non-object blocker at index ${invalidBlockerIndex}`;
  }
  const invalidBlocker = summary.blockers.find((blocker) => typeof blocker.id !== "string" || !blocker.id.trim());
  if (invalidBlocker) {
    return `check-submission-gates summary has blocker with invalid id: ${String(invalidBlocker.id)}`;
  }
  const duplicateBlockerId = duplicateId(summary.blockers.map((blocker) => blocker.id));
  if (duplicateBlockerId) {
    return `check-submission-gates summary has duplicate blocker id: ${duplicateBlockerId}`;
  }
  const blockerMetadataError = blockerMetadataProtocolError(summary.blockers);
  if (blockerMetadataError) return blockerMetadataError;
  const blockerCategoryError = blockerCategoriesProtocolError(summary.blockers);
  if (blockerCategoryError) return blockerCategoryError;
  const blockerNextStepError = blockerNextStepsProtocolError(summary.blockers);
  if (blockerNextStepError) return blockerNextStepError;
  const topLevelShapeError = topLevelSummaryShapeProtocolError(summary);
  if (topLevelShapeError) return topLevelShapeError;
  const gatesError = gatesProtocolError(summary.gates);
  if (gatesError) return gatesError;
  const failedGatesError = failedGatesMatchBlockersProtocolError(summary.gates, summary.blockers);
  if (failedGatesError) return failedGatesError;
  const gateCountsError = gateCountsMatchProtocolError(summary.gateCounts, summary.gates);
  if (gateCountsError) return gateCountsError;
  const delegatedCountsError = delegatedCheckCountsMatchProtocolError(summary.delegatedCheckCounts, summary.gates);
  if (delegatedCountsError) return delegatedCountsError;
  const categoryCountsError = topLevelCategoryCountsProtocolError(summary.categoryCounts, summary.blockers);
  if (categoryCountsError) return categoryCountsError;
  const nextStepError = nextStepsProtocolError(summary.nextSteps, summary.blockers);
  if (nextStepError) return nextStepError;
  if (summary.status === "passed" && summary.blockers.length > 0) {
    return `check-submission-gates reported passed with ${summary.blockers.length} blocker(s)`;
  }
  if (summary.status === "failed" && summary.blockers.length === 0) {
    return "check-submission-gates reported failed with no blockers[]";
  }
  return null;
}

function projectRootProtocolError(projectRoot) {
  if (projectRoot === undefined) return null;
  if (typeof projectRoot !== "string" || !projectRoot.trim()) {
    return `check-submission-gates summary has invalid projectRoot: ${String(projectRoot)}`;
  }
  if (normalizeProjectRootPath(projectRoot) !== PROJECT_ROOT) {
    return `check-submission-gates summary has unexpected projectRoot: ${projectRoot}`;
  }
  return null;
}

function normalizeProjectRootPath(projectRoot) {
  const resolved = path.resolve(projectRoot);
  try {
    return realpathSync(resolved);
  } catch {
    return resolved;
  }
}

function topLevelSummaryShapeProtocolError(summary) {
  const gateCountsError = optionalCountsProtocolError(summary.gateCounts, "gateCounts");
  if (gateCountsError) return gateCountsError;
  const delegatedCountsError = optionalCountsProtocolError(summary.delegatedCheckCounts, "delegatedCheckCounts");
  if (delegatedCountsError) return delegatedCountsError;
  if (summary.blockerCount !== undefined && summary.blockerCount !== summary.blockers.length) {
    return `check-submission-gates summary has blockerCount=${String(summary.blockerCount)} for ${summary.blockers.length} blocker(s)`;
  }
  const openPlanItemsError = stringArrayProtocolError(summary.openPlanItems, "openPlanItems");
  if (openPlanItemsError) return openPlanItemsError;
  const openPlanItemsMatchError = openPlanItemsMatchProtocolError(summary.openPlanItems, summary.blockers);
  if (openPlanItemsMatchError) return openPlanItemsMatchError;
  return null;
}

function optionalCountsProtocolError(counts, context) {
  if (counts === undefined) return null;
  if (!counts || typeof counts !== "object" || Array.isArray(counts)) {
    return `check-submission-gates summary has invalid ${context}`;
  }
  for (const key of ["total", "passed", "failed"]) {
    const value = counts[key];
    if (!Number.isInteger(value) || value < 0) {
      return `check-submission-gates summary has ${context}.${key} with invalid value: ${String(value)}`;
    }
  }
  if (counts.passed + counts.failed !== counts.total) {
    return `check-submission-gates summary has inconsistent ${context}: passed + failed must equal total`;
  }
  return null;
}

function duplicateId(ids) {
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) return id;
    seen.add(id);
  }
  return null;
}

function openPlanItemsMatchProtocolError(openPlanItems, blockers) {
  if (openPlanItems === undefined) return null;
  const expected = new Set(blockers.flatMap((blocker) => blocker.planItems ?? []));
  if (openPlanItems.length !== expected.size) {
    return "check-submission-gates summary openPlanItems do not match blockers[].planItems";
  }
  for (const item of openPlanItems) {
    if (!expected.has(item)) {
      return "check-submission-gates summary openPlanItems do not match blockers[].planItems";
    }
  }
  return null;
}

function gatesProtocolError(gates) {
  if (gates === undefined) return null;
  if (!Array.isArray(gates)) return "check-submission-gates summary has invalid gates[]";
  for (let index = 0; index < gates.length; index += 1) {
    const gate = gates[index];
    if (!gate || typeof gate !== "object" || Array.isArray(gate)) {
      return `check-submission-gates summary has non-object gates entry at index ${index}`;
    }
    if (typeof gate.id !== "string" || !gate.id.trim()) {
      return `check-submission-gates summary has gates entry with invalid id: ${String(gate.id)}`;
    }
    if (gate.status !== "passed" && gate.status !== "failed") {
      return `check-submission-gates summary has gate ${gate.id} with invalid status: ${String(gate.status)}`;
    }
  }
  const duplicateGateId = duplicateId(gates.map((gate) => gate.id));
  if (duplicateGateId) {
    return `check-submission-gates summary has duplicate gate id: ${duplicateGateId}`;
  }
  return null;
}

function failedGatesMatchBlockersProtocolError(gates, blockers) {
  if (gates === undefined) return null;
  const failedGateIds = gates.filter((gate) => gate.status === "failed").map((gate) => gate.id);
  const blockerIds = blockers.map((blocker) => blocker.id);
  if (failedGateIds.length !== blockerIds.length) {
    return "check-submission-gates summary failed gates do not match blockers[]";
  }
  const blockerIdSet = new Set(blockerIds);
  for (const gateId of failedGateIds) {
    if (!blockerIdSet.has(gateId)) {
      return "check-submission-gates summary failed gates do not match blockers[]";
    }
  }
  return null;
}

function gateCountsMatchProtocolError(gateCounts, gates) {
  if (gateCounts === undefined || gates === undefined) return null;
  const actual = countGateStatuses(gates);
  if (gateCounts.total !== actual.total || gateCounts.passed !== actual.passed || gateCounts.failed !== actual.failed) {
    return "check-submission-gates summary gateCounts do not match gates[]";
  }
  return null;
}

function countGateStatuses(gates) {
  return {
    total: gates.length,
    passed: gates.filter((gate) => gate.status === "passed").length,
    failed: gates.filter((gate) => gate.status === "failed").length,
  };
}

function delegatedCheckCountsMatchProtocolError(delegatedCheckCounts, gates) {
  if (delegatedCheckCounts === undefined || gates === undefined) return null;
  const actual = countChecks(gates.flatMap((gate) => Array.isArray(gate.summary?.checks) ? gate.summary.checks : []));
  if (delegatedCheckCounts.total !== actual.total || delegatedCheckCounts.passed !== actual.passed || delegatedCheckCounts.failed !== actual.failed) {
    return "check-submission-gates summary delegatedCheckCounts do not match gates[].summary.checks";
  }
  return null;
}

function topLevelCategoryCountsProtocolError(categoryCounts, blockers) {
  if (categoryCounts === undefined) return null;
  if (!categoryCounts || typeof categoryCounts !== "object" || Array.isArray(categoryCounts)) {
    return "check-submission-gates summary has invalid categoryCounts";
  }
  const actualCounts = buildCategoryCounts(blockers);
  for (const [category, counts] of Object.entries(categoryCounts)) {
    const countsError = categoryCountEntryProtocolError(counts, `categoryCounts.${category}`);
    if (countsError) return countsError;
    if (!Object.hasOwn(actualCounts, category)) {
      return `check-submission-gates summary has categoryCounts.${category} with no matching blocker category`;
    }
  }
  for (const [category, counts] of Object.entries(actualCounts)) {
    if (!Object.hasOwn(categoryCounts, category)) {
      return `check-submission-gates summary is missing categoryCounts.${category}`;
    }
    if (categoryCounts[category].total !== counts.total || categoryCounts[category].failed !== counts.failed) {
      return `check-submission-gates summary categoryCounts.${category} does not match blocker categories`;
    }
  }
  return null;
}

function categoryCountEntryProtocolError(counts, context) {
  if (!counts || typeof counts !== "object" || Array.isArray(counts)) {
    return `check-submission-gates summary has invalid ${context}`;
  }
  for (const key of ["total", "failed"]) {
    const value = counts[key];
    if (!Number.isInteger(value) || value < 0) {
      return `check-submission-gates summary has ${context}.${key} with invalid value: ${String(value)}`;
    }
  }
  if (counts.failed > counts.total) {
    return `check-submission-gates summary has ${context}.failed=${counts.failed} above total=${counts.total}`;
  }
  return null;
}

function blockerMetadataProtocolError(blockers) {
  for (const blocker of blockers) {
    for (const key of BLOCKER_STRING_FIELDS) {
      if (blocker[key] !== undefined && (typeof blocker[key] !== "string" || !blocker[key].trim())) {
        return `check-submission-gates summary has blocker ${blocker.id}.${key} with invalid value: ${String(blocker[key])}`;
      }
    }
    const planItemsError = stringArrayProtocolError(blocker.planItems, `blocker ${blocker.id}.planItems`);
    if (planItemsError) return planItemsError;
    const detailsError = failedDetailsProtocolError(blocker.details, blocker.id);
    if (detailsError) return detailsError;
  }
  return null;
}

function stringArrayProtocolError(items, context) {
  if (items === undefined) return null;
  if (!Array.isArray(items)) return `check-submission-gates summary has ${context} with invalid value`;
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (typeof item !== "string" || !item.trim()) {
      return `check-submission-gates summary has ${context}[${index}] with invalid value: ${String(item)}`;
    }
  }
  return null;
}

function failedDetailsProtocolError(details, blockerId) {
  if (details === undefined) return null;
  if (!Array.isArray(details)) {
    return `check-submission-gates summary has blocker ${blockerId}.details with invalid value`;
  }
  for (let index = 0; index < details.length; index += 1) {
    const detail = details[index];
    if (!detail || typeof detail !== "object" || Array.isArray(detail)) {
      return `check-submission-gates summary has blocker ${blockerId}.details[${index}] with invalid value`;
    }
    for (const key of ["name", "detail"]) {
      if (typeof detail[key] !== "string" || !detail[key].trim()) {
        return `check-submission-gates summary has blocker ${blockerId}.details[${index}].${key} with invalid value: ${String(detail[key])}`;
      }
    }
    const categoryError = optionalStringProtocolError(detail.category, `blocker ${blockerId}.details[${index}].category`);
    if (categoryError) return categoryError;
    const evidenceError = stringArrayProtocolError(detail.evidence, `blocker ${blockerId}.details[${index}].evidence`);
    if (evidenceError) return evidenceError;
  }
  return null;
}

function optionalStringProtocolError(value, context) {
  if (value === undefined) return null;
  if (typeof value !== "string" || !value.trim()) {
    return `check-submission-gates summary has ${context} with invalid value: ${String(value)}`;
  }
  return null;
}

function nextStepsProtocolError(nextSteps, blockers = []) {
  if (nextSteps === undefined) return null;
  if (!Array.isArray(nextSteps)) return "check-submission-gates summary has invalid nextSteps[]";
  const blockersById = new Map(blockers.map((blocker) => [blocker.id, blocker]));
  const seenStepIds = new Set();
  for (let index = 0; index < nextSteps.length; index += 1) {
    const step = nextSteps[index];
    if (!step || typeof step !== "object" || Array.isArray(step)) {
      return `check-submission-gates summary has non-object nextSteps entry at index ${index}`;
    }
    if (typeof step.id !== "string" || !step.id.trim()) {
      return `check-submission-gates summary has nextSteps entry with invalid id: ${String(step.id)}`;
    }
    if (seenStepIds.has(step.id)) {
      return `check-submission-gates summary has duplicate nextSteps entry for blocker ${step.id}`;
    }
    seenStepIds.add(step.id);
    const blocker = blockersById.get(step.id);
    if (!blocker) {
      return `check-submission-gates summary has nextSteps entry for unknown blocker ${step.id}`;
    }
    const fieldError = nextStepFieldsProtocolError(step, `nextSteps.${step.id}`);
    if (fieldError) return fieldError;
    const mismatchError = nextStepMatchesBlockerProtocolError(step, blocker);
    if (mismatchError) return mismatchError;
  }
  return null;
}

function nextStepMatchesBlockerProtocolError(step, blocker) {
  if (blocker.nextStep === undefined) return null;
  for (const key of NEXT_STEP_ACTION_FIELDS) {
    if (step[key] !== blocker.nextStep[key]) {
      return `check-submission-gates summary nextSteps.${step.id}.${key} does not match blocker ${blocker.id} nextStep`;
    }
  }
  return null;
}

function blockerNextStepsProtocolError(blockers) {
  for (const blocker of blockers) {
    const nextStepError = optionalNextStepProtocolError(blocker.nextStep, `blocker ${blocker.id} nextStep`);
    if (nextStepError) return nextStepError;
    if (blocker.categoryNextSteps === undefined) continue;
    if (!blocker.categoryNextSteps || typeof blocker.categoryNextSteps !== "object" || Array.isArray(blocker.categoryNextSteps)) {
      return `check-submission-gates summary has blocker ${blocker.id} with invalid categoryNextSteps`;
    }
    for (const [category, step] of Object.entries(blocker.categoryNextSteps)) {
      if (!category.trim()) {
        return `check-submission-gates summary has blocker ${blocker.id} with empty categoryNextSteps name`;
      }
      if (!blocker.categories || !Object.hasOwn(blocker.categories, category)) {
        return `check-submission-gates summary has blocker ${blocker.id} categoryNextSteps.${category} with no matching category`;
      }
      const categoryStepError = optionalNextStepProtocolError(step, `blocker ${blocker.id} categoryNextSteps.${category}`);
      if (categoryStepError) return categoryStepError;
    }
  }
  return null;
}

function optionalNextStepProtocolError(step, context) {
  if (step === undefined) return null;
  if (!step || typeof step !== "object" || Array.isArray(step)) {
    return `check-submission-gates summary has ${context} with invalid value`;
  }
  return nextStepFieldsProtocolError(step, context);
}

function nextStepFieldsProtocolError(step, context) {
  for (const key of NEXT_STEP_STRING_FIELDS) {
    if (step[key] !== undefined && (typeof step[key] !== "string" || !step[key].trim())) {
      return `check-submission-gates summary has ${context}.${key} with invalid value: ${String(step[key])}`;
    }
  }
  return null;
}

function blockerCategoriesProtocolError(blockers) {
  for (const blocker of blockers) {
    if (blocker.categories === undefined) continue;
    if (!blocker.categories || typeof blocker.categories !== "object" || Array.isArray(blocker.categories)) {
      return `check-submission-gates summary has blocker ${blocker.id} with invalid categories`;
    }
    for (const [category, counts] of Object.entries(blocker.categories)) {
      if (!category.trim()) {
        return `check-submission-gates summary has blocker ${blocker.id} with empty category name`;
      }
      if (!counts || typeof counts !== "object" || Array.isArray(counts)) {
        return `check-submission-gates summary has blocker ${blocker.id} category ${category} with invalid counts`;
      }
      for (const key of ["total", "failed"]) {
        const value = counts[key];
        if (!Number.isInteger(value) || value < 0) {
          return `check-submission-gates summary has blocker ${blocker.id} category ${category} with invalid ${key}: ${String(value)}`;
        }
      }
      if (counts.failed > counts.total) {
        return `check-submission-gates summary has blocker ${blocker.id} category ${category} failed=${counts.failed} above total=${counts.total}`;
      }
    }
  }
  return null;
}

function summarize(gateSummary, options = {}) {
  const blockers = Array.isArray(gateSummary.blockers) ? gateSummary.blockers : [];
  const categoryFilter = options.category;
  const planItemFilter = options.planItem;
  const blockerFilter = options.blocker;
  const nextOnly = Boolean(options.next);
  const availableFilters = buildAvailableFilters(blockers, gateSummary.openPlanItems);
  const baseFilteredBlockers = blockers.filter((blocker) => blockerMatchesFilters(blocker, { categoryFilter, planItemFilter, blockerFilter }));
  const fullGateFirstOpenClosureStep = firstClosureStep(blockers);
  const firstOpenClosureStep = firstClosureStep(baseFilteredBlockers);
  const nextClosureStep = nextOnly ? firstOpenClosureStep : undefined;
  const filteredBlockers = nextClosureStep
    ? baseFilteredBlockers.filter((blocker) => nextClosureStep.blockerIds.includes(blocker.id))
    : baseFilteredBlockers;
  const orderedFilteredBlockers = sortBlockersByClosure(filteredBlockers);
  const focusedNextSteps = buildFocusedNextSteps(gateSummary.nextSteps, orderedFilteredBlockers, categoryFilter);
  const filterWarnings = buildFilterWarnings({ categoryFilter, planItemFilter, blockerFilter, availableFilters });
  const fullGateSuggestedNextCommand = buildFullGateSuggestedNextCommand({ fullGateFirstOpenClosureStep, nextOnly, format: options.format, forwardedArgs: options.forwardedArgs });
  const suggestedNextCommand = buildSuggestedNextCommand({ firstOpenClosureStep, nextOnly, categoryFilter, planItemFilter, blockerFilter, format: options.format, forwardedArgs: options.forwardedArgs });
  const nextClosureCommandsWriteCommand = buildNextClosureCommandsWriteCommand({
    firstOpenClosureStep,
    categoryFilter,
    planItemFilter,
    blockerFilter,
    forwardedArgs: options.forwardedArgs,
  });
  const nextClosureSummaryWriteCommand = buildNextClosureSummaryWriteCommand({
    firstOpenClosureStep,
    categoryFilter,
    planItemFilter,
    blockerFilter,
    forwardedArgs: options.forwardedArgs,
  });
  const currentViewCommandsWriteCommand = buildCurrentViewCommandsWriteCommand({ nextOnly, categoryFilter, planItemFilter, blockerFilter, forwardedArgs: options.forwardedArgs });
  const currentViewSummaryWriteCommand = buildCurrentViewSummaryWriteCommand({ nextOnly, categoryFilter, planItemFilter, blockerFilter, forwardedArgs: options.forwardedArgs });
  const currentViewNextCommand = buildCurrentViewNextCommand({
    suggestedNextCommand,
    currentViewCommandsWriteCommand,
    filteredBlockerCount: orderedFilteredBlockers.length,
  });
  const checks = blockers.length > 0
    ? orderedFilteredBlockers.map((blocker) => ({
      name: blocker.id ?? "submission-gates",
      status: "failed",
      detail: blocker.detail ?? blocker.requiredEvidence ?? "failed",
    }))
    : [];
  if (checks.length === 0 && gateSummary.status !== "passed" && !hasFilters({ nextOnly, categoryFilter, planItemFilter, blockerFilter })) {
    checks.push({ name: "submission-gates", status: "failed", detail: "submission gate summary is missing blockers[]" });
  }
  const actionPlan = buildActionPlan(focusedNextSteps);
  const evidenceChecklist = buildEvidenceChecklist(orderedFilteredBlockers, categoryFilter);
  const closureSequence = buildClosureSequence(orderedFilteredBlockers, categoryFilter);
  const closureProgressSummary = buildClosureProgressSummary({
    fullBlockers: blockers,
    viewBlockers: orderedFilteredBlockers,
    fullGateFirstOpenClosureStep,
    viewFirstOpenClosureStep: firstOpenClosureStep,
  });
  const nextClosureBlockers = firstOpenClosureStep
    ? sortBlockersByClosure(baseFilteredBlockers.filter((blocker) => firstOpenClosureStep.blockerIds.includes(blocker.id)))
    : [];
  const nextClosureFocusedNextSteps = buildFocusedNextSteps(gateSummary.nextSteps, nextClosureBlockers, categoryFilter);
  const nextClosureActionPlan = buildActionPlan(nextClosureFocusedNextSteps);
  const nextClosureEvidenceChecklist = buildEvidenceChecklist(nextClosureBlockers, categoryFilter);
  const summaryStatus = gateSummary.status === "passed" && blockers.length === 0 ? "passed" : "failed";
  const actionSummary = buildActionSummary({
    blockers: orderedFilteredBlockers,
    actionPlan,
    evidenceChecklist,
    status: summaryStatus,
    fullBlockerCount: blockers.length,
    hiddenBlockerCount: Math.max(0, blockers.length - filteredBlockers.length),
  });
  const nextClosureActionSummary = buildActionSummary({
    blockers: nextClosureBlockers,
    actionPlan: nextClosureActionPlan,
    evidenceChecklist: nextClosureEvidenceChecklist,
    status: summaryStatus,
    fullBlockerCount: blockers.length,
    hiddenBlockerCount: Math.max(0, blockers.length - nextClosureBlockers.length),
  });
  return {
    mode: "submission-next-steps",
    status: summaryStatus,
    projectRoot: gateSummary.projectRoot ?? PROJECT_ROOT,
    sourceMode: gateSummary.mode,
    gateCounts: gateSummary.gateCounts,
    delegatedCheckCounts: gateSummary.delegatedCheckCounts,
    blockerCount: blockers.length,
    filteredBlockerCount: filteredBlockers.length,
    nextOnly,
    fullGateFirstOpenClosureStep: compactClosureStep(fullGateFirstOpenClosureStep),
    firstOpenClosureStep: compactClosureStep(firstOpenClosureStep),
    forwardedGateArgs: gateArgsToPairs(options.forwardedArgs),
    fullGateSuggestedNextCommand,
    suggestedNextCommand,
    nextClosureCommandsWriteCommand,
    nextClosureSummaryWriteCommand,
    currentViewNextCommand,
    currentViewCommandsWriteCommand,
    currentViewSummaryWriteCommand,
    nextClosureStep: compactClosureStep(nextClosureStep),
    categoryFilter,
    planItemFilter,
    blockerFilter,
    filterState: buildFilterState({
      nextOnly,
      categoryFilter,
      planItemFilter,
      blockerFilter,
      blockerCount: blockers.length,
      baseFilteredBlockerCount: baseFilteredBlockers.length,
      filteredBlockerCount: filteredBlockers.length,
      filterWarnings,
    }),
    prerequisiteState: buildPrerequisiteState({
      blockers,
      viewFirstStep: firstOpenClosureStep,
      fullGateFirstStep: fullGateFirstOpenClosureStep,
      filtersActive: hasFilters({ nextOnly, categoryFilter, planItemFilter, blockerFilter }),
    }),
    completionSemantics: buildCompletionSemantics({
      status: gateSummary.status === "passed" && blockers.length === 0 ? "passed" : "failed",
      blockerCount: blockers.length,
      filteredBlockerCount: filteredBlockers.length,
      filtersActive: hasFilters({ nextOnly, categoryFilter, planItemFilter, blockerFilter }),
      hiddenBlockerCount: Math.max(0, blockers.length - filteredBlockers.length),
    }),
    nextStepFocus: buildNextStepFocus(orderedFilteredBlockers, categoryFilter),
    availableFilters,
    filterWarnings,
    openPlanItems: Array.isArray(gateSummary.openPlanItems) ? gateSummary.openPlanItems : [],
    blockers: orderedFilteredBlockers.map((blocker) => compactBlocker(blocker, categoryFilter)),
    nextSteps: Array.isArray(gateSummary.nextSteps) ? gateSummary.nextSteps : [],
    focusedNextSteps,
    actionPlan,
    evidenceChecklist,
    actionSummary,
    nextClosureActionSummary,
    actionWarnings: buildCombinedActionWarnings(actionSummary, nextClosureActionSummary),
    closureSequence,
    closureProgressSummary,
    planItemBlockers: buildPlanItemBlockers(orderedFilteredBlockers, gateSummary.openPlanItems, { nextOnly, categoryFilter, planItemFilter, blockerFilter }),
    categoryCounts: buildCategoryCounts(blockers),
    categoryBlockers: buildCategoryBlockers(orderedFilteredBlockers, categoryFilter),
    checks,
    checkCounts: countChecks(checks),
    safety: COMMAND_SAFETY,
    scriptWriteRecommendation: SCRIPT_WRITE_RECOMMENDATION,
    summaryWriteRecommendation: SUMMARY_WRITE_RECOMMENDATION,
    note: NOTE,
  };
}

function buildPrerequisiteState({ blockers, viewFirstStep, fullGateFirstStep, filtersActive }) {
  const viewStartsAfterFullGate = Boolean(
    filtersActive
      && viewFirstStep
      && fullGateFirstStep
      && viewFirstStep.order > fullGateFirstStep.order,
  );
  const skippedClosureSteps = viewStartsAfterFullGate
    ? buildSkippedPrerequisiteSteps(blockers, viewFirstStep)
    : [];
  return {
    filtersActive,
    fullGateFirstOpenClosureStep: compactClosureStep(fullGateFirstStep),
    viewFirstOpenClosureStep: compactClosureStep(viewFirstStep),
    viewStartsAfterFullGate,
    skippedClosureSteps,
    skippedClosureStepCount: skippedClosureSteps.length,
    note: viewStartsAfterFullGate
      ? "This filtered view starts after earlier full-gate closure steps; complete skipped prerequisites before treating this view as a release-day path."
      : "This view does not skip earlier full-gate closure steps.",
  };
}

function buildSkippedPrerequisiteSteps(blockers, viewFirstStep) {
  const blockerIds = new Set(blockers.map((blocker) => blocker.id));
  return CLOSURE_SEQUENCE
    .filter((step) => step.order < viewFirstStep.order)
    .map((step) => {
      const blockersInStep = step.blockerIds.filter((id) => blockerIds.has(id));
      if (!blockersInStep.length) return undefined;
      return {
        ...compactClosureStep(step),
        blockers: blockersInStep,
      };
    })
    .filter(Boolean);
}

function buildCompletionSemantics({ status, blockerCount, filteredBlockerCount, filtersActive, hiddenBlockerCount }) {
  const canMarkSubmissionComplete = status === "passed" && blockerCount === 0;
  return {
    fullGateStatus: status,
    fullGateBlockerCount: blockerCount,
    viewBlockerCount: filteredBlockerCount,
    viewFiltered: filtersActive,
    hiddenBlockerCount,
    filtersChangeCompletion: false,
    exitCodeReflectsFullGate: true,
    canMarkSubmissionComplete,
    note: canMarkSubmissionComplete
      ? "Full submission gate is passed with zero blockers."
      : "Only an unblocked full submission gate can mark the project complete; filtered views and focused validation do not change completion status.",
  };
}

function compactClosureStep(step) {
  if (!step) return undefined;
  return {
    id: step.id,
    order: step.order,
    label: step.label,
    rationale: step.rationale,
  };
}

function buildSuggestedNextCommand({ firstOpenClosureStep, nextOnly, categoryFilter, planItemFilter, blockerFilter, format, forwardedArgs = [] }) {
  if (!firstOpenClosureStep) return undefined;
  const args = ["--next"];
  if (categoryFilter) args.push("--category", categoryFilter);
  if (planItemFilter) args.push("--plan-item", planItemFilter);
  if (blockerFilter) args.push("--blocker", blockerFilter);
  args.push(...forwardedArgs);
  if (format === "markdown") args.push("--markdown");
  if (format === "commands") args.push("--commands");
  return `npm run submission:next-steps -- ${args.map(shellArg).join(" ")}`;
}

function buildFullGateSuggestedNextCommand({ fullGateFirstOpenClosureStep, nextOnly, format, forwardedArgs = [] }) {
  if (!fullGateFirstOpenClosureStep) return undefined;
  const args = ["--next"];
  args.push(...forwardedArgs);
  if (format === "markdown") args.push("--markdown");
  if (format === "commands") args.push("--commands");
  return `npm run submission:next-steps -- ${args.map(shellArg).join(" ")}`;
}

function buildNextClosureCommandsWriteCommand({ firstOpenClosureStep, categoryFilter, planItemFilter, blockerFilter, forwardedArgs = [] }) {
  if (!firstOpenClosureStep) return undefined;
  const args = ["--next"];
  if (categoryFilter) args.push("--category", categoryFilter);
  if (planItemFilter) args.push("--plan-item", planItemFilter);
  if (blockerFilter) args.push("--blocker", blockerFilter);
  args.push(...forwardedArgs);
  args.push("--commands", "--write", "docs/reports/submission/next-steps.sh");
  return `npm run submission:next-steps -- ${args.map(shellArg).join(" ")}`;
}

function buildNextClosureSummaryWriteCommand({ firstOpenClosureStep, categoryFilter, planItemFilter, blockerFilter, forwardedArgs = [] }) {
  if (!firstOpenClosureStep) return undefined;
  const args = ["--next"];
  if (categoryFilter) args.push("--category", categoryFilter);
  if (planItemFilter) args.push("--plan-item", planItemFilter);
  if (blockerFilter) args.push("--blocker", blockerFilter);
  args.push(...forwardedArgs);
  args.push("--summary", "--write", "docs/reports/submission/next-steps-summary.json");
  return `npm run submission:next-steps -- ${args.map(shellArg).join(" ")}`;
}

function buildCurrentViewNextCommand({ suggestedNextCommand, currentViewCommandsWriteCommand, filteredBlockerCount }) {
  if (suggestedNextCommand) return suggestedNextCommand;
  if (filteredBlockerCount > 0) return currentViewCommandsWriteCommand;
  return undefined;
}

function buildCurrentViewCommandsWriteCommand({ nextOnly, categoryFilter, planItemFilter, blockerFilter, forwardedArgs = [] }) {
  const args = [];
  if (nextOnly) args.push("--next");
  if (categoryFilter) args.push("--category", categoryFilter);
  if (planItemFilter) args.push("--plan-item", planItemFilter);
  if (blockerFilter) args.push("--blocker", blockerFilter);
  args.push(...forwardedArgs);
  args.push("--commands", "--write", "docs/reports/submission/next-steps.sh");
  return `npm run submission:next-steps -- ${args.map(shellArg).join(" ")}`;
}

function buildCurrentViewSummaryWriteCommand({ nextOnly, categoryFilter, planItemFilter, blockerFilter, forwardedArgs = [] }) {
  const args = [];
  if (nextOnly) args.push("--next");
  if (categoryFilter) args.push("--category", categoryFilter);
  if (planItemFilter) args.push("--plan-item", planItemFilter);
  if (blockerFilter) args.push("--blocker", blockerFilter);
  args.push(...forwardedArgs);
  args.push("--summary", "--write", "docs/reports/submission/next-steps-summary.json");
  return `npm run submission:next-steps -- ${args.map(shellArg).join(" ")}`;
}

function gateArgsToPairs(args = []) {
  const pairs = [];
  for (let index = 0; index < args.length; index += 2) {
    pairs.push({ name: args[index], value: args[index + 1] });
  }
  return pairs;
}

function blockerMatchesFilters(blocker, { categoryFilter, planItemFilter, blockerFilter }) {
  if (blockerFilter && blocker.id !== blockerFilter) return false;
  if (categoryFilter && !blockerHasCategory(blocker, categoryFilter)) return false;
  if (planItemFilter && !blockerHasPlanItem(blocker, planItemFilter)) return false;
  return true;
}

function firstClosureStep(blockers) {
  if (!Array.isArray(blockers) || blockers.length === 0) return undefined;
  const ids = new Set(blockers.map((blocker) => blocker.id));
  return CLOSURE_SEQUENCE.find((step) => step.blockerIds.some((id) => ids.has(id)));
}

function blockerHasCategory(blocker, category) {
  return Boolean(blocker.categories && Object.hasOwn(blocker.categories, category));
}

function blockerHasPlanItem(blocker, planItem) {
  return Array.isArray(blocker.planItems) && blocker.planItems.includes(planItem);
}

function hasFilters({ nextOnly, categoryFilter, planItemFilter, blockerFilter }) {
  return Boolean(nextOnly || categoryFilter || planItemFilter || blockerFilter);
}

function buildFilterState({ nextOnly, categoryFilter, planItemFilter, blockerFilter, blockerCount, baseFilteredBlockerCount, filteredBlockerCount, filterWarnings }) {
  const filtersActive = hasFilters({ nextOnly, categoryFilter, planItemFilter, blockerFilter });
  const hiddenBlockerCount = Math.max(0, blockerCount - filteredBlockerCount);
  return {
    filtersActive,
    nextOnly,
    exactFilter: stripEmpty({
      blocker: blockerFilter,
      category: categoryFilter,
      planItem: planItemFilter,
    }),
    baseFilteredBlockerCount,
    filteredBlockerCount,
    hiddenBlockerCount,
    hasUnknownFilters: Boolean(filterWarnings?.length),
    emptyBecauseOfFilters: filtersActive && blockerCount > 0 && filteredBlockerCount === 0,
    note: filtersActive
      ? `Filtered view shows ${filteredBlockerCount} of ${blockerCount} blockers; full gate status is unchanged.`
      : "Unfiltered view shows all blockers.",
  };
}

function buildNextStepFocus(blockers, categoryFilter) {
  if (!categoryFilter) {
    return {
      mode: "default",
      usesCategoryNextSteps: false,
      focusedBlockers: [],
      fallbackBlockers: [],
      note: "Using each blocker nextStep without category overrides.",
    };
  }
  const focusedBlockers = [];
  const fallbackBlockers = [];
  for (const blocker of blockers) {
    if (blocker?.categoryNextSteps && Object.hasOwn(blocker.categoryNextSteps, categoryFilter)) {
      focusedBlockers.push(blocker.id);
    } else if (blocker?.id) {
      fallbackBlockers.push(blocker.id);
    }
  }
  return {
    mode: "category",
    category: categoryFilter,
    usesCategoryNextSteps: focusedBlockers.length > 0,
    focusedBlockers,
    fallbackBlockers,
    note: focusedBlockers.length
      ? "Category-specific nextStep overrides are applied to focused derived views."
      : "No category-specific nextStep overrides were available for the focused blockers; using blocker nextStep.",
  };
}

function buildAvailableFilters(blockers, openPlanItems = []) {
  const categories = new Map();
  const planItems = new Map();
  const blockerIds = [];
  for (const blocker of blockers) {
    if (blocker.id) blockerIds.push(blocker.id);
    for (const [name, counts] of Object.entries(blocker.categories ?? {})) {
      const current = categories.get(name) ?? { name, blockerCount: 0, failed: 0, total: 0, blockers: [] };
      current.blockerCount += 1;
      current.failed += counts.failed ?? counts.total ?? 0;
      current.total += counts.total ?? counts.failed ?? 0;
      current.blockers.push(blocker.id);
      categories.set(name, current);
    }
    for (const name of blocker.planItems ?? []) {
      const current = planItems.get(name) ?? { name, blockerCount: 0, blockers: [] };
      current.blockerCount += 1;
      current.blockers.push(blocker.id);
      planItems.set(name, current);
    }
  }
  return {
    blockers: blockerIds.sort((left, right) => left.localeCompare(right)),
    categories: [...categories.values()].sort((left, right) => left.name.localeCompare(right.name)),
    planItems: sortPlanItemFilters([...planItems.values()], openPlanItems),
  };
}

function sortPlanItemFilters(items, openPlanItems) {
  const order = new Map(Array.isArray(openPlanItems) ? openPlanItems.map((item, index) => [item, index]) : []);
  return items.sort((left, right) => {
    const leftIndex = order.get(left.name);
    const rightIndex = order.get(right.name);
    if (leftIndex !== undefined || rightIndex !== undefined) {
      if (leftIndex === undefined) return 1;
      if (rightIndex === undefined) return -1;
      return leftIndex - rightIndex;
    }
    return comparePlanItemFilters(left, right);
  });
}

function comparePlanItemFilters(left, right) {
  return left.name.localeCompare(right.name, undefined, { numeric: true });
}

function buildFilterWarnings({ categoryFilter, planItemFilter, blockerFilter, availableFilters }) {
  const warnings = [];
  const blockers = new Set(availableFilters?.blockers ?? []);
  const categories = new Set((availableFilters?.categories ?? []).map((category) => category.name));
  const planItems = new Set((availableFilters?.planItems ?? []).map((planItem) => planItem.name));
  if (blockerFilter && !blockers.has(blockerFilter)) {
    warnings.push({
      type: "unknown-blocker",
      filter: blockerFilter,
      message: `Unknown blocker filter ${blockerFilter}`,
      available: [...blockers],
    });
  }
  if (categoryFilter && !categories.has(categoryFilter)) {
    warnings.push({
      type: "unknown-category",
      filter: categoryFilter,
      message: `Unknown category filter ${categoryFilter}`,
      available: [...categories],
    });
  }
  if (planItemFilter && !planItems.has(planItemFilter)) {
    warnings.push({
      type: "unknown-plan-item",
      filter: planItemFilter,
      message: `Unknown plan item filter ${planItemFilter}`,
      available: [...planItems],
    });
  }
  return warnings;
}

function filterNextSteps(nextSteps, blockers) {
  if (!Array.isArray(nextSteps)) return [];
  const blockerIds = new Set(blockers.map((blocker) => blocker.id));
  return nextSteps.filter((step) => blockerIds.has(step.id));
}

function buildFocusedNextSteps(nextSteps, blockers, categoryFilter) {
  if (!categoryFilter) return sortNextStepsByClosure(filterNextSteps(nextSteps, blockers));
  return sortNextStepsByClosure(blockers.map((blocker) => focusedNextStep(blocker, categoryFilter)).filter(Boolean));
}

function focusedNextStep(blocker, categoryFilter) {
  const nextStep = effectiveNextStep(blocker, categoryFilter);
  if (!nextStep) return undefined;
  return {
    id: blocker.id,
    label: blocker.label,
    ...nextStep,
  };
}

function effectiveNextStep(blocker, categoryFilter) {
  return categoryFilter
    ? blocker.categoryNextSteps?.[categoryFilter] ?? blocker.nextStep
    : blocker.nextStep;
}

function sortBlockersByClosure(blockers) {
  return sortByClosure(blockers, (blocker) => blocker.id);
}

function sortNextStepsByClosure(nextSteps) {
  return sortByClosure(nextSteps, (step) => step.id);
}

function sortByClosure(items, getId) {
  return [...items].sort((left, right) => compareClosureIds(getId(left), getId(right)));
}

function compareClosureIds(leftId, rightId) {
  const left = CLOSURE_ORDER_BY_BLOCKER.get(leftId) ?? { stepOrder: 99, index: 99 };
  const right = CLOSURE_ORDER_BY_BLOCKER.get(rightId) ?? { stepOrder: 99, index: 99 };
  if (left.stepOrder !== right.stepOrder) return left.stepOrder - right.stepOrder;
  if (left.index !== right.index) return left.index - right.index;
  return String(leftId ?? "").localeCompare(String(rightId ?? ""));
}

function compactBlocker(blocker, categoryFilter) {
  const nextStep = effectiveNextStep(blocker, categoryFilter);
  return stripEmpty({
    id: blocker.id,
    label: blocker.label,
    planItems: blocker.planItems,
    detail: blocker.detail,
    categories: compactCategories(blocker.categories, categoryFilter),
    failedChecks: compactFailedChecks(blocker.details, categoryFilter),
    requiredEvidence: blocker.requiredEvidence,
    nextStep,
  });
}

function compactFailedChecks(details, categoryFilter) {
  if (!Array.isArray(details)) return undefined;
  const checks = categoryFilter
    ? details.filter((detail) => detail.name === categoryFilter || detail.category === categoryFilter)
    : details;
  return (checks.length ? checks : details).map(compactFailedCheck);
}

function compactFailedCheck(check) {
  return stripEmpty({
    name: check.name,
    detail: check.detail,
    evidenceSummary: compactEvidenceSummary(check.evidence),
  });
}

function compactEvidenceChecks(details, categoryFilter) {
  const checks = compactFailedChecks(details, categoryFilter)?.filter((check) => check.evidenceSummary);
  return checks?.length ? checks : undefined;
}

function compactEvidenceSummary(evidence) {
  if (!Array.isArray(evidence) || evidence.length === 0) return undefined;
  const items = evidence.slice(0, MAX_EVIDENCE_ITEMS).map(formatEvidenceItem).filter(Boolean);
  return stripEmpty({
    total: evidence.length,
    shown: items.length,
    omitted: Math.max(0, evidence.length - items.length) || undefined,
    items,
  });
}

function formatEvidenceItem(item) {
  const text = typeof item === "string" ? item : JSON.stringify(item);
  const normalized = escapeControlChars(text).replace(/\s+/gu, " ").trim();
  if (normalized.length <= MAX_EVIDENCE_ITEM_LENGTH) return normalized;
  return `${normalized.slice(0, MAX_EVIDENCE_ITEM_LENGTH - 3)}...`;
}

function compactCategories(categories, categoryFilter) {
  if (!categories || !categoryFilter) return categories;
  if (!Object.hasOwn(categories, categoryFilter)) return undefined;
  return { [categoryFilter]: categories[categoryFilter] };
}

function stripEmpty(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function buildActionPlan(nextSteps) {
  if (!Array.isArray(nextSteps)) return [];
  return nextSteps.map((step) => stripEmpty({
    id: step.id,
    label: step.label,
    manualInput: step.provide,
    copyCommand: buildCopyCommand(step),
    copySafety: step.copyFrom && step.writeTo ? {
      createsFinalEvidence: true,
      optInRequired: true,
      optInEnv: COMMAND_SAFETY.placeholderOptInEnv,
      preferredCommand: step.id && SCAFFOLD_KIND_BY_BLOCKER[step.id]
        ? `npm run scaffold:submission-evidence -- --kind ${SCAFFOLD_KIND_BY_BLOCKER[step.id]} --copy-final`
        : undefined,
    } : undefined,
    copyFinalCommand: step.id && SCAFFOLD_KIND_BY_BLOCKER[step.id]
      ? `npm run scaffold:submission-evidence -- --kind ${SCAFFOLD_KIND_BY_BLOCKER[step.id]} --copy-final`
      : undefined,
    editTarget: step.writeTo,
    validateCommand: step.validateWith,
    validationSafety: buildValidationSafety(step.validateWith),
  }));
}

function buildEvidenceChecklist(blockers, categoryFilter) {
  const evidenceFiles = [];
  const manualInputs = [];
  const validationCommands = [];
  for (const blocker of blockers) {
    const nextStep = effectiveNextStep(blocker, categoryFilter) ?? {};
    if (nextStep.writeTo) {
      const scaffoldKind = SCAFFOLD_KIND_BY_BLOCKER[blocker.id];
      evidenceFiles.push(stripEmpty({
        id: blocker.id,
        label: blocker.label,
        path: nextStep.writeTo,
        template: nextStep.copyFrom,
        scaffoldKind,
        scaffoldCommand: scaffoldKind ? `npm run scaffold:submission-evidence -- --kind ${scaffoldKind} --commands` : undefined,
        copyFinalCommand: scaffoldKind ? `npm run scaffold:submission-evidence -- --kind ${scaffoldKind} --copy-final` : undefined,
        copySafety: scaffoldKind ? {
          createsFinalEvidence: true,
          optInRequired: true,
          optInEnv: COMMAND_SAFETY.placeholderOptInEnv,
        } : undefined,
        requiredEvidence: blocker.requiredEvidence,
        validateCommand: nextStep.validateWith,
        validationSafety: buildValidationSafety(nextStep.validateWith),
      }));
    }
    if (nextStep.provide) {
      manualInputs.push(stripEmpty({
        id: blocker.id,
        label: blocker.label,
        input: nextStep.provide,
        requiredEvidence: blocker.requiredEvidence,
        validateCommand: nextStep.validateWith,
        validationSafety: buildValidationSafety(nextStep.validateWith),
      }));
    }
    if (nextStep.validateWith) {
      validationCommands.push({
        id: blocker.id,
        label: blocker.label,
        command: nextStep.validateWith,
        safety: buildValidationSafety(nextStep.validateWith),
      });
    }
  }
  return {
    evidenceFiles,
    manualInputs,
    validationCommands,
  };
}

function buildActionSummary({ blockers, actionPlan, evidenceChecklist, status, fullBlockerCount, hiddenBlockerCount }) {
  const blockerIds = blockers.map((blocker) => blocker.id).filter(Boolean);
  const evidenceFiles = evidenceChecklist.evidenceFiles ?? [];
  const manualInputs = evidenceChecklist.manualInputs ?? [];
  const validationCommands = evidenceChecklist.validationCommands ?? [];
  const prepareActionIds = new Set([
    ...evidenceFiles.map((item) => item.id).filter(Boolean),
    ...manualInputs.map((item) => item.id).filter(Boolean),
  ]);
  const validationCommandIds = new Set(validationCommands.map((item) => item.id).filter(Boolean));
  const blockersWithScaffold = actionPlan.filter((action) => action.copyFinalCommand).map((action) => action.id);
  const blockersRequiringFreshClonePath = validationCommands
    .filter((item) => item.safety?.mayRequireFreshClonePath)
    .map((item) => item.id);
  return {
    status,
    blockerCount: blockerIds.length,
    fullBlockerCount,
    hiddenBlockerCount,
    blockerIds,
    evidenceFileCount: evidenceFiles.length,
    manualInputCount: manualInputs.length,
    validationCommandCount: validationCommands.length,
    blockersWithScaffold,
    blockersRequiringFreshClonePath,
    blockersWithoutPrepareAction: blockerIds.filter((id) => !prepareActionIds.has(id)),
    blockersWithoutValidationCommand: blockerIds.filter((id) => !validationCommandIds.has(id)),
    requiresManualEvidence: evidenceFiles.length + manualInputs.length > 0,
    canValidateLocally: validationCommands.length > 0,
    commandsCreateEvidenceByDefault: COMMAND_SAFETY.createsEvidenceByDefault,
    validationRunsByDefault: COMMAND_SAFETY.validatesByDefault,
  };
}

function buildActionWarnings(actionSummary, scope) {
  if (!actionSummary || actionSummary.blockerCount === 0) return [];
  const warnings = [];
  if (actionSummary.blockersWithoutPrepareAction.length) {
    warnings.push({
      type: "missing-prepare-action",
      scope,
      blockerIds: actionSummary.blockersWithoutPrepareAction,
      detail: "These blockers have validation guidance but no evidence file or manual input preparation step in this view.",
    });
  }
  if (actionSummary.blockersWithoutValidationCommand.length) {
    warnings.push({
      type: "missing-validation-command",
      scope,
      blockerIds: actionSummary.blockersWithoutValidationCommand,
      detail: "These blockers have preparation guidance but no local validation command in this view.",
    });
  }
  return warnings;
}

function buildCombinedActionWarnings(actionSummary, nextClosureActionSummary) {
  return [
    ...buildActionWarnings(actionSummary, "current-view"),
    ...buildActionWarnings(nextClosureActionSummary, "next-closure"),
  ];
}

function buildClosureSequence(blockers, categoryFilter) {
  if (!Array.isArray(blockers) || blockers.length === 0) return [];
  const blockerById = new Map(blockers.map((blocker) => [blocker.id, blocker]));
  const knownIds = new Set(CLOSURE_SEQUENCE.flatMap((step) => step.blockerIds));
  const steps = CLOSURE_SEQUENCE
    .map((step) => {
      const stepBlockers = step.blockerIds
        .map((id) => blockerById.get(id))
        .filter(Boolean);
      if (!stepBlockers.length) return undefined;
      return {
        id: step.id,
        order: step.order,
        label: step.label,
        rationale: step.rationale,
        blockers: stepBlockers.map((blocker) => compactSequenceBlocker(blocker, categoryFilter)),
      };
    })
    .filter(Boolean);
  const unknownBlockers = blockers
    .filter((blocker) => blocker.id && !knownIds.has(blocker.id))
    .map((blocker) => compactSequenceBlocker(blocker, categoryFilter));
  if (unknownBlockers.length) {
    steps.push({
      id: "other",
      order: 99,
      label: "Resolve remaining blockers",
      rationale: "These blockers are not in the known final-submission closure order.",
      blockers: unknownBlockers,
    });
  }
  return steps;
}

function buildClosureProgressSummary({ fullBlockers, viewBlockers, fullGateFirstOpenClosureStep, viewFirstOpenClosureStep }) {
  const fullIds = new Set((Array.isArray(fullBlockers) ? fullBlockers : []).map((blocker) => blocker.id).filter(Boolean));
  const viewIds = new Set((Array.isArray(viewBlockers) ? viewBlockers : []).map((blocker) => blocker.id).filter(Boolean));
  const fullKnownIds = new Set(CLOSURE_SEQUENCE.flatMap((step) => step.blockerIds));
  const steps = CLOSURE_SEQUENCE.map((step) => {
    const fullOpenBlockers = step.blockerIds.filter((id) => fullIds.has(id));
    const viewOpenBlockers = step.blockerIds.filter((id) => viewIds.has(id));
    return {
      id: step.id,
      order: step.order,
      label: step.label,
      fullOpenBlockers,
      viewOpenBlockers,
      fullOpenCount: fullOpenBlockers.length,
      viewOpenCount: viewOpenBlockers.length,
      firstFullOpen: fullGateFirstOpenClosureStep?.id === step.id,
      firstViewOpen: viewFirstOpenClosureStep?.id === step.id,
      status: fullOpenBlockers.length ? "open" : "closed",
      viewStatus: viewOpenBlockers.length ? "open" : "closed-or-filtered",
    };
  });
  const unknownFullOpenBlockers = [...fullIds].filter((id) => !fullKnownIds.has(id));
  const unknownViewOpenBlockers = [...viewIds].filter((id) => !fullKnownIds.has(id));
  if (unknownFullOpenBlockers.length || unknownViewOpenBlockers.length) {
    steps.push({
      id: "other",
      order: 99,
      label: "Resolve remaining blockers",
      fullOpenBlockers: unknownFullOpenBlockers,
      viewOpenBlockers: unknownViewOpenBlockers,
      fullOpenCount: unknownFullOpenBlockers.length,
      viewOpenCount: unknownViewOpenBlockers.length,
      firstFullOpen: fullGateFirstOpenClosureStep?.id === "other",
      firstViewOpen: viewFirstOpenClosureStep?.id === "other",
      status: unknownFullOpenBlockers.length ? "open" : "closed",
      viewStatus: unknownViewOpenBlockers.length ? "open" : "closed-or-filtered",
    });
  }
  return {
    fullOpenCount: fullIds.size,
    viewOpenCount: viewIds.size,
    fullFirstOpenStep: compactClosureStep(fullGateFirstOpenClosureStep),
    viewFirstOpenStep: compactClosureStep(viewFirstOpenClosureStep),
    steps,
  };
}

function compactSequenceBlocker(blocker, categoryFilter) {
  const nextStep = effectiveNextStep(blocker, categoryFilter);
  return stripEmpty({
    id: blocker.id,
    label: blocker.label,
    planItems: blocker.planItems,
    validateCommand: nextStep?.validateWith,
    validationSafety: buildValidationSafety(nextStep?.validateWith),
  });
}

function buildPlanItemBlockers(blockers, openPlanItems, { nextOnly, categoryFilter, planItemFilter, blockerFilter } = {}) {
  if (!Array.isArray(openPlanItems)) return [];
  const planItems = planItemFilter ? [planItemFilter] : openPlanItems;
  return planItems
    .map((planItem) => ({
      planItem,
      blockers: blockers
      .filter((blocker) => Array.isArray(blocker.planItems) && blocker.planItems.includes(planItem))
      .map((blocker) => stripEmpty({
        id: blocker.id,
        label: blocker.label,
        detail: blocker.detail,
        validateCommand: effectiveNextStep(blocker, categoryFilter)?.validateWith,
        validationSafety: buildValidationSafety(effectiveNextStep(blocker, categoryFilter)?.validateWith),
      })),
    }))
    .filter((item) => !hasFilters({ nextOnly, categoryFilter, planItemFilter, blockerFilter }) || item.blockers.length);
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

function buildCategoryBlockers(blockers, categoryFilter) {
  const categories = new Map();
  for (const blocker of blockers) {
    if (!blocker.categories) continue;
    for (const [name, counts] of Object.entries(blocker.categories)) {
      if (categoryFilter && name !== categoryFilter) continue;
      const entry = categories.get(name) ?? {
        name,
        total: 0,
        failed: 0,
        blockers: [],
      };
      const failed = counts.failed ?? counts.total ?? 0;
      const total = counts.total ?? failed;
      entry.total += total;
      entry.failed += failed;
      entry.blockers.push(stripEmpty({
        id: blocker.id,
        label: blocker.label,
        detail: blocker.detail,
        planItems: blocker.planItems,
        requiredEvidence: blocker.requiredEvidence,
        evidenceChecks: compactEvidenceChecks(blocker.details, name),
        ...categoryActionFields(blocker, name),
      }));
      categories.set(name, entry);
    }
  }
  return [...categories.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function categoryActionFields(blocker, category) {
  const nextStep = blocker.categoryNextSteps?.[category] ?? blocker.nextStep ?? {};
  return stripEmpty({
    copyFrom: nextStep.copyFrom,
    writeTo: nextStep.writeTo,
    provide: nextStep.provide,
    validateCommand: nextStep.validateWith,
    validationSafety: buildValidationSafety(nextStep.validateWith),
  });
}

function buildValidationSafety(command) {
  if (!command) return undefined;
  return {
    optInRequired: true,
    optInEnv: COMMAND_SAFETY.validationOptInEnv,
    mayRequireFreshClonePath: requiresFreshClonePath(command),
  };
}

function buildCopyCommand(step) {
  if (!step.copyFrom || !step.writeTo) return undefined;
  if (!step.id || !SCAFFOLD_KIND_BY_BLOCKER[step.id]) return undefined;
  return `npm run scaffold:submission-evidence -- --kind ${shellArg(SCAFFOLD_KIND_BY_BLOCKER[step.id])} --copy-final`;
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

function formatSummary(summary, format) {
  if (format === "summary") return formatCompactSummary(summary);
  if (format === "markdown") return formatMarkdown(summary);
  if (format === "commands") return formatCommands(summary);
  return JSON.stringify(summary, null, 2);
}

async function writeOutput(target, output) {
  await writeGeneratedOutput(target, output);
}

async function resolveWriteTarget(writeTo) {
  return resolveSafeWriteTarget(PROJECT_ROOT, writeTo, "next-steps summary");
}

function formatCompactSummary(summary) {
  const compact = {
    status: summary.status,
    blockerCount: summary.blockerCount,
    filteredBlockerCount: summary.filteredBlockerCount,
    hiddenBlockerCount: summary.filterState?.hiddenBlockerCount ?? 0,
    canMarkSubmissionComplete: summary.completionSemantics?.canMarkSubmissionComplete ?? false,
    viewSafety: compactViewSafety(summary),
    closureProgress: compactClosureProgress(summary),
    closureProgressSummary: compactClosureProgressSummary(summary.closureProgressSummary),
    activeFilters: compactActiveFilters(summary),
    filterWarnings: summary.filterWarnings?.length ? summary.filterWarnings : undefined,
    availableFilters: summary.filterWarnings?.length ? compactAvailableFilters(summary.availableFilters) : undefined,
    actionSummary: compactActionSummary(summary.actionSummary),
    nextClosureActionSummary: compactActionSummary(summary.nextClosureActionSummary),
    actionWarnings: summary.actionWarnings?.length ? summary.actionWarnings : undefined,
    nextClosureStep: summary.nextClosureStep ?? summary.firstOpenClosureStep,
    fullGateSuggestedNextCommand: summary.fullGateSuggestedNextCommand,
    suggestedNextCommand: summary.suggestedNextCommand,
    currentViewNextCommand: summary.currentViewNextCommand,
    nextClosureCommandsWriteCommand: summary.nextClosureCommandsWriteCommand,
    currentViewCommandsWriteCommand: summary.currentViewCommandsWriteCommand,
    nextClosureSummaryWriteCommand: summary.nextClosureSummaryWriteCommand,
    currentViewSummaryWriteCommand: summary.currentViewSummaryWriteCommand,
    safety: summary.safety,
    scriptWriteRecommendation: summary.scriptWriteRecommendation,
    summaryWriteRecommendation: summary.summaryWriteRecommendation,
    blockers: summary.blockers.map((blocker) => stripEmpty({
      id: blocker.id,
      label: blocker.label,
      planItems: blocker.planItems ?? [],
      detail: blocker.detail,
      scaffoldCommand: compactScaffoldCommand(blocker),
      copyFinalCommand: compactCopyFinalCommand(blocker),
      copySafety: compactCopySafety(blocker),
      validateCommand: blocker.nextStep?.validateWith,
      validationSafety: buildValidationSafety(blocker.nextStep?.validateWith),
      writeTo: blocker.nextStep?.writeTo,
      provide: blocker.nextStep?.provide,
    })),
    note: summary.completionSemantics?.note ?? summary.note,
  };
  return JSON.stringify(compact, null, 2);
}

function compactClosureProgress(summary) {
  const hasClosureProgress = Boolean(
    summary.fullGateFirstOpenClosureStep
      || summary.firstOpenClosureStep
      || summary.nextClosureStep
      || summary.prerequisiteState?.skippedClosureStepCount,
  );
  if (!hasClosureProgress) return undefined;
  return stripEmpty({
    fullGateFirstOpenStep: summary.fullGateFirstOpenClosureStep,
    viewFirstOpenStep: summary.firstOpenClosureStep,
    currentViewStep: summary.nextClosureStep ?? summary.firstOpenClosureStep,
    viewStartsAfterFullGate: summary.prerequisiteState?.viewStartsAfterFullGate ?? false,
    skippedClosureStepCount: summary.prerequisiteState?.skippedClosureStepCount ?? 0,
    skippedClosureSteps: summary.prerequisiteState?.skippedClosureSteps?.length
      ? summary.prerequisiteState.skippedClosureSteps
      : undefined,
  });
}

function compactClosureProgressSummary(progressSummary) {
  if (!progressSummary) return undefined;
  return stripEmpty({
    fullOpenCount: progressSummary.fullOpenCount,
    viewOpenCount: progressSummary.viewOpenCount,
    fullFirstOpenStep: progressSummary.fullFirstOpenStep,
    viewFirstOpenStep: progressSummary.viewFirstOpenStep,
    openSteps: progressSummary.steps
      .filter((step) => step.fullOpenCount > 0 || step.viewOpenCount > 0)
      .map((step) => stripEmpty({
        id: step.id,
        order: step.order,
        label: step.label,
        fullOpenBlockers: step.fullOpenBlockers,
        viewOpenBlockers: step.viewOpenBlockers,
        firstFullOpen: step.firstFullOpen || undefined,
        firstViewOpen: step.firstViewOpen || undefined,
      })),
  });
}

function compactActiveFilters(summary) {
  if (!summary.filterState?.filtersActive) return undefined;
  return stripEmpty({
    nextOnly: summary.filterState.nextOnly ? true : undefined,
    blocker: summary.filterState.exactFilter?.blocker,
    category: summary.filterState.exactFilter?.category,
    planItem: summary.filterState.exactFilter?.planItem,
  });
}

function compactViewSafety(summary) {
  return stripEmpty({
    filtersActive: summary.filterState?.filtersActive ?? false,
    hiddenBlockerCount: summary.filterState?.hiddenBlockerCount ?? 0,
    emptyBecauseOfFilters: summary.filterState?.emptyBecauseOfFilters ?? false,
    viewStartsAfterFullGate: summary.prerequisiteState?.viewStartsAfterFullGate ?? false,
    skippedClosureStepCount: summary.prerequisiteState?.skippedClosureStepCount ?? 0,
    skippedClosureSteps: summary.prerequisiteState?.skippedClosureSteps?.length
      ? summary.prerequisiteState.skippedClosureSteps
      : undefined,
    fullGateStatus: summary.completionSemantics?.fullGateStatus ?? summary.status,
    exitCodeReflectsFullGate: summary.completionSemantics?.exitCodeReflectsFullGate ?? true,
    filtersChangeCompletion: summary.completionSemantics?.filtersChangeCompletion ?? false,
    note: summary.completionSemantics?.note,
  });
}

function compactAvailableFilters(availableFilters) {
  return {
    blockers: availableFilters?.blockers ?? [],
    categories: (availableFilters?.categories ?? []).map(({ name, blockerCount, failed, total }) => ({
      name,
      blockerCount,
      failed,
      total,
    })),
    planItems: (availableFilters?.planItems ?? []).map(({ name, blockerCount }) => ({
      name,
      blockerCount,
    })),
  };
}

function compactActionSummary(actionSummary) {
  if (!actionSummary || actionSummary.blockerCount === 0) return undefined;
  return actionSummary;
}

function compactScaffoldCommand(blocker) {
  const kind = SCAFFOLD_KIND_BY_BLOCKER[blocker.id];
  return kind && blocker.nextStep?.writeTo ? `npm run scaffold:submission-evidence -- --kind ${kind} --commands` : undefined;
}

function compactCopyFinalCommand(blocker) {
  const kind = SCAFFOLD_KIND_BY_BLOCKER[blocker.id];
  return kind && blocker.nextStep?.writeTo ? `npm run scaffold:submission-evidence -- --kind ${kind} --copy-final` : undefined;
}

function compactCopySafety(blocker) {
  if (!compactCopyFinalCommand(blocker)) return undefined;
  return {
    optInRequired: true,
    optInEnv: COMMAND_SAFETY.placeholderOptInEnv,
    createsFinalEvidence: false,
    note: "Copies a template placeholder only; fill real evidence before validation.",
  };
}

function formatMarkdown(summary) {
  const lines = [
    "# Submission Next Steps",
    "",
    `Status: ${summary.status}`,
    `Blockers: ${summary.blockerCount}`,
    `Filtered blockers: ${formatFilterSummary(summary)}`,
    `Hidden blockers in this view: ${summary.filterState?.hiddenBlockerCount ?? 0}`,
    `Action summary: ${formatActionSummary(summary.actionSummary)}`,
    `Next closure action summary: ${formatActionSummary(summary.nextClosureActionSummary)}`,
    `Action warnings: ${formatActionWarnings(summary.actionWarnings)}`,
    `Closure progress summary: ${formatClosureProgressSummary(summary.closureProgressSummary)}`,
    `Completion: ${formatCompletionSemantics(summary.completionSemantics)}`,
    `Prerequisites: ${formatPrerequisiteState(summary.prerequisiteState)}`,
    `Focused next step mode: ${formatNextStepFocus(summary.nextStepFocus)}`,
    `Next closure step: ${formatNextClosureStep(summary)}`,
    `First open closure step: ${formatFirstOpenClosureStep(summary)}`,
    `Forwarded gate args: ${formatForwardedGateArgs(summary.forwardedGateArgs)}`,
    `Full gate suggested next command: ${summary.fullGateSuggestedNextCommand ? `\`${summary.fullGateSuggestedNextCommand}\`` : "none"}`,
    `Suggested next command: ${summary.suggestedNextCommand ? `\`${summary.suggestedNextCommand}\`` : "none"}`,
    `Next closure commands write command: ${summary.nextClosureCommandsWriteCommand ? `\`${summary.nextClosureCommandsWriteCommand}\`` : "none"}`,
    `Next closure summary write command: ${summary.nextClosureSummaryWriteCommand ? `\`${summary.nextClosureSummaryWriteCommand}\`` : "none"}`,
    `Current view next command: ${summary.currentViewNextCommand ? `\`${summary.currentViewNextCommand}\`` : "none"}`,
    `Current view commands write command: \`${summary.currentViewCommandsWriteCommand}\``,
    `Current view summary write command: \`${summary.currentViewSummaryWriteCommand}\``,
    `Open plan items: ${summary.openPlanItems.length ? summary.openPlanItems.join(", ") : "none"}`,
    `Available blocker filters: ${formatAvailableBlockerFilters(summary.availableFilters)}`,
    `Categories: ${Object.keys(summary.categoryCounts).length ? formatCategories(summary.categoryCounts) : "none"}`,
    `Available category filters: ${formatAvailableCategoryFilters(summary.availableFilters)}`,
    `Available plan item filters: ${formatAvailablePlanItemFilters(summary.availableFilters)}`,
    "",
    summary.note,
    `Safety: commands create evidence by default=${summary.safety.createsEvidenceByDefault}; validate by default=${summary.safety.validatesByDefault}; blocked default exit=${summary.safety.defaultBlockedExitCode}`,
    `Opt in: ${summary.safety.placeholderOptInEnv}; ${summary.safety.validationOptInEnv}`,
    "",
  ];
  if (summary.filterWarnings?.length) {
    lines.push("Filter warnings:");
    for (const warning of summary.filterWarnings) {
      lines.push(`- ${warning.message}; available: ${warning.available.length ? warning.available.join(", ") : "none"}`);
    }
    lines.push("");
  }
  if (summary.closureProgressSummary?.steps?.length) {
    lines.push("## Closure Progress Summary");
    for (const step of summary.closureProgressSummary.steps) {
      const markers = [
        step.firstFullOpen ? "full-first-open" : undefined,
        step.firstViewOpen ? "view-first-open" : undefined,
      ].filter(Boolean);
      lines.push(`- ${step.order}. ${step.label}: full=${formatBlockerList(step.fullOpenBlockers)}; view=${formatBlockerList(step.viewOpenBlockers)}${markers.length ? `; ${markers.join(",")}` : ""}`);
    }
    lines.push("");
  }
  if (!summary.blockers.length) {
    lines.push(hasSummaryFilters(summary)
      ? `No blockers match ${formatFilterLabel(summary)}. The full submission gate status is still ${summary.status}.`
      : "No blockers remain in the local submission gate summary.");
    return formatMarkdownLines(lines);
  }
  if (hasEvidenceChecklist(summary.evidenceChecklist)) {
    lines.push("## Evidence Checklist");
    for (const item of summary.evidenceChecklist.evidenceFiles) {
      lines.push(`- Evidence file ${item.id}: \`${item.path}\``);
      if (item.template) lines.push(`  - Template: \`${item.template}\``);
      if (item.scaffoldCommand) lines.push(`  - Scaffold handoff: \`${item.scaffoldCommand}\``);
      if (item.copyFinalCommand) lines.push(`  - Prepare placeholder explicitly: \`${item.copyFinalCommand}\``);
      if (item.validateCommand) lines.push(`  - Validate: \`${item.validateCommand}\``);
      if (item.validationSafety) lines.push(`  - ${formatValidationSafety(item.validationSafety)}`);
    }
    for (const item of summary.evidenceChecklist.manualInputs) {
      lines.push(`- Manual input ${item.id}: \`${item.input}\``);
      if (item.validateCommand) lines.push(`  - Validate: \`${item.validateCommand}\``);
      if (item.validationSafety) lines.push(`  - ${formatValidationSafety(item.validationSafety)}`);
    }
    lines.push("");
  }
  if (summary.categoryBlockers.length) {
    lines.push("## Categories");
    for (const category of summary.categoryBlockers) {
      lines.push(`- ${category.name}: failed=${category.failed} total=${category.total}; blockers=${category.blockers.map((blocker) => blocker.id).join(", ")}`);
      for (const blocker of category.blockers) {
        if (blocker.validateCommand) lines.push(`  - ${blocker.id}: \`${blocker.validateCommand}\``);
        if (blocker.validationSafety) lines.push(`    - ${formatValidationSafety(blocker.validationSafety)}`);
        appendMarkdownEvidenceChecks(lines, blocker.evidenceChecks, `  - ${blocker.id}`);
      }
    }
    lines.push("");
  }
  if (summary.closureSequence.length) {
    lines.push("## Closure Sequence");
    for (const step of summary.closureSequence) {
      lines.push(`${step.order}. ${step.label}: ${step.blockers.map((blocker) => blocker.id).join(", ")}`);
      lines.push(`   - ${step.rationale}`);
      for (const blocker of step.blockers) {
        if (blocker.validateCommand) lines.push(`   - ${blocker.id}: \`${blocker.validateCommand}\``);
        if (blocker.validationSafety) lines.push(`     - ${formatValidationSafety(blocker.validationSafety)}`);
      }
    }
    lines.push("");
  }
  if (summary.planItemBlockers.length) {
    lines.push("## Plan Items");
    for (const item of summary.planItemBlockers) {
      const blockerRefs = item.blockers.map((blocker) => blocker.id).join(", ");
      lines.push(`- ${item.planItem}: ${blockerRefs || "no blocker detail"}`);
    }
    lines.push("");
  }
  if (!summary.actionPlan.length) {
    lines.push("No generated action plan entries were emitted for these blockers; inspect the blocker details and validation commands below.", "");
    for (const blocker of summary.blockers) {
      lines.push(`## ${blocker.id}: ${blocker.label}`);
      if (blocker.detail) lines.push(`- Detail: ${blocker.detail}`);
      if (blocker.categories) lines.push(`- Categories: ${formatCategories(blocker.categories)}`);
      if (Array.isArray(blocker.failedChecks) && blocker.failedChecks.length) {
        lines.push("- Failed checks:");
        appendMarkdownFailedChecks(lines, blocker.failedChecks);
      }
      if (blocker.requiredEvidence) lines.push(`- Required evidence: ${blocker.requiredEvidence}`);
      if (blocker.nextStep?.provide) lines.push(`- Manual input: \`${blocker.nextStep.provide}\``);
      if (blocker.nextStep?.validateWith) {
        lines.push(`- Validate: \`${blocker.nextStep.validateWith}\``);
        lines.push(`- ${formatValidationSafety(buildValidationSafety(blocker.nextStep.validateWith))}`);
      }
      lines.push("");
    }
    return formatMarkdownLines(lines).trimEnd();
  }
  for (const action of summary.actionPlan) {
    lines.push(`## ${action.id}: ${action.label}`);
    const blocker = summary.blockers.find((item) => item.id === action.id);
    if (blocker?.detail) lines.push(`- Detail: ${blocker.detail}`);
    if (blocker?.categories) lines.push(`- Categories: ${formatCategories(blocker.categories)}`);
    if (Array.isArray(blocker?.failedChecks) && blocker.failedChecks.length) {
      lines.push("- Failed checks:");
      appendMarkdownFailedChecks(lines, blocker.failedChecks);
    }
    if (blocker?.requiredEvidence) lines.push(`- Required evidence: ${blocker.requiredEvidence}`);
    if (action.manualInput) lines.push(`- Manual input: \`${action.manualInput}\``);
    if (action.copyFinalCommand) lines.push(`- Prepare placeholder explicitly: \`${action.copyFinalCommand}\``);
    if (action.editTarget) lines.push(`- Fill evidence: \`${action.editTarget}\``);
    if (action.validateCommand) lines.push(`- Validate: \`${action.validateCommand}\``);
    if (action.validationSafety) lines.push(`- ${formatValidationSafety(action.validationSafety)}`);
    lines.push("");
  }
  return formatMarkdownLines(lines).trimEnd();
}

function formatValidationSafety(safety) {
  const optIn = safety.optInRequired ? `Validation safety: opt-in via \`${safety.optInEnv}\`` : "Validation safety: no opt-in required";
  const freshClone = safety.mayRequireFreshClonePath ? "fresh clone path required" : "fresh clone path not required";
  return `${optIn}; ${freshClone}`;
}

function appendMarkdownFailedChecks(lines, checks) {
  for (const check of checks) {
    lines.push(`  - ${check.name}: ${check.detail}`);
    appendMarkdownEvidenceSummary(lines, check.evidenceSummary, "    - ");
  }
}

function appendMarkdownEvidenceChecks(lines, checks, prefix) {
  if (!Array.isArray(checks) || checks.length === 0) return;
  for (const check of checks) {
    lines.push(`${prefix}/${check.name}: ${check.detail}`);
    appendMarkdownEvidenceSummary(lines, check.evidenceSummary, "    - ");
  }
}

function appendMarkdownEvidenceSummary(lines, summary, prefix) {
  if (!summary) return;
  lines.push(`${prefix}Evidence: ${formatEvidenceSummary(summary)}`);
}

function formatEvidenceSummary(summary) {
  if (!summary?.items?.length) return "none";
  const omitted = summary.omitted ? `; ${summary.omitted} more` : "";
  return `${summary.shown} shown of ${summary.total}: ${summary.items.join("; ")}${omitted}`;
}

function formatActionSummary(actionSummary) {
  if (!actionSummary || actionSummary.blockerCount === 0) {
    return "no blockers in current view";
  }
  const scaffold = actionSummary.blockersWithScaffold.length
    ? actionSummary.blockersWithScaffold.join(",")
    : "none";
  const freshClone = actionSummary.blockersRequiringFreshClonePath.length
    ? actionSummary.blockersRequiringFreshClonePath.join(",")
    : "none";
  const withoutPrepare = actionSummary.blockersWithoutPrepareAction.length
    ? actionSummary.blockersWithoutPrepareAction.join(",")
    : "none";
  const withoutValidation = actionSummary.blockersWithoutValidationCommand.length
    ? actionSummary.blockersWithoutValidationCommand.join(",")
    : "none";
  return [
    `evidence files=${actionSummary.evidenceFileCount}`,
    `manual inputs=${actionSummary.manualInputCount}`,
    `validation commands=${actionSummary.validationCommandCount}`,
    `scaffold blockers=${scaffold}`,
    `fresh clone blockers=${freshClone}`,
    `no prepare action=${withoutPrepare}`,
    `no validation command=${withoutValidation}`,
  ].join("; ");
}

function formatActionWarnings(warnings) {
  if (!Array.isArray(warnings) || warnings.length === 0) return "none";
  return warnings
    .map((warning) => `${warning.scope}/${warning.type}=${warning.blockerIds.join(",")}`)
    .join("; ");
}

function formatCommandActionWarnings(warnings) {
  if (!Array.isArray(warnings) || warnings.length === 0) return "none";
  return warnings
    .map((warning) => `${warning.scope}:${warning.type}:${warning.blockerIds.join(",")}`)
    .join(";");
}

function formatClosureProgressSummary(progressSummary) {
  if (!progressSummary?.steps?.length) return "none";
  return progressSummary.steps
    .filter((step) => step.fullOpenCount > 0 || step.viewOpenCount > 0)
    .map((step) => `${step.order}:${step.id} full=${formatBlockerList(step.fullOpenBlockers)} view=${formatBlockerList(step.viewOpenBlockers)}`)
    .join("; ") || "all closure steps closed";
}

function formatBlockerList(blockers) {
  return Array.isArray(blockers) && blockers.length ? blockers.join(",") : "none";
}

function formatCommandClosureProgress(progressSummary) {
  if (!progressSummary?.steps?.length) return "none";
  return progressSummary.steps
    .filter((step) => step.fullOpenCount > 0 || step.viewOpenCount > 0)
    .map((step) => `${step.order}:${step.id}:full=${formatBlockerList(step.fullOpenBlockers)}:view=${formatBlockerList(step.viewOpenBlockers)}`)
    .join(" ");
}

function formatCategories(categories) {
  return Object.entries(categories)
    .map(([name, counts]) => `${name}=${counts.failed ?? counts.total ?? 0}`)
    .join(", ");
}

function formatAvailableBlockerFilters(availableFilters) {
  const blockers = availableFilters?.blockers ?? [];
  if (!blockers.length) return "none";
  return blockers.join(", ");
}

function formatAvailableCategoryFilters(availableFilters) {
  const categories = availableFilters?.categories ?? [];
  if (!categories.length) return "none";
  return categories.map((category) => `${category.name}(${category.blockerCount})`).join(", ");
}

function formatAvailablePlanItemFilters(availableFilters) {
  const planItems = availableFilters?.planItems ?? [];
  if (!planItems.length) return "none";
  return planItems.map((planItem) => `${planItem.name}(${planItem.blockerCount})`).join(", ");
}

function formatMarkdownLines(lines) {
  return lines.map((line) => escapeControlChars(line)).join("\n");
}

function formatCommands(summary) {
  const needsFreshClonePath = actionPlanNeedsFreshClonePath(summary.actionPlan);
  const forwardedPublicRepoPath = forwardedGateArgValue(summary.forwardedGateArgs, "--public-repo");
  const lines = [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    `cd ${shellQuote(summary.projectRoot)}`,
    "",
    "# Submission next steps commands",
    "# Read-only generated checklist. Review each command before running it.",
    `# status=${summary.status} blockers=${summary.blockerCount}`,
    `# filtered_blockers=${formatCommandFilterSummary(summary)}`,
    `# hidden_blockers=${summary.filterState?.hiddenBlockerCount ?? 0}`,
    `# action_evidence_files=${summary.actionSummary?.evidenceFileCount ?? 0}`,
    `# action_manual_inputs=${summary.actionSummary?.manualInputCount ?? 0}`,
    `# action_validation_commands=${summary.actionSummary?.validationCommandCount ?? 0}`,
    `# action_scaffold_blockers=${summary.actionSummary?.blockersWithScaffold?.length ? summary.actionSummary.blockersWithScaffold.join(",") : "none"}`,
    `# action_fresh_clone_blockers=${summary.actionSummary?.blockersRequiringFreshClonePath?.length ? summary.actionSummary.blockersRequiringFreshClonePath.join(",") : "none"}`,
    `# action_without_prepare=${summary.actionSummary?.blockersWithoutPrepareAction?.length ? summary.actionSummary.blockersWithoutPrepareAction.join(",") : "none"}`,
    `# action_without_validation=${summary.actionSummary?.blockersWithoutValidationCommand?.length ? summary.actionSummary.blockersWithoutValidationCommand.join(",") : "none"}`,
    `# next_action_blockers=${summary.nextClosureActionSummary?.blockerIds?.length ? summary.nextClosureActionSummary.blockerIds.join(",") : "none"}`,
    `# next_action_evidence_files=${summary.nextClosureActionSummary?.evidenceFileCount ?? 0}`,
    `# next_action_manual_inputs=${summary.nextClosureActionSummary?.manualInputCount ?? 0}`,
    `# next_action_validation_commands=${summary.nextClosureActionSummary?.validationCommandCount ?? 0}`,
    `# next_action_without_prepare=${summary.nextClosureActionSummary?.blockersWithoutPrepareAction?.length ? summary.nextClosureActionSummary.blockersWithoutPrepareAction.join(",") : "none"}`,
    `# next_action_without_validation=${summary.nextClosureActionSummary?.blockersWithoutValidationCommand?.length ? summary.nextClosureActionSummary.blockersWithoutValidationCommand.join(",") : "none"}`,
    `# action_warnings=${formatCommandActionWarnings(summary.actionWarnings)}`,
    `# closure_progress=${formatCommandClosureProgress(summary.closureProgressSummary)}`,
    `# full_gate_status=${summary.completionSemantics?.fullGateStatus ?? summary.status}`,
    `# can_mark_submission_complete=${summary.completionSemantics?.canMarkSubmissionComplete ?? false}`,
    `# filters_change_completion=${summary.completionSemantics?.filtersChangeCompletion ?? false}`,
    `# exit_code_reflects_full_gate=${summary.completionSemantics?.exitCodeReflectsFullGate ?? true}`,
    `# full_gate_first_open_closure_step=${summary.fullGateFirstOpenClosureStep ? `${summary.fullGateFirstOpenClosureStep.order}:${summary.fullGateFirstOpenClosureStep.id}` : "none"}`,
    `# view_starts_after_full_gate=${summary.prerequisiteState?.viewStartsAfterFullGate ?? false}`,
    `# skipped_closure_steps=${formatSkippedClosureSteps(summary.prerequisiteState)}`,
    `# empty_because_of_filters=${summary.filterState?.emptyBecauseOfFilters ?? false}`,
    `# focused_next_step=${formatCommandNextStepFocus(summary.nextStepFocus)}`,
    `# next_closure_step=${summary.nextClosureStep ? `${summary.nextClosureStep.order}:${summary.nextClosureStep.id}` : "none"}`,
    `# first_open_closure_step=${summary.firstOpenClosureStep ? `${summary.firstOpenClosureStep.order}:${summary.firstOpenClosureStep.id}` : "none"}`,
    `# forwarded_gate_args=${formatForwardedGateArgs(summary.forwardedGateArgs)}`,
    `# full_gate_suggested_next_command=${summary.fullGateSuggestedNextCommand ?? "none"}`,
    `# suggested_next_command=${summary.suggestedNextCommand ?? "none"}`,
    `# next_closure_commands_write_command=${summary.nextClosureCommandsWriteCommand ?? "none"}`,
    `# next_closure_summary_write_command=${summary.nextClosureSummaryWriteCommand ?? "none"}`,
    `# current_view_next_command=${summary.currentViewNextCommand ?? "none"}`,
    `# current_view_commands_write_command=${summary.currentViewCommandsWriteCommand ?? "none"}`,
    `# current_view_summary_write_command=${summary.currentViewSummaryWriteCommand ?? "none"}`,
    `# available_blocker_filters=${formatAvailableBlockerFilters(summary.availableFilters)}`,
    `# categories=${Object.keys(summary.categoryCounts).length ? formatCategories(summary.categoryCounts) : "none"}`,
    `# available_category_filters=${formatAvailableCategoryFilters(summary.availableFilters)}`,
    `# available_plan_item_filters=${formatAvailablePlanItemFilters(summary.availableFilters)}`,
    `# safety_create_evidence_by_default=${summary.safety.createsEvidenceByDefault}`,
    `# safety_validate_by_default=${summary.safety.validatesByDefault}`,
    `# safety_blocked_default_exit_code=${summary.safety.defaultBlockedExitCode}`,
    `# safety_placeholder_opt_in=${summary.safety.placeholderOptInEnv}`,
    `# safety_validation_opt_in=${summary.safety.validationOptInEnv}`,
    `# commands_write_script=${summary.scriptWriteRecommendation?.commandsWriteScript ?? "npm run submission:next-steps:commands:write"}`,
    `# next_commands_write_script=${summary.scriptWriteRecommendation?.nextCommandsWriteScript ?? "npm run submission:next-steps:next:commands:write"}`,
    `# summary_write_script=${summary.summaryWriteRecommendation?.summaryWriteScript ?? "npm run submission:next-steps:summary:write"}`,
    `# next_summary_write_script=${summary.summaryWriteRecommendation?.nextSummaryWriteScript ?? "npm run submission:next-steps:next:summary:write"}`,
    `# avoid_shell_redirection=${summary.scriptWriteRecommendation?.avoidShellRedirection ?? true}`,
  ];
  if (needsFreshClonePath) {
    lines.push(
      "# Set FRESH_CLONE_PATH before running public-repo or pre-submission validation commands.",
      buildFreshClonePathDefaultLine(forwardedPublicRepoPath),
    );
    if (!forwardedPublicRepoPath) {
      lines.push("echo 'WARNING: validation requires FRESH_CLONE_PATH because --public-repo was not forwarded.'");
    }
    lines.push("");
  } else {
    lines.push("");
  }
  if (summary.filterWarnings?.length) {
    for (const warning of summary.filterWarnings) {
      lines.push(`# warning ${warning.type}: ${warning.filter}; available=${warning.available.length ? warning.available.join(",") : "none"}`);
    }
    lines.push("");
  }
  if (summary.prerequisiteState?.viewStartsAfterFullGate) {
    lines.push("# This focused view skips earlier full-gate prerequisites.");
    for (const step of summary.prerequisiteState.skippedClosureSteps ?? []) {
      lines.push(`# prerequisite ${step.order} ${step.id}: blockers=${step.blockers.join(",")}`);
    }
    lines.push(
      "echo 'WARNING: this focused view starts after earlier full-gate prerequisites.'",
      `echo ${shellQuote(`Run full gate next steps first: ${summary.fullGateSuggestedNextCommand ?? "npm run submission:next-steps -- --next"}`)}`,
    );
    for (const step of summary.prerequisiteState.skippedClosureSteps ?? []) {
      lines.push(`echo ${shellQuote(`Prerequisite ${step.order} ${step.label}: ${step.blockers.join(", ")}`)}`);
    }
    lines.push("");
  }
  if (!summary.blockers.length) {
    lines.push(hasSummaryFilters(summary)
      ? `# No blockers match ${formatFilterLabel(summary)}. Full submission status remains ${summary.status}.`
      : "# No blockers remain in the local submission gate summary.");
    if (summary.status === "failed") {
      lines.push(
        "echo 'Submission blockers remain outside this filtered view; generated checklist cannot mark the full gate complete.'",
        "exit 1",
      );
    }
    return formatCommandLines(lines);
  }
  if (hasEvidenceChecklist(summary.evidenceChecklist)) {
    lines.push("# Evidence checklist");
    for (const item of summary.evidenceChecklist.evidenceFiles) {
      lines.push(`# evidence_file ${item.id}: path=${item.path}${item.template ? ` template=${item.template}` : ""}`);
      if (item.scaffoldCommand) lines.push(`# scaffold ${item.id}: ${item.scaffoldCommand}`);
      if (item.copyFinalCommand) lines.push(`# copy_final ${item.id}: ${item.copyFinalCommand}`);
    }
    for (const item of summary.evidenceChecklist.manualInputs) {
      lines.push(`# manual_input ${item.id}: ${item.input}`);
    }
    lines.push("");
  }
  if (summary.categoryBlockers.length) {
    lines.push("# Category blocker groups");
    for (const category of summary.categoryBlockers) {
      lines.push(`# category ${category.name}: blockers=${category.blockers.map((blocker) => blocker.id).join(",")}`);
      for (const blocker of category.blockers) {
        if (blocker.validateCommand) lines.push(`# validate ${category.name}/${blocker.id}: ${blocker.validateCommand}`);
        appendCommandEvidenceChecks(lines, `${category.name}/${blocker.id}`, blocker.evidenceChecks);
      }
    }
    lines.push("");
  }
  if (summary.closureSequence.length) {
    lines.push("# Closure sequence");
    for (const step of summary.closureSequence) {
      lines.push(`# sequence ${step.order} ${step.id}: blockers=${step.blockers.map((blocker) => blocker.id).join(",")}`);
    }
    lines.push("");
  }
  if (!summary.actionPlan.length) {
    lines.push("# No generated action commands were emitted for these blockers.");
    for (const blocker of summary.blockers) {
      lines.push(`# blocker ${blocker.id}: ${blocker.detail ?? blocker.requiredEvidence ?? "failed"}`);
      appendCommandEvidenceChecks(lines, blocker.id, blocker.failedChecks);
      if (blocker.nextStep?.validateWith) lines.push(`# validate ${blocker.id}: ${blocker.nextStep.validateWith}`);
    }
    lines.push(
      "echo 'Submission blockers remain; no generated action commands were available.'",
      "exit 1",
    );
    return formatCommandLines(lines);
  }
  const prepareActions = summary.actionPlan.filter((action) => action.manualInput || action.copyCommand || action.editTarget);
  const validateActions = summary.actionPlan
    .map((action) => ({ action, validateCommand: shellSafeValidateCommand(action.validateCommand) }))
    .filter((entry) => entry.validateCommand);
  if (prepareActions.length) {
    lines.push("# Prepare placeholder files and manual inputs");
    lines.push("# Manual TODOs");
    for (const action of prepareActions) {
      if (action.editTarget) lines.push(`echo ${shellQuote(`TODO fill real evidence for ${action.id}: ${action.editTarget}`)}`);
      if (action.manualInput) lines.push(`echo ${shellQuote(`TODO provide ${action.id}: ${action.manualInput}`)}`);
    }
    lines.push("");
    if (prepareActions.some((action) => action.copyCommand)) {
      lines.push(
        "# Placeholder file creation is opt-in so final evidence paths are not populated accidentally.",
        "if [ \"${SUBMISSION_NEXT_STEPS_PREPARE_PLACEHOLDERS:-0}\" != \"1\" ]; then",
        "  echo 'Skipped placeholder file creation. Rerun with SUBMISSION_NEXT_STEPS_PREPARE_PLACEHOLDERS=1 only when you are ready to fill real evidence.'",
        "else",
      );
    }
    for (const action of prepareActions) {
      lines.push(`## ${action.id}: ${action.label}`);
      if (action.manualInput) lines.push(`# manual input required: ${action.manualInput}`);
      if (action.copyCommand) {
        lines.push("# placeholder copy only; fill real evidence before expecting validation to pass");
        lines.push(action.copyCommand);
      }
      if (action.editTarget) lines.push(`# fill real evidence in ${action.editTarget}`);
      lines.push("");
    }
    if (prepareActions.some((action) => action.copyCommand)) {
      lines.push("fi", "");
    }
  }
  if (validateActions.length) {
    lines.push(
      "# Validation is opt-in so placeholder evidence is not checked immediately.",
      "if [ \"${SUBMISSION_NEXT_STEPS_RUN_VALIDATION:-0}\" != \"1\" ]; then",
      "  echo 'Prepared placeholders/manual inputs only. Fill real evidence, then rerun with SUBMISSION_NEXT_STEPS_RUN_VALIDATION=1 to validate.'",
      "  echo 'Submission blockers remain; validation was not run.'",
      "  exit 1",
      "fi",
      "",
    );
    lines.push("# Validate after filling real evidence");
    for (const { action, validateCommand } of validateActions) {
      lines.push(`## ${action.id}: ${action.label}`);
      if (action.validationSafety) {
        lines.push(`# validation opt-in: ${action.validationSafety.optInEnv}`);
        lines.push(`# fresh clone path required: ${action.validationSafety.mayRequireFreshClonePath ? "yes" : "no"}`);
      }
      if (action.validationSafety?.mayRequireFreshClonePath) {
        lines.push("test -n \"$FRESH_CLONE_PATH\" || { echo 'FRESH_CLONE_PATH is required'; exit 1; }");
      }
      lines.push(validateCommand);
      lines.push("");
    }
  }
  for (const action of summary.actionPlan.filter((item) => (
    !prepareActions.includes(item) && !validateActions.some((entry) => entry.action === item)
  ))) {
    lines.push(`## ${action.id}: ${action.label}`);
    lines.push("");
  }
  if (summary.status === "failed") {
    lines.push(
      "echo 'Submission blockers remain; generated checklist cannot mark the full gate complete.'",
      "exit 1",
    );
  }
  return formatCommandLines(lines).trimEnd();
}

function formatCommandLines(lines) {
  return lines.map((line) => (
    String(line).startsWith("#") ? sanitizeShellComment(line) : line
  )).join("\n");
}

function appendCommandEvidenceChecks(lines, prefix, checks) {
  if (!Array.isArray(checks) || checks.length === 0) return;
  for (const check of checks) {
    lines.push(`# failed ${prefix}/${check.name}: ${check.detail}`);
    if (check.evidenceSummary) {
      lines.push(`# evidence ${prefix}/${check.name}: ${formatEvidenceSummary(check.evidenceSummary)}`);
    }
  }
}

function sanitizeShellComment(line) {
  return String(line).replace(/[\r\n]/gu, "\\n");
}

function shellSafeValidateCommand(command) {
  if (!command) return undefined;
  return command
    .replaceAll("--public-repo <fresh-clone-path>", "--public-repo \"$FRESH_CLONE_PATH\"")
    .replaceAll("--repo <fresh-clone-path>", "--repo \"$FRESH_CLONE_PATH\"")
    .replaceAll("PUBLIC_REPO_CLONE_PATH=<fresh-clone-path>", "PUBLIC_REPO_CLONE_PATH=\"$FRESH_CLONE_PATH\"");
}

function buildFreshClonePathDefaultLine(value) {
  return value
    ? `: \${FRESH_CLONE_PATH:=${shellScriptLiteral(value)}}`
    : ": \"${FRESH_CLONE_PATH:=}\"";
}

function shellScriptLiteral(value) {
  return shellQuote(value);
}

function forwardedGateArgValue(args, name) {
  return Array.isArray(args) ? args.find((arg) => arg.name === name)?.value : undefined;
}

function actionPlanNeedsFreshClonePath(actionPlan) {
  return Array.isArray(actionPlan) && actionPlan.some((action) => action.validationSafety?.mayRequireFreshClonePath);
}

function requiresFreshClonePath(command) {
  return String(command ?? "").includes("<fresh-clone-path>");
}

function hasEvidenceChecklist(checklist) {
  return Boolean(checklist?.evidenceFiles?.length || checklist?.manualInputs?.length);
}

function hasSummaryFilters(summary) {
  return Boolean(summary.nextOnly || summary.categoryFilter || summary.planItemFilter || summary.blockerFilter);
}

function formatFilterSummary(summary) {
  if (!hasSummaryFilters(summary)) return "none";
  return `${summary.filteredBlockerCount} for ${formatFilterLabel(summary)}`;
}

function formatCompletionSemantics(semantics) {
  if (!semantics) return "unknown";
  const completion = semantics.canMarkSubmissionComplete ? "complete" : "blocked";
  const filtered = semantics.viewFiltered ? `; filtered view shows ${semantics.viewBlockerCount}; hidden=${semantics.hiddenBlockerCount}` : "";
  return `full gate ${semantics.fullGateStatus}; ${completion}; filters change completion=${semantics.filtersChangeCompletion}${filtered}`;
}

function formatPrerequisiteState(state) {
  if (!state) return "unknown";
  if (!state.viewStartsAfterFullGate) return "no skipped full-gate prerequisites";
  const skipped = state.skippedClosureSteps
    .map((step) => `${step.order}. ${step.label} (${step.blockers.join(", ")})`)
    .join("; ");
  return `focused view starts after full gate; skipped prerequisites: ${skipped}`;
}

function formatNextStepFocus(focus) {
  if (!focus || focus.mode === "default") return "default blocker nextStep";
  const focused = focus.focusedBlockers?.length ? `categoryNextSteps applied to ${focus.focusedBlockers.join(", ")}` : "no categoryNextSteps applied";
  const fallback = focus.fallbackBlockers?.length ? `; fallback nextStep for ${focus.fallbackBlockers.join(", ")}` : "";
  return `category ${focus.category}: ${focused}${fallback}`;
}

function formatForwardedGateArgs(args) {
  if (!Array.isArray(args) || args.length === 0) return "none";
  return args.map((arg) => `${arg.name}=${escapeControlChars(arg.value)}`).join(", ");
}

function formatCommandNextStepFocus(focus) {
  if (!focus || focus.mode === "default") return "default";
  const parts = [`category=${focus.category}`];
  parts.push(`category_next_steps=${focus.focusedBlockers?.length ? focus.focusedBlockers.join(",") : "none"}`);
  if (focus.fallbackBlockers?.length) parts.push(`fallback_next_steps=${focus.fallbackBlockers.join(",")}`);
  return parts.join(" ");
}

function formatSkippedClosureSteps(state) {
  const steps = state?.skippedClosureSteps ?? [];
  if (!steps.length) return "none";
  return steps.map((step) => `${step.order}:${step.id}(${step.blockers.join(",")})`).join(" ");
}

function formatNextClosureStep(summary) {
  if (!summary.nextClosureStep) return summary.nextOnly ? "none" : "not focused";
  return `${summary.nextClosureStep.order}. ${summary.nextClosureStep.label} (${summary.nextClosureStep.id})`;
}

function formatFirstOpenClosureStep(summary) {
  if (!summary.firstOpenClosureStep) return "none";
  return `${summary.firstOpenClosureStep.order}. ${summary.firstOpenClosureStep.label} (${summary.firstOpenClosureStep.id})`;
}

function formatCommandFilterSummary(summary) {
  if (!hasSummaryFilters(summary)) return "none";
  const filters = [
    summary.nextOnly ? "next=true" : undefined,
    summary.blockerFilter ? `blocker=${summary.blockerFilter}` : undefined,
    summary.categoryFilter ? `category=${summary.categoryFilter}` : undefined,
    summary.planItemFilter ? `plan-item=${summary.planItemFilter}` : undefined,
  ].filter(Boolean).join(" ");
  return `${summary.filteredBlockerCount} ${filters}`;
}

function formatFilterLabel(summary) {
  return [
    summary.nextOnly ? (summary.nextClosureStep ? `next closure step ${summary.nextClosureStep.id}` : "next closure step") : undefined,
    summary.blockerFilter ? `blocker ${summary.blockerFilter}` : undefined,
    summary.categoryFilter ? `category ${summary.categoryFilter}` : undefined,
    summary.planItemFilter ? `plan item ${summary.planItemFilter}` : undefined,
  ].filter(Boolean).join(" and ");
}

function usage() {
  return "Usage: node scripts/submission-next-steps.mjs [--json|--summary|--markdown|--commands|--format json|summary|markdown|commands] [--next] [--write <path>] [--blocker <id>] [--category <name>] [--plan-item <id>] [--u6-manifest <path>] [--public-repo <fresh-clone-path>]";
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
    mode: "submission-next-steps",
    status: "failed",
    projectRoot: PROJECT_ROOT,
    blockerCount: 1,
    filteredBlockerCount: 1,
    nextOnly: false,
    filterState: buildFilterState({
      nextOnly: false,
      blockerCount: 1,
      baseFilteredBlockerCount: 1,
      filteredBlockerCount: 1,
      filterWarnings: [],
    }),
    completionSemantics: buildCompletionSemantics({
      status: "failed",
      blockerCount: 1,
      filteredBlockerCount: 1,
      filtersActive: false,
      hiddenBlockerCount: 0,
    }),
    openPlanItems: [],
    blockers: [
      {
        id: "fatal",
        label: "submission next steps invocation",
        detail: error.message,
        nextStep: {
          validateWith: usage(),
        },
      },
    ],
    nextSteps: [
      {
        id: "fatal",
        label: "submission next steps invocation",
        validateWith: usage(),
      },
    ],
    focusedNextSteps: [
      {
        id: "fatal",
        label: "submission next steps invocation",
        validateWith: usage(),
      },
    ],
    actionPlan: [
      {
        id: "fatal",
        label: "submission next steps invocation",
        validateCommand: usage(),
      },
    ],
    evidenceChecklist: {
      evidenceFiles: [],
      manualInputs: [],
      validationCommands: [],
    },
    closureSequence: [],
    checks,
    checkCounts: countChecks(checks),
    categoryBlockers: [],
    safety: COMMAND_SAFETY,
    usage: usage(),
    note: NOTE,
  };
}

main().catch((error) => {
  console.log(JSON.stringify(fatalSummary(error), null, 2));
  process.exit(1);
});
