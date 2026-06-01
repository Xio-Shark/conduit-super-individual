#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSafeWriteTarget, writeGeneratedOutput } from "./submission-write-guard.mjs";

const PROJECT_ROOT = process.env.U6_PROJECT_ROOT
  ? path.resolve(process.env.U6_PROJECT_ROOT)
  : fileURLToPath(new URL("..", import.meta.url));
const DEFAULT_OUTPUT = "docs/reports/submission/u6-rehearsal-manifest.template.json";
const TASKS = [
  {
    title: "评论输入框字数倒计数",
    runId: "run-u6-comment-draft-counter",
    skillId: "comment-draft-counter",
    skillFile: "services/skills/src/commentDraftCounter.js",
    implementationChangeList: "docs/reports/submission/u6-change-lists/comment-draft-counter.txt",
    recording: "docs/reports/submission/u6-recordings/comment-draft-counter.mp4",
  },
  {
    title: "作者资料卡显示注册天数",
    runId: "run-u6-profile-account-age",
    skillId: "profile-account-age",
    skillFile: "services/skills/src/profileAccountAge.js",
    implementationChangeList: "docs/reports/submission/u6-change-lists/profile-account-age.txt",
    recording: "docs/reports/submission/u6-recordings/profile-account-age.mp4",
  },
  {
    title: "文章卡片收藏状态筛选开关",
    runId: "run-u6-article-favorite-filter-toggle",
    skillId: "article-favorite-filter-toggle",
    skillFile: "services/skills/src/articleFavoriteFilterToggle.js",
    implementationChangeList: "docs/reports/submission/u6-change-lists/article-favorite-filter-toggle.txt",
    recording: "docs/reports/submission/u6-recordings/article-favorite-filter-toggle.mp4",
  },
];

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const absoluteOutput = await resolveSafeWriteTarget(PROJECT_ROOT, options.output ?? DEFAULT_OUTPUT, "U6 rehearsal manifest template");
  const output = normalize(path.relative(PROJECT_ROOT, absoluteOutput));
  const manifest = buildManifest();

  await writeGeneratedOutput(absoluteOutput, JSON.stringify(manifest, null, 2));
  const finalPath = finalEvidencePath(output);
  const checkCommand = `npm run check:u6 -- --manifest ${shellArg(finalPath)}`;

  const checks = [
    {
      name: "u6-manifest-template",
      status: "passed",
      detail: `${output}; ${manifest.rehearsals.length} rehearsal template(s)`,
    },
  ];
  console.log(JSON.stringify({
    mode: "u6-rehearsal-scaffold",
    status: "scaffolded",
    output,
    finalPath,
    checkCommand,
    nextSteps: {
      copyFrom: output,
      writeTo: finalPath,
      validateWith: checkCommand,
    },
    rehearsalCount: manifest.rehearsals.length,
    checkCounts: countChecks(checks),
    checks,
    note: "Template only. Replace placeholders with real timestamps after timed rehearsals, then run npm run check:u6 -- --manifest <path>.",
  }, null, 2));
}

function finalEvidencePath(templatePath) {
  return templatePath.endsWith(".template.json")
    ? templatePath.replace(/\.template\.json$/u, ".json")
    : "docs/reports/submission/u6-rehearsal-manifest.json";
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (name !== "--output" || isMissingFlagValue(value)) throw new Error(usage());
    options.output = value;
  }
  return options;
}

function isMissingFlagValue(value) {
  return value === undefined || value.startsWith("--");
}

function buildManifest() {
  return {
    minRehearsals: 3,
    minPassed: 2,
    maxMinutes: 15,
    maxSkillLines: 120,
    note: "Generated scaffold only. Do not mark U6 complete until recordings, run evidence, Skill files, registry entries, implementation change lists, and timestamps are real.",
    rehearsals: TASKS.map((task) => ({
      ...task,
      startedAt: "REPLACE_WITH_START_ISO",
      endedAt: "REPLACE_WITH_END_ISO",
    })),
  };
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

function usage() {
  return "Usage: node scripts/scaffold-u6-rehearsal.mjs [--output <path>]";
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
    mode: "u6-rehearsal-scaffold",
    status: "failed",
    output: DEFAULT_OUTPUT,
    checkCounts: countChecks(checks),
    checks,
    usage: usage(),
    note: "Template was not written. Fix the CLI arguments or output path, then rerun scaffold.",
  };
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
