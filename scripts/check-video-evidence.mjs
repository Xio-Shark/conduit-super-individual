#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSafeWriteTarget, writeGeneratedOutput } from "./submission-write-guard.mjs";

const PROJECT_ROOT = process.env.VIDEO_EVIDENCE_PROJECT_ROOT
  ? path.resolve(process.env.VIDEO_EVIDENCE_PROJECT_ROOT)
  : fileURLToPath(new URL("..", import.meta.url));
const DEFAULT_FILE = "docs/reports/submission/video-evidence.json";
const DEFAULT_TEMPLATE = "docs/reports/submission/video-evidence.template.json";
const MIN_DURATION_MINUTES = 3;
const MAX_DURATION_MINUTES = 8;
const PLACEHOLDER_PATTERN = /待填|待部署|待录制|待发布|待人工|TODO|TBD|placeholder|REPLACE_WITH|example\.(?:com|net|org|invalid)/iu;
const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9_-]{20,}/u,
  /ghp_[a-zA-Z0-9]{20,}/u,
  /Bearer [a-zA-Z0-9._-]{20,}/u,
];
const REQUIRED_COVERAGE = [
  "p2.1",
  "p2.2-1",
  "p2.2-2",
  "p2.2-3",
  "p2.2-4",
  "p2.2-5",
  "p2.2-6",
  "u1-schema-driven",
  "u2-multi-turn-clarify",
  "u3-plan-llm",
  "u4-semantic-recall",
  "u5-non-list-skill",
  "ai-usage",
  "public-repo",
];
const NOTE = "This validates local video recording evidence only; it does not upload the video, verify a public video URL, publish a repository, or prove final external submission.";

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.writeTemplate) {
    await writeTemplate(options.writeTemplate);
    return;
  }

  const relativePath = normalizeProjectPath(options.file ?? DEFAULT_FILE);
  const checks = await checkEvidence(relativePath);
  const failures = checks.filter((check) => check.status === "failed");
  const summary = {
    mode: "video-evidence-check",
    path: relativePath,
    status: failures.length ? "failed" : "passed",
    requiredCoverage: REQUIRED_COVERAGE,
    checkCounts: countChecks(checks),
    checks,
    note: NOTE,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (failures.length) process.exit(1);
}

async function writeTemplate(output = DEFAULT_TEMPLATE) {
  const absolutePath = await resolveSafeWriteTarget(PROJECT_ROOT, output, "video evidence template");
  const relativePath = normalizeProjectPath(path.relative(PROJECT_ROOT, absolutePath));
  await writeGeneratedOutput(absolutePath, JSON.stringify(template(), null, 2));
  const checks = [pass("template", `${relativePath} placeholder template written`)];
  const finalPath = finalEvidencePath(relativePath, DEFAULT_FILE);
  const checkCommand = `npm run check:video-evidence -- --file ${shellArg(finalPath)}`;
  console.log(JSON.stringify({
    mode: "video-evidence-template",
    status: "scaffolded",
    output: relativePath,
    finalPath,
    checkCommand,
    nextSteps: nextSteps(relativePath, finalPath, checkCommand),
    checkCounts: countChecks(checks),
    checks,
    note: "Template only. Fill real local recording evidence, save as video-evidence.json, then run npm run check:video-evidence.",
  }, null, 2));
}

function finalEvidencePath(templatePath, defaultPath) {
  return templatePath.endsWith(".template.json")
    ? templatePath.replace(/\.template\.json$/u, ".json")
    : defaultPath;
}

function nextSteps(templatePath, finalPath, checkCommand) {
  return {
    copyFrom: templatePath,
    writeTo: finalPath,
    validateWith: checkCommand,
  };
}

