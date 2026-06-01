import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkImplementationChangeList } from "./u6-change-list-checker.mjs";

export const DEFAULT_MAX_MINUTES = 15;
export const DEFAULT_MAX_SKILL_LINES = 120;
const PROJECT_ROOT = process.env.U6_PROJECT_ROOT
  ? path.resolve(process.env.U6_PROJECT_ROOT)
  : fileURLToPath(new URL("..", import.meta.url));
const NOTE = "This validates local U6 rehearsal evidence only; it does not prove public submission, remote URLs, or real-time recording authenticity.";

export async function checkManifest(manifestPath) {
  const manifest = JSON.parse(await readRequiredProjectText(manifestPath));
  const config = manifestConfig(manifest);
  const manifestChecks = buildManifestChecks(config);
  const rehearsals = await Promise.all(config.rehearsals.map((rehearsal, index) =>
    checkSingleRehearsal(rehearsalOptions(config, rehearsal, index), index),
  ));
  const passedCount = rehearsals.filter((summary) => summary.status === "passed").length;
  manifestChecks.push(passedCount >= config.minPassed
    ? pass("manifest-min-passed", `${passedCount} rehearsals passed`)
    : fail("manifest-min-passed", `${passedCount} rehearsals passed is fewer than ${config.minPassed}`));

  return {
    mode: "manifest",
    status: manifestChecks.some((check) => check.status === "failed") ? "failed" : "passed",
    manifest: normalizeProjectPath(manifestPath),
    thresholds: manifestThresholds(config),
    rehearsalCount: config.rehearsals.length,
    passedCount,
    failedCount: rehearsals.length - passedCount,
    checkCounts: countChecks(manifestChecks),
    checks: manifestChecks,
    manifestCheckCounts: countChecks(manifestChecks),
    rehearsalCheckCounts: countChecks(rehearsals.flatMap((rehearsal) => rehearsal.checks ?? [])),
    manifestChecks,
    rehearsals,
    note: NOTE,
  };
}

export async function checkSingleRehearsal(options, index = null) {
  const missing = requiredOptions(options);
  if (missing.length) {
    return singleSummary(options, index, [fail("options", `missing required option(s): ${missing.join(", ")}`)]);
  }
  const checks = [
    checkTiming(options),
    await checkSkillFile(options),
    await checkSkillRegistry(options),
    await checkImplementationChangeList(options),
    await checkRecording(options),
    ...await checkRunEvidence(options),
  ];
  return singleSummary(options, index, checks);
}

export function positiveNumber(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`--${label} must be a positive number`);
  }
  return parsed;
}

