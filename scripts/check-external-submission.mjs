#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSafeWriteTarget, writeGeneratedOutput } from "./submission-write-guard.mjs";

const PROJECT_ROOT = process.env.EXTERNAL_SUBMISSION_PROJECT_ROOT
  ? path.resolve(process.env.EXTERNAL_SUBMISSION_PROJECT_ROOT)
  : fileURLToPath(new URL("..", import.meta.url));
const DEFAULT_FILE = "docs/reports/submission/external-submission-evidence.json";
const DEFAULT_TEMPLATE = "docs/reports/submission/external-submission-evidence.template.json";
const PLACEHOLDER_PATTERN = /待填|待部署|待录制|待发布|待人工|TODO|TBD|placeholder|REPLACE_WITH|example\.(?:com|net|org|invalid)/iu;
const PLACEHOLDER_URL_PATTERN = /(?:^|[/.])example\.(?:com|net|org|invalid)|\/example(?:\/|$)|REPLACE_WITH|placeholder/iu;
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
  "ai-usage",
  "public-repo",
];
const NOTE = "This validates the locally recorded external submission evidence file. It does not create URLs, upload videos, publish repositories, or verify remote platform state.";

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.writeTemplate) {
    await writeTemplate(options.writeTemplate, options);
    return;
  }
  const relativePath = normalize(options.file ?? DEFAULT_FILE);
  const expectedFreshClonePath = options.publicRepo ?? process.env.PUBLIC_REPO_CLONE_PATH;
  const checks = await checkEvidence(relativePath, expectedFreshClonePath);
  const failures = checks.filter((check) => check.status === "failed");
  const summary = {
    mode: "external-submission-check",
    path: relativePath,
    status: failures.length ? "failed" : "passed",
    checkCounts: countChecks(checks),
    checks,
    note: NOTE,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (failures.length) process.exit(1);
}

async function writeTemplate(output = DEFAULT_TEMPLATE, options = {}) {
  const absolutePath = await resolveSafeWriteTarget(PROJECT_ROOT, output, "external submission template");
  const relativePath = normalize(path.relative(PROJECT_ROOT, absolutePath));
  await writeGeneratedOutput(absolutePath, JSON.stringify(template(), null, 2));
  const checks = [pass("template", `${relativePath} placeholder template written`)];
  const finalPath = finalEvidencePath(relativePath, DEFAULT_FILE);
  const checkCommand = buildTemplateCheckCommand(finalPath, options.publicRepo);
  console.log(JSON.stringify({
    mode: "external-submission-template",
    status: "scaffolded",
    output: relativePath,
    finalPath,
    checkCommand,
    nextSteps: nextSteps(relativePath, finalPath, checkCommand),
    checkCounts: countChecks(checks),
    checks,
    note: "Template only. Fill real external submission evidence, save as external-submission-evidence.json, then run npm run check:external-submission.",
  }, null, 2));
}

