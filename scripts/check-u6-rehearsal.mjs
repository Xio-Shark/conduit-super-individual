#!/usr/bin/env node
import {
  DEFAULT_MAX_MINUTES,
  DEFAULT_MAX_SKILL_LINES,
  checkManifest,
  checkSingleRehearsal,
  positiveNumber,
} from "./u6-rehearsal-checker.mjs";

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const summary = options.manifest
    ? await checkManifest(options.manifest)
    : await checkSingleRehearsal(options);

  console.log(JSON.stringify(summary, null, 2));
  if (summary.status === "failed") process.exit(1);
}

function parseArgs(args) {
  const options = { maxMinutes: DEFAULT_MAX_MINUTES, maxSkillLines: DEFAULT_MAX_SKILL_LINES };
  const filteredArgs = args.filter((arg) => arg !== "--json");
  for (let index = 0; index < filteredArgs.length; index += 2) {
    const name = filteredArgs[index];
    const value = filteredArgs[index + 1];
    if (!name?.startsWith("--") || isMissingFlagValue(value)) throw new Error(usage());
    assignOption(options, name.slice(2), value);
  }
  if (options.manifest) return options;
  return options;
}

function isMissingFlagValue(value) {
  return value === undefined || value.startsWith("--");
}

function assignOption(options, key, value) {
  if (key === "run-id") options.runId = value;
  else if (key === "skill-id") options.skillId = value;
  else if (key === "skill-file") options.skillFile = value;
  else if (key === "implementation-change-list") options.implementationChangeList = value;
  else if (key === "started-at") options.startedAt = value;
  else if (key === "ended-at") options.endedAt = value;
  else if (key === "recording") options.recording = value;
  else if (key === "manifest") options.manifest = value;
  else if (key === "max-minutes") options.maxMinutes = positiveNumber(value, key);
  else if (key === "max-skill-lines") options.maxSkillLines = positiveNumber(value, key);
  else throw new Error(`unknown option --${key}\n${usage()}`);
}

function usage() {
  return "Usage: node scripts/check-u6-rehearsal.mjs --run-id <id> --skill-file <path> --skill-id <id> --implementation-change-list <path> --started-at <iso> --ended-at <iso> --recording <path>\n       node scripts/check-u6-rehearsal.mjs --manifest <path>";
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
    mode: "u6-rehearsal-check",
    status: "failed",
    checkCounts: countChecks(checks),
    checks,
    usage: usage(),
  }, null, 2));
  process.exit(1);
});

function countChecks(checks) {
  return {
    total: checks.length,
    passed: checks.filter((check) => check.status === "passed").length,
    failed: checks.filter((check) => check.status === "failed").length,
  };
}