async function checkEvidence(relativePath) {
  const checks = [];
  const text = await readProjectText(relativePath);
  if (text === null) return [fail("evidence-file", `missing ${relativePath}`)];
  checks.push(pass("evidence-file", `${relativePath}; ${Buffer.byteLength(text)} bytes`));
  checks.push(checkNoPlaceholders(text));
  checks.push(checkNoSecrets(text));

  let evidence;
  try {
    evidence = JSON.parse(text);
  } catch (error) {
    checks.push(fail("json", `invalid JSON: ${error.message}`));
    return checks;
  }

  checks.push(pass("json", "valid"));
  checks.push(checkNoExternalUploadClaims(evidence));
  checks.push(...await checkVideo(evidence.video));
  checks.push(...await checkSegments(evidence.segments, evidence.video?.durationMinutes));
  checks.push(...checkCoverage(evidence.coverage, evidence.segments));
  checks.push(...await checkOutcome(evidence.outcome));
  return checks;
}

async function checkVideo(video) {
  const checks = [
    nonEmpty("video.title", video?.title),
    isoTime("video.recordedAt", video?.recordedAt),
  ];

  const duration = Number(video?.durationMinutes);
  checks.push(Number.isFinite(duration) && duration >= MIN_DURATION_MINUTES && duration <= MAX_DURATION_MINUTES
    ? pass("video.durationMinutes", `${duration} min`)
    : fail("video.durationMinutes", `must be a number between ${MIN_DURATION_MINUTES} and ${MAX_DURATION_MINUTES}`));
  checks.push(await fileCheck("video.recording", video?.recording));
  checks.push(await fileCheck("video.notes", video?.notes));
  return checks;
}

async function checkSegments(segments, durationMinutes) {
  const checks = [];
  if (!Array.isArray(segments) || segments.length === 0) {
    return [fail("segments", "must contain at least one timeline segment")];
  }

  checks.push(pass("segments", `${segments.length} segment(s)`));
  checks.push(checkUnique(segments, "id", "segments.unique-ids"));
  checks.push(checkTimeline(segments, durationMinutes));
  for (const [index, segment] of segments.entries()) {
    checks.push(nonEmpty(`segments[${index}].id`, segment?.id));
    checks.push(nonEmpty(`segments[${index}].title`, segment?.title));
    checks.push(numberCheck(`segments[${index}].startSeconds`, segment?.startSeconds));
    checks.push(numberCheck(`segments[${index}].endSeconds`, segment?.endSeconds));
    checks.push(checkSegmentDuration(segment, index));
    checks.push(checkSegmentCoverage(segment, index));
    checks.push(...await checkEvidenceRefs(segment?.evidenceRefs, `segments[${index}].evidenceRefs`));
  }
  return checks;
}

function checkTimeline(segments, durationMinutes) {
  const durationSeconds = Number(durationMinutes) * 60;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return fail("segments.timeline", "video.durationMinutes must be valid before checking timeline");
  }

  const normalized = segments
    .map((segment, index) => ({
      index,
      start: Number(segment?.startSeconds),
      end: Number(segment?.endSeconds),
    }))
    .sort((a, b) => a.start - b.start);

  for (const segment of normalized) {
    if (!Number.isFinite(segment.start) || !Number.isFinite(segment.end)) {
      return fail("segments.timeline", `segment ${segment.index} has invalid start/end seconds`);
    }
    if (segment.start < 0 || segment.end > durationSeconds) {
      return fail("segments.timeline", `segment ${segment.index} is outside ${durationSeconds.toFixed(0)} second video duration`);
    }
  }

  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index].start < normalized[index - 1].end) {
      return fail("segments.timeline", `segment ${normalized[index].index} overlaps segment ${normalized[index - 1].index}`);
    }
  }
  return pass("segments.timeline", `within ${durationSeconds.toFixed(0)} second video duration`);
}

function checkSegmentDuration(segment, index) {
  const start = Number(segment?.startSeconds);
  const end = Number(segment?.endSeconds);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return fail(`segments[${index}].duration`, "startSeconds and endSeconds must be numbers");
  }
  return end > start
    ? pass(`segments[${index}].duration`, `${(end - start).toFixed(0)} sec`)
    : fail(`segments[${index}].duration`, "endSeconds must be greater than startSeconds");
}