export function toKebabCase(value) {
  return value.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`);
}

function manifestConfig(manifest) {
  const rehearsals = Array.isArray(manifest.rehearsals) ? manifest.rehearsals : [];
  return {
    rehearsals,
    minRehearsals: positiveNumber(manifest.minRehearsals ?? 3, "minRehearsals"),
    minPassed: positiveNumber(manifest.minPassed ?? 2, "minPassed"),
    maxMinutes: positiveNumber(manifest.maxMinutes ?? DEFAULT_MAX_MINUTES, "maxMinutes"),
    maxSkillLines: positiveNumber(manifest.maxSkillLines ?? DEFAULT_MAX_SKILL_LINES, "maxSkillLines"),
  };
}

function buildManifestChecks(config) {
  return [
    config.rehearsals.length >= config.minRehearsals
      ? pass("manifest-rehearsal-count", `${config.rehearsals.length} rehearsals`)
      : fail("manifest-rehearsal-count", `${config.rehearsals.length} rehearsals is fewer than ${config.minRehearsals}`),
    checkUnique(config.rehearsals, "runId", "manifest-unique-run-ids"),
    checkUnique(config.rehearsals, "skillId", "manifest-unique-skill-ids"),
  ];
}

function rehearsalOptions(config, rehearsal, index) {
  return {
    maxMinutes: rehearsal.maxMinutes === undefined
      ? config.maxMinutes
      : positiveNumber(rehearsal.maxMinutes, `rehearsals[${index}].maxMinutes`),
    maxSkillLines: rehearsal.maxSkillLines === undefined
      ? config.maxSkillLines
      : positiveNumber(rehearsal.maxSkillLines, `rehearsals[${index}].maxSkillLines`),
    ...rehearsal,
  };
}

function manifestThresholds(config) {
  return {
    minRehearsals: config.minRehearsals,
    minPassed: config.minPassed,
    maxMinutes: config.maxMinutes,
    maxSkillLines: config.maxSkillLines,
  };
}

function singleSummary(options, index, checks) {
  const failures = checks.filter((check) => check.status === "failed");
  return {
    mode: "single",
    status: failures.length ? "failed" : "passed",
    index,
    runId: options.runId ?? null,
    skillId: options.skillId ?? null,
    skillFile: options.skillFile,
    implementationChangeList: options.implementationChangeList,
    recording: options.recording,
    maxMinutes: options.maxMinutes,
    checkCounts: countChecks(checks),
    checks,
    note: NOTE,
  };
}

function requiredOptions(options) {
  return ["runId", "skillId", "skillFile", "implementationChangeList", "startedAt", "endedAt", "recording"]
    .filter((key) => !options[key])
    .map(toKebabCase);
}

function checkTiming(options) {
  const startedAt = parseTime(options.startedAt, "--started-at");
  const endedAt = parseTime(options.endedAt, "--ended-at");
  const durationMinutes = (endedAt - startedAt) / 60000;
  if (durationMinutes <= 0) return fail("timing", "ended-at must be later than started-at");
  if (durationMinutes > options.maxMinutes) {
    return fail("timing", `duration ${durationMinutes.toFixed(2)} min exceeds ${options.maxMinutes} min`);
  }
  return pass("timing", `${durationMinutes.toFixed(2)} min`);
}

async function checkSkillFile(options) {
  const normalized = normalizeProjectPath(options.skillFile);
  if (!normalized.startsWith("services/skills/src/") || !normalized.endsWith(".js")) {
    return fail("skill-file", "skill file must be a .js file under services/skills/src/");
  }
  const text = await readProjectText(options.skillFile);
  if (text === null) return fail("skill-file", "missing or unreadable");
  if (options.skillId && !text.includes(options.skillId)) {
    return fail("skill-file", `skill file does not contain skill id ${options.skillId}`);
  }
  const lineCount = text.split(/\r?\n/u).length;
  if (lineCount > options.maxSkillLines) {
    return fail("skill-file", `${lineCount} lines exceeds ${options.maxSkillLines}`);
  }
  return pass("skill-file", `${normalized}; ${lineCount} lines`);
}

async function checkSkillRegistry(options) {
  const registry = await readProjectText("services/skills/src/registry.js");
  if (registry === null) return fail("skill-registry", "missing services/skills/src/registry.js");
  const skillModule = path.posix.basename(normalizeProjectPath(options.skillFile), ".js");
  const importPattern = new RegExp(`["']\\./${escapeRegExp(skillModule)}\\.js["']`, "u");
  const moduleReferenceCount = countOccurrences(registry, skillModule);
  if (!importPattern.test(registry) || moduleReferenceCount < 2) {
    return fail("skill-registry", `registry must import ./${skillModule}.js and include it in SKILLS`);
  }
  return pass("skill-registry", `registered ${options.skillId} via ${skillModule}.js`);
}

async function checkRecording(options) {
  const stats = await statProjectPath(options.recording);
  if (!stats) return fail("recording", "missing");
  if (!stats.isFile() || stats.size === 0) {
    return fail("recording", "recording path must be a non-empty file");
  }
  return pass("recording", `${normalizeProjectPath(options.recording)}; ${stats.size} bytes`);
}

async function checkRunEvidence(options) {
  const runDir = `docs/reports/runs/${options.runId}`;
  const fileChecks = await Promise.all(["requirement.md", "plan.md", "diff.patch", "verification.json", "run-summary.json"].map((file) =>
    checkFileExists(`${runDir}/${file}`, `run-file:${file}`),
  ));
  return [
    ...fileChecks,
    await checkVerification(`${runDir}/verification.json`),
    await checkRunSummary(`${runDir}/run-summary.json`),
    await checkDiff(`${runDir}/diff.patch`),
  ];
}

async function checkFileExists(relativePath, name) {
  const stats = await statProjectPath(relativePath);
  if (!stats) return fail(name, "missing");
  if (!stats.isFile() || stats.size === 0) return fail(name, "missing or empty");
  return pass(name, `${relativePath}; ${stats.size} bytes`);
}

async function checkVerification(relativePath) {
  const text = await readProjectText(relativePath);
  if (text === null) return fail("verification", "missing verification.json");
  const verification = JSON.parse(text);
  const failedChecks = (verification.checks ?? []).filter((check) => check.exitCode !== 0);
  if (verification.status !== "passed" || failedChecks.length) {
    return fail("verification", "verification.json must have status=passed and all exitCode=0");
  }
  return pass("verification", `${verification.checks?.length ?? 0} checks passed`);
}

async function checkRunSummary(relativePath) {
  const text = await readProjectText(relativePath);
  if (text === null) return fail("run-summary", "missing run-summary.json");
  const summary = JSON.parse(text);
  if (summary.status !== "passed") return fail("run-summary", `run-summary status is ${summary.status}`);
  return pass("run-summary", `stage=${summary.stage ?? "unknown"}`);
}

async function checkDiff(relativePath) {
  const diff = await readProjectText(relativePath);
  if (diff === null) return fail("diff", "missing diff.patch");
  const changedFiles = [...diff.matchAll(/^diff --git a\/(.+?) b\/(.+)$/gum)];
  if (changedFiles.length === 0) {
    return fail("diff", "diff.patch must contain at least one changed file");
  }
  return pass("diff", `${changedFiles.length} changed files`);
}

function parseTime(value, label) {
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) throw new Error(`${label} must be an ISO timestamp`);
  return time;
}

