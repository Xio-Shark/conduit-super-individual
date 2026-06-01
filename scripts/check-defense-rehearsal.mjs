#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSafeWriteTarget, writeGeneratedOutput } from "./submission-write-guard.mjs";

const PROJECT_ROOT = process.env.DEFENSE_REHEARSAL_PROJECT_ROOT
  ? path.resolve(process.env.DEFENSE_REHEARSAL_PROJECT_ROOT)
  : fileURLToPath(new URL("..", import.meta.url));
const DEFAULT_FILE = "docs/reports/submission/defense-rehearsal-evidence.json";
const DEFAULT_TEMPLATE = "docs/reports/submission/defense-rehearsal-evidence.template.json";
const MIN_QUESTION_COUNT = 8;
const MIN_FOLLOW_UP_COUNT = 2;
const MIN_DURATION_MINUTES = 10;
const MAX_DURATION_MINUTES = 120;
const PLACEHOLDER_PATTERN = /待填|待部署|待录制|待发布|待人工|TODO|TBD|placeholder|REPLACE_WITH|example\.(?:com|net|org|invalid)/iu;
const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9_-]{20,}/u,
  /ghp_[a-zA-Z0-9]{20,}/u,
  /Bearer [a-zA-Z0-9._-]{20,}/u,
];
const REQUIRED_TOPICS = [
  "architecture",
  "u1-schema-driven",
  "u2-multi-turn-clarify",
  "u3-plan-llm",
  "u4-semantic-recall",
  "u5-non-list-skill",
  "u6-live-skill",
  "submission-boundary",
];
const NOTE = "This validates locally recorded defense Q&A rehearsal evidence only; it does not prove that a live defense happened or that external submission links are real.";

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
    mode: "defense-rehearsal-check",
    path: relativePath,
    status: failures.length ? "failed" : "passed",
    requiredTopics: REQUIRED_TOPICS,
    checkCounts: countChecks(checks),
    checks,
    note: NOTE,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (failures.length) process.exit(1);
}