function checkSegmentCoverage(segment, index) {
  const coverage = Array.isArray(segment?.coverage) ? segment.coverage : [];
  if (coverage.length === 0) return fail(`segments[${index}].coverage`, "must contain at least one coverage id");
  const unknown = coverage.filter((item) => !REQUIRED_COVERAGE.includes(item));
  return unknown.length
    ? fail(`segments[${index}].coverage`, `unknown coverage ids: ${unknown.join(", ")}`)
    : pass(`segments[${index}].coverage`, `${coverage.length} coverage id(s)`);
}

async function checkEvidenceRefs(refs, name) {
  const checks = [];
  if (!Array.isArray(refs) || refs.length === 0) {
    return [fail(name, "must contain at least one local evidence file")];
  }
  checks.push(pass(name, `${refs.length} ref(s)`));
  for (const [index, ref] of refs.entries()) {
    checks.push(await fileCheck(`${name}[${index}]`, ref));
  }
  return checks;
}

function checkCoverage(coverage, segments) {
  const declared = new Set(Array.isArray(coverage) ? coverage : []);
  const timeline = new Set(Array.isArray(segments)
    ? segments.flatMap((segment) => Array.isArray(segment?.coverage) ? segment.coverage : [])
    : []);
  const missingDeclared = REQUIRED_COVERAGE.filter((item) => !declared.has(item));
  const missingTimeline = REQUIRED_COVERAGE.filter((item) => !timeline.has(item));
  return [
    missingDeclared.length
      ? fail("coverage.declared", `missing: ${missingDeclared.join(", ")}`)
      : pass("coverage.declared", `covers ${REQUIRED_COVERAGE.length} required items`),
    missingTimeline.length
      ? fail("coverage.timeline", `missing segment coverage: ${missingTimeline.join(", ")}`)
      : pass("coverage.timeline", `segments cover ${REQUIRED_COVERAGE.length} required items`),
  ];
}

async function checkOutcome(outcome) {
  return [
    outcome?.status === "recorded"
      ? pass("outcome.status", "recorded")
      : fail("outcome.status", "must be recorded"),
    Array.isArray(outcome?.openIssues) && outcome.openIssues.length === 0
      ? pass("outcome.openIssues", "none")
      : fail("outcome.openIssues", "must be an empty array"),
    outcome?.scriptReviewed === true
      ? pass("outcome.scriptReviewed", "true")
      : fail("outcome.scriptReviewed", "must be true"),
    await fileCheck("outcome.guidePath", outcome?.guidePath),
  ];
}

function checkNoExternalUploadClaims(evidence) {
  const claims = [
    evidence?.video?.url,
    evidence?.video?.videoUrl,
    evidence?.links?.videoUrl,
    evidence?.upload?.url,
    evidence?.upload?.verifiedAt,
    evidence?.upload?.status === "uploaded" ? "uploaded" : "",
    evidence?.upload?.status === "verified" ? "verified" : "",
  ].filter(Boolean);
  return claims.length
    ? fail("external-upload-claims", "video upload or public URL claims belong in external-submission-evidence.json")
    : pass("external-upload-claims", "none");
}

function nonEmpty(name, value) {
  return typeof value === "string" && value.trim() && !PLACEHOLDER_PATTERN.test(value)
    ? pass(name, "present")
    : fail(name, "missing or placeholder");
}

function numberCheck(name, value) {
  return Number.isFinite(Number(value))
    ? pass(name, String(value))
    : fail(name, "must be a number");
}

function isoTime(name, value) {
  if (typeof value !== "string" || PLACEHOLDER_PATTERN.test(value)) return fail(name, "missing or placeholder");
  const time = new Date(value);
  return Number.isNaN(time.getTime())
    ? fail(name, "invalid ISO timestamp")
    : pass(name, value);
}