function normalizeProjectPath(relativePath) {
  return relativePath.split(path.sep).join("/").replace(/^\/+/u, "").replace(/\/+$/u, "");
}

function resolveProjectPath(relativePath) {
  const absolutePath = path.isAbsolute(relativePath)
    ? path.resolve(relativePath)
    : path.resolve(PROJECT_ROOT, normalizeProjectPath(relativePath));
  const relative = path.relative(PROJECT_ROOT, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`path escapes project root: ${relativePath}`);
  }
  return absolutePath;
}

async function statProjectPath(relativePath) {
  try {
    return await stat(resolveProjectPath(relativePath));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function readProjectText(relativePath) {
  try {
    return await readFile(resolveProjectPath(relativePath), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function readRequiredProjectText(relativePath) {
  const text = await readProjectText(relativePath);
  if (text === null) throw new Error(`missing or unreadable file: ${relativePath}`);
  return text;
}

function checkUnique(items, key, name) {
  const seen = new Set();
  const duplicates = new Set();
  for (const item of items) {
    if (!item?.[key]) continue;
    if (seen.has(item[key])) duplicates.add(item[key]);
    seen.add(item[key]);
  }
  return duplicates.size
    ? fail(name, `duplicate ${key}: ${[...duplicates].join(", ")}`)
    : pass(name, `unique ${key}`);
}

function pass(name, detail) { return { name, status: "passed", detail }; }
function fail(name, detail) { return { name, status: "failed", detail }; }

function countChecks(checks) {
  return {
    total: checks.length,
    passed: checks.filter((check) => check.status === "passed").length,
    failed: checks.filter((check) => check.status === "failed").length,
  };
}

function countOccurrences(text, value) {
  return text.split(value).length - 1;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