function buildTemplateCheckCommand(finalPath, publicRepo) {
  const repoArg = publicRepo ? shellArg(publicRepo) : "<fresh-clone-path>";
  return `npm run check:external-submission -- --file ${shellArg(finalPath)} --public-repo ${repoArg}`;
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

async function checkEvidence(relativePath, expectedFreshClonePath) {
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
  checks.push(...checkTeam(evidence.team));
  checks.push(...checkLinks(evidence.links));
  checks.push(...checkVideo(evidence.video));
  checks.push(...await checkPublicRepo(evidence.publicRepo, evidence.links, expectedFreshClonePath));
  checks.push(...checkSecurity(evidence.security));
  checks.push(...checkSubmission(evidence.submission));
  return checks;
}

function checkTeam(team) {
  const checks = [];
  checks.push(nonEmpty("team.name", team?.name));
  if (!Array.isArray(team?.members) || team.members.length === 0) {
    checks.push(fail("team.members", "must contain at least one real member"));
    return checks;
  }
  checks.push(pass("team.members", `${team.members.length} member(s)`));
  team.members.forEach((member, index) => {
    checks.push(nonEmpty(`team.members[${index}].name`, member?.name));
    checks.push(nonEmpty(`team.members[${index}].role`, member?.role));
  });
  return checks;
}

function checkLinks(links) {
  return [
    urlCheck("links.demoUrl", links?.demoUrl),
    urlCheck("links.videoUrl", links?.videoUrl),
    urlCheck("links.publicRepoUrl", links?.publicRepoUrl),
  ];
}

function checkVideo(video) {
  const checks = [];
  const duration = Number(video?.durationMinutes);
  checks.push(Number.isFinite(duration) && duration >= 3 && duration <= 8
    ? pass("video.durationMinutes", `${duration} min`)
    : fail("video.durationMinutes", "must be a number between 3 and 8"));
  const coverage = Array.isArray(video?.coverage) ? video.coverage : [];
  const missing = REQUIRED_COVERAGE.filter((item) => !coverage.includes(item));
  checks.push(missing.length
    ? fail("video.coverage", `missing: ${missing.join(", ")}`)
    : pass("video.coverage", `covers ${REQUIRED_COVERAGE.length} required items`));
  return checks;
}

async function checkPublicRepo(publicRepo, links, expectedFreshClonePath) {
  const checks = [
    urlCheck("publicRepo.url", publicRepo?.url),
    await directoryCheck("publicRepo.freshClonePath", publicRepo?.freshClonePath),
    statusPassed("publicRepo.freshCloneCheckStatus", publicRepo?.freshCloneCheckStatus),
    isoTime("publicRepo.freshCloneCheckedAt", publicRepo?.freshCloneCheckedAt),
  ];
  if (publicRepo?.url && links?.publicRepoUrl && publicRepo.url !== links.publicRepoUrl) {
    checks.push(fail("publicRepo.url-match", "publicRepo.url must match links.publicRepoUrl"));
  } else {
    checks.push(pass("publicRepo.url-match", "matches links.publicRepoUrl"));
  }
  checks.push(checkExpectedFreshClonePath(publicRepo?.freshClonePath, expectedFreshClonePath));
  return checks;
}

function checkSecurity(security) {
  return [
    statusPassed("security.remoteSecretScanningStatus", security?.remoteSecretScanningStatus),
    isoTime("security.remoteSecretScanningCheckedAt", security?.remoteSecretScanningCheckedAt),
    nonEmpty("security.remoteSecretScanningEvidence", security?.remoteSecretScanningEvidence),
  ];
}

function checkSubmission(submission) {
  return [
    statusSubmitted("submission.status", submission?.status),
    isoTime("submission.submittedAt", submission?.submittedAt),
    nonEmpty("submission.platform", submission?.platform),
    nonEmpty("submission.confirmation", submission?.confirmation),
  ];
}

function nonEmpty(name, value) {
  return typeof value === "string" && value.trim() && !PLACEHOLDER_PATTERN.test(value)
    ? pass(name, "present")
    : fail(name, "missing or placeholder");
}

function urlCheck(name, value) {
  if (typeof value !== "string" || PLACEHOLDER_PATTERN.test(value)) return fail(name, "missing or placeholder");
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return fail(name, "must be http(s)");
    return PLACEHOLDER_URL_PATTERN.test(`${url.hostname}${url.pathname}`)
      ? fail(name, "placeholder URL")
      : pass(name, value);
  } catch {
    return fail(name, "invalid URL");
  }
}

function statusPassed(name, value) {
  return value === "passed"
    ? pass(name, value)
    : fail(name, "must be passed");
}

function statusSubmitted(name, value) {
  return value === "submitted"
    ? pass(name, value)
    : fail(name, "must be submitted");
}

async function directoryCheck(name, value) {
  if (typeof value !== "string" || PLACEHOLDER_PATTERN.test(value)) return fail(name, "missing or placeholder");
  const absolutePath = resolveLocalPath(value);
  let stats;
  try {
    stats = await stat(absolutePath);
  } catch (error) {
    if (error.code === "ENOENT") return fail(name, "missing local fresh clone directory");
    throw error;
  }
  return stats.isDirectory()
    ? pass(name, absolutePath)
    : fail(name, "must be a local fresh clone directory");
}