async function writeTemplate(output = DEFAULT_TEMPLATE) {
  const absolutePath = await resolveSafeWriteTarget(PROJECT_ROOT, output, "defense rehearsal template");
  const relativePath = normalizeProjectPath(path.relative(PROJECT_ROOT, absolutePath));
  await writeGeneratedOutput(absolutePath, JSON.stringify(template(), null, 2));
  const checks = [pass("template", `${relativePath} placeholder template written`)];
  const finalPath = finalEvidencePath(relativePath, DEFAULT_FILE);
  const checkCommand = `npm run check:defense-rehearsal -- --file ${shellArg(finalPath)}`;
  console.log(JSON.stringify({
    mode: "defense-rehearsal-template",
    status: "scaffolded",
    output: relativePath,
    finalPath,
    checkCommand,
    nextSteps: nextSteps(relativePath, finalPath, checkCommand),
    checkCounts: countChecks(checks),
    checks,
    note: "Template only. Fill real Q&A rehearsal evidence, save as defense-rehearsal-evidence.json, then run npm run check:defense-rehearsal.",
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
  checks.push(...await checkRehearsal(evidence.rehearsal));
  checks.push(...checkCoverage(evidence.coverage, evidence.questions));
  checks.push(...await checkQuestions(evidence.questions));
  checks.push(...checkFollowUps(evidence.followUps));
  checks.push(...await checkOutcome(evidence.outcome));
  return checks;
}

async function checkRehearsal(rehearsal) {
  const checks = [
    nonEmpty("rehearsal.title", rehearsal?.title),
    isoTime("rehearsal.startedAt", rehearsal?.startedAt),
    isoTime("rehearsal.endedAt", rehearsal?.endedAt),
  ];
  checks.push(checkDuration(rehearsal));

  if (!Array.isArray(rehearsal?.participants) || rehearsal.participants.length === 0) {
    checks.push(fail("rehearsal.participants", "must contain at least one participant"));
  } else {
    checks.push(pass("rehearsal.participants", `${rehearsal.participants.length} participant(s)`));
    rehearsal.participants.forEach((participant, index) => {
      checks.push(nonEmpty(`rehearsal.participants[${index}].name`, participant?.name));
      checks.push(nonEmpty(`rehearsal.participants[${index}].role`, participant?.role));
    });
  }

  checks.push(await fileCheck("rehearsal.recording", rehearsal?.recording));
  checks.push(await fileCheck("rehearsal.notes", rehearsal?.notes));
  return checks;
}

function checkDuration(rehearsal) {
  const startedAt = parseDate(rehearsal?.startedAt);
  const endedAt = parseDate(rehearsal?.endedAt);
  if (!startedAt || !endedAt) return fail("rehearsal.duration", "startedAt and endedAt must be valid ISO timestamps");
  const durationMinutes = (endedAt - startedAt) / 60000;
  if (durationMinutes < MIN_DURATION_MINUTES) {
    return fail("rehearsal.duration", `duration ${durationMinutes.toFixed(2)} min is shorter than ${MIN_DURATION_MINUTES} min`);
  }
  if (durationMinutes > MAX_DURATION_MINUTES) {
    return fail("rehearsal.duration", `duration ${durationMinutes.toFixed(2)} min exceeds ${MAX_DURATION_MINUTES} min`);
  }
  return pass("rehearsal.duration", `${durationMinutes.toFixed(2)} min`);
}

function checkCoverage(coverage, questions) {
  const declared = new Set(Array.isArray(coverage) ? coverage : []);
  const questionTopics = new Set(Array.isArray(questions)
    ? questions.map((question) => question?.topic).filter(Boolean)
    : []);
  const missingDeclared = REQUIRED_TOPICS.filter((topic) => !declared.has(topic));
  const missingQuestions = REQUIRED_TOPICS.filter((topic) => !questionTopics.has(topic));
  return [
    missingDeclared.length
      ? fail("coverage.declared", `missing: ${missingDeclared.join(", ")}`)
      : pass("coverage.declared", `covers ${REQUIRED_TOPICS.length} required topics`),
    missingQuestions.length
      ? fail("coverage.questions", `missing question topics: ${missingQuestions.join(", ")}`)
      : pass("coverage.questions", `questions cover ${REQUIRED_TOPICS.length} required topics`),
  ];
}

async function checkQuestions(questions) {
  const checks = [];
  if (!Array.isArray(questions) || questions.length < MIN_QUESTION_COUNT) {
    return [fail("questions", `must contain at least ${MIN_QUESTION_COUNT} answered questions`)];
  }

  checks.push(pass("questions", `${questions.length} question(s)`));
  checks.push(checkUnique(questions, "id", "questions.unique-ids"));
  for (let index = 0; index < questions.length; index += 1) {
    const question = questions[index];
    checks.push(nonEmpty(`questions[${index}].id`, question?.id));
    checks.push(nonEmpty(`questions[${index}].topic`, question?.topic));
    checks.push(nonEmpty(`questions[${index}].question`, question?.question));
    checks.push(nonEmpty(`questions[${index}].answerSummary`, question?.answerSummary));
    checks.push(question?.status === "answered"
      ? pass(`questions[${index}].status`, "answered")
      : fail(`questions[${index}].status`, "must be answered"));

    const refs = Array.isArray(question?.evidenceRefs) ? question.evidenceRefs : [];
    if (refs.length === 0) {
      checks.push(fail(`questions[${index}].evidenceRefs`, "must contain at least one local evidence file"));
    } else {
      checks.push(pass(`questions[${index}].evidenceRefs`, `${refs.length} ref(s)`));
      for (const [refIndex, ref] of refs.entries()) {
        checks.push(await fileCheck(`questions[${index}].evidenceRefs[${refIndex}]`, ref));
      }
    }
  }
  return checks;
}

function checkFollowUps(followUps) {
  const checks = [];
  if (!Array.isArray(followUps) || followUps.length < MIN_FOLLOW_UP_COUNT) {
    return [fail("followUps", `must contain at least ${MIN_FOLLOW_UP_COUNT} answered follow-up drills`)];
  }

  checks.push(pass("followUps", `${followUps.length} follow-up(s)`));
  for (const [index, followUp] of followUps.entries()) {
    checks.push(nonEmpty(`followUps[${index}].questionId`, followUp?.questionId));
    checks.push(nonEmpty(`followUps[${index}].prompt`, followUp?.prompt));
    checks.push(nonEmpty(`followUps[${index}].answerSummary`, followUp?.answerSummary));
    checks.push(followUp?.status === "answered"
      ? pass(`followUps[${index}].status`, "answered")
      : fail(`followUps[${index}].status`, "must be answered"));
  }
  return checks;
}

async function checkOutcome(outcome) {
  return [
    outcome?.status === "passed"
      ? pass("outcome.status", "passed")
      : fail("outcome.status", "must be passed"),
    Array.isArray(outcome?.openIssues) && outcome.openIssues.length === 0
      ? pass("outcome.openIssues", "none")
      : fail("outcome.openIssues", "must be an empty array"),
    outcome?.defensePrepFinalized === true
      ? pass("outcome.defensePrepFinalized", "true")
      : fail("outcome.defensePrepFinalized", "must be true"),
    await fileCheck("outcome.defensePrepPath", outcome?.defensePrepPath),
  ];
}

function nonEmpty(name, value) {
  return typeof value === "string" && value.trim() && !PLACEHOLDER_PATTERN.test(value)
    ? pass(name, "present")
    : fail(name, "missing or placeholder");
}

function isoTime(name, value) {
  if (typeof value !== "string" || PLACEHOLDER_PATTERN.test(value)) return fail(name, "missing or placeholder");
  return parseDate(value)
    ? pass(name, value)
    : fail(name, "invalid ISO timestamp");
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
    rehearsal: {
      title: "REPLACE_WITH_REHEARSAL_TITLE",
      startedAt: "REPLACE_WITH_START_ISO",
      endedAt: "REPLACE_WITH_END_ISO",
      participants: [
        { name: "REPLACE_WITH_PRESENTER_NAME", role: "presenter" },
        { name: "REPLACE_WITH_REVIEWER_NAME", role: "reviewer" },
      ],
      recording: "docs/reports/submission/defense-qna-recordings/REPLACE_WITH_RECORDING.mp4",
      notes: "docs/reports/submission/defense-qna-notes/REPLACE_WITH_NOTES.md",
    },
    coverage: REQUIRED_TOPICS,
    questions: REQUIRED_TOPICS.map((topic, index) => ({
      id: `q${index + 1}`,
      topic,
      question: "REPLACE_WITH_REAL_QUESTION",
      answerSummary: "REPLACE_WITH_ANSWER_SUMMARY",
      status: "answered",
      evidenceRefs: ["REPLACE_WITH_LOCAL_EVIDENCE_FILE"],
    })),
    followUps: [
      { questionId: "q1", prompt: "REPLACE_WITH_FOLLOW_UP", answerSummary: "REPLACE_WITH_ANSWER_SUMMARY", status: "answered" },
      { questionId: "q2", prompt: "REPLACE_WITH_FOLLOW_UP", answerSummary: "REPLACE_WITH_ANSWER_SUMMARY", status: "answered" },
    ],
    outcome: {
      status: "passed",
      openIssues: [],
      defensePrepFinalized: true,
      defensePrepPath: "docs/reports/submission/defense-prep.md",
    },
  };
}

function parseDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
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
  return "Usage: node scripts/check-defense-rehearsal.mjs [--file <path>] [--write-template <path>]";
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
    mode: "defense-rehearsal-check",
    status: "failed",
    requiredTopics: REQUIRED_TOPICS,
    checkCounts: countChecks(checks),
    checks,
    usage: usage(),
    note: NOTE,
  }, null, 2));
  process.exit(1);
});