async function fileCheck(name, value) {
  if (typeof value !== "string" || PLACEHOLDER_PATTERN.test(value)) {
    return fail(name, "missing or placeholder");
  }
  const stats = await statProjectPath(value);
  if (!stats) return fail(name, "missing local evidence file");
  if (!stats.isFile() || stats.size === 0) return fail(name, "missing or empty local evidence file");
  return pass(name, `${normalizeProjectPath(value)}; ${stats.size} bytes`);
}

function checkNoPlaceholders(text) {
  return PLACEHOLDER_PATTERN.test(text)
    ? fail("placeholders", "human-pending placeholder remains")
    : pass("placeholders", "none");
}

function checkNoSecrets(text) {
  return SECRET_PATTERNS.some((pattern) => pattern.test(text))
    ? fail("secret-patterns", "possible secret pattern")
    : pass("secret-patterns", "none");
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

function template() {
  return {
    video: {
      title: "REPLACE_WITH_VIDEO_TITLE",
      recordedAt: "REPLACE_WITH_RECORDING_ISO_TIME",
      durationMinutes: 6,
      recording: "docs/reports/submission/video-recordings/REPLACE_WITH_RECORDING.mp4",
      notes: "docs/reports/submission/video-notes/REPLACE_WITH_NOTES.md",
    },
    coverage: REQUIRED_COVERAGE,
    segments: REQUIRED_COVERAGE.map((coverage, index) => ({
      id: `segment-${index + 1}`,
      title: "REPLACE_WITH_SEGMENT_TITLE",
      startSeconds: index * 20,
      endSeconds: index * 20 + 20,
      coverage: [coverage],
      evidenceRefs: ["REPLACE_WITH_LOCAL_EVIDENCE_FILE"],
    })),
    outcome: {
      status: "recorded",
      openIssues: [],
      scriptReviewed: true,
      guidePath: "docs/reports/submission/video-recording-guide.md",
    },
  };
}

async function readProjectText(relativePath) {
  try {
    return await readFile(resolveInsideProject(relativePath), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function statProjectPath(relativePath) {
  try {
    return await stat(resolveInsideProject(relativePath));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function resolveInsideProject(relativePath) {
  const absolutePath = path.resolve(PROJECT_ROOT, normalizeProjectPath(relativePath));
  const relative = path.relative(PROJECT_ROOT, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`path escapes project root: ${relativePath}`);
  }
  return absolutePath;
}

function normalizeProjectPath(relativePath) {
  return relativePath.split(path.sep).join("/").replace(/^\/+/u, "").replace(/\/+$/u, "");
}

function shellArg(value) {
  const text = String(value);
  return /^[A-Za-z0-9_./:=+-]+$/u.test(text) ? text : shellQuote(text);
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

function pass(name, detail) {
  return { name, status: "passed", detail };
}

function fail(name, detail) {
  return { name, status: "failed", detail };
}

function countChecks(checks) {
  return {
    total: checks.length,
    passed: checks.filter((check) => check.status === "passed").length,
    failed: checks.filter((check) => check.status === "failed").length,
  };
}

function parseArgs(args) {
  const options = {};
  const filteredArgs = args.filter((arg) => arg !== "--json");
  for (let index = 0; index < filteredArgs.length; index += 2) {
    const name = filteredArgs[index];
    const value = filteredArgs[index + 1];
    if (!name?.startsWith("--") || isMissingFlagValue(value)) throw new Error(usage());
    if (name === "--file") options.file = value;
    else if (name === "--write-template") options.writeTemplate = value;
    else throw new Error(usage());
  }
  return options;
}

function isMissingFlagValue(value) {
  return value === undefined || value.startsWith("--");
}

function usage() {
  return "Usage: node scripts/check-video-evidence.mjs [--file <path>] [--write-template <path>]";
}

main().catch((error) => {
  const checks = [
    {
      name: "fatal",
      status: "failed",
      detail: error.message,
    },
  ];
  console.log(JSON.stringify({
    mode: "video-evidence-check",
    status: "failed",
    requiredCoverage: REQUIRED_COVERAGE,
    checkCounts: countChecks(checks),
    checks,
    usage: usage(),
    note: NOTE,
  }, null, 2));
  process.exit(1);
});