function checkExpectedFreshClonePath(actual, expected) {
  if (!expected) return pass("publicRepo.freshClonePath-match", "no expected path provided");
  if (typeof actual !== "string" || PLACEHOLDER_PATTERN.test(actual)) {
    return fail("publicRepo.freshClonePath-match", "actual path is missing or placeholder");
  }
  if (PLACEHOLDER_PATTERN.test(expected)) {
    return fail("publicRepo.freshClonePath-match", "expected path is placeholder");
  }
  const actualPath = resolveLocalPath(actual);
  const expectedPath = resolveLocalPath(expected);
  return actualPath === expectedPath
    ? pass("publicRepo.freshClonePath-match", actualPath)
    : fail("publicRepo.freshClonePath-match", `must match expected fresh clone path: ${expectedPath}`);
}

function resolveLocalPath(value) {
  return path.isAbsolute(value)
    ? path.normalize(value)
    : path.resolve(PROJECT_ROOT, normalize(value));
}

function isoTime(name, value) {
  if (typeof value !== "string" || PLACEHOLDER_PATTERN.test(value)) return fail(name, "missing or placeholder");
  const time = new Date(value);
  return Number.isNaN(time.getTime())
    ? fail(name, "invalid ISO timestamp")
    : pass(name, value);
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

function template() {
  return {
    team: {
      name: "REPLACE_WITH_TEAM_NAME",
      members: [
        { name: "REPLACE_WITH_MEMBER_NAME", role: "REPLACE_WITH_ROLE" },
      ],
    },
    links: {
      demoUrl: "REPLACE_WITH_DEMO_URL",
      videoUrl: "REPLACE_WITH_VIDEO_URL",
      publicRepoUrl: "REPLACE_WITH_PUBLIC_REPO_URL",
    },
    video: {
      durationMinutes: 5,
      coverage: REQUIRED_COVERAGE,
    },
    publicRepo: {
      url: "REPLACE_WITH_PUBLIC_REPO_URL",
      freshClonePath: "REPLACE_WITH_FRESH_CLONE_PATH",
      freshCloneCheckStatus: "passed",
      freshCloneCheckedAt: "REPLACE_WITH_ISO_TIME",
    },
    security: {
      remoteSecretScanningStatus: "passed",
      remoteSecretScanningCheckedAt: "REPLACE_WITH_ISO_TIME",
      remoteSecretScanningEvidence: "REPLACE_WITH_REMOTE_SECRET_SCANNING_EVIDENCE",
    },
    submission: {
      status: "submitted",
      submittedAt: "REPLACE_WITH_ISO_TIME",
      platform: "REPLACE_WITH_SUBMISSION_PLATFORM",
      confirmation: "REPLACE_WITH_CONFIRMATION_ID_OR_SCREENSHOT_LINK",
    },
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
    else if (name === "--public-repo") options.publicRepo = value;
    else if (name === "--write-template") options.writeTemplate = value;
    else throw new Error(usage());
  }
  return options;
}

function isMissingFlagValue(value) {
  return value === undefined || value.startsWith("--");
}

async function readProjectText(relativePath) {
  try {
    return await readFile(resolveInsideProject(relativePath), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function resolveInsideProject(relativePath) {
  const absolutePath = path.resolve(PROJECT_ROOT, normalize(relativePath));
  const relative = path.relative(PROJECT_ROOT, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`path escapes project root: ${relativePath}`);
  }
  return absolutePath;
}

function normalize(relativePath) {
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

function usage() {
  return "Usage: node scripts/check-external-submission.mjs [--file <path>] [--public-repo <fresh-clone-path>] [--write-template <path>]";
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
    mode: "external-submission-check",
    status: "failed",
    checkCounts: countChecks(checks),
    checks,
    usage: usage(),
    note: NOTE,
  }, null, 2));
  process.exit(1);
});
