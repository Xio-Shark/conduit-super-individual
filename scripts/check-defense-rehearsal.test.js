import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const SCRIPT_PATH = fileURLToPath(new URL("check-defense-rehearsal.mjs", import.meta.url));
const EVIDENCE_PATH = "docs/reports/submission/defense-rehearsal-evidence.json";
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

test("defense rehearsal check passes with complete local evidence", async () => {
  const projectRoot = await makeProjectRoot("defense-rehearsal-pass-");

  try {
    await writeEvidence(projectRoot, completeEvidence());
    const result = await runCheck(projectRoot);

    assert.equal(result.code, 0);
    assert.equal(result.summary.status, "passed");
    assert.equal(result.summary.checks.every((check) => check.status === "passed"), true);
    assert.deepEqual(result.summary.checkCounts, countChecks(result.summary.checks));
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("defense rehearsal check accepts --json as a compatibility no-op", async () => {
  const projectRoot = await makeProjectRoot("defense-rehearsal-json-");

  try {
    await writeEvidence(projectRoot, completeEvidence());
    const result = await runCheck(projectRoot, ["--json"]);

    assert.equal(result.code, 0);
    assert.equal(result.summary.mode, "defense-rehearsal-check");
    assert.equal(result.summary.status, "passed");
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("defense rehearsal check fails when evidence is missing", async () => {
  const projectRoot = await makeProjectRoot("defense-rehearsal-missing-");

  try {
    const result = await runCheck(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.deepEqual(result.summary.checkCounts, countChecks(result.summary.checks));
    assert.match(JSON.stringify(result.summary.checks), /missing docs\/reports\/submission\/defense-rehearsal-evidence\.json/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("defense rehearsal check returns JSON when evidence path escapes project root", async () => {
  const projectRoot = await makeProjectRoot("defense-rehearsal-escape-");

  try {
    const result = await runCheck(projectRoot, ["--json", "--file", "../outside.json"]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "defense-rehearsal-check");
    assert.equal(result.summary.status, "failed");
    assert.match(JSON.stringify(result.summary.checks), /path escapes project root/);
    assert.equal(result.stderr, "");
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("defense rehearsal check rejects option flags used as missing values", async () => {
  const projectRoot = await makeProjectRoot("defense-rehearsal-missing-flag-value-");

  try {
    const result = await runCheck(projectRoot, ["--file", "--write-template"]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "defense-rehearsal-check");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.checks[0].name, "fatal");
    assert.match(result.summary.checks[0].detail, /Usage: node scripts\/check-defense-rehearsal\.mjs/);
    assert.equal(result.stderr, "");
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("defense rehearsal check fails on placeholders and incomplete coverage", async () => {
  const projectRoot = await makeProjectRoot("defense-rehearsal-placeholder-");

  try {
    const evidence = completeEvidence();
    evidence.rehearsal.title = "REPLACE_WITH_REHEARSAL_TITLE";
    evidence.coverage = ["architecture"];
    evidence.questions = evidence.questions.slice(0, 7);
    await writeEvidence(projectRoot, evidence);
    const result = await runCheck(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.match(JSON.stringify(result.summary.checks), /human-pending placeholder/);
    assert.match(JSON.stringify(result.summary.checks), /coverage\.declared/);
    assert.match(JSON.stringify(result.summary.checks), /must contain at least 8 answered questions/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("defense rehearsal check fails when a question lacks evidence refs", async () => {
  const projectRoot = await makeProjectRoot("defense-rehearsal-no-ref-");

  try {
    const evidence = completeEvidence();
    evidence.questions[0].evidenceRefs = [];
    await writeEvidence(projectRoot, evidence);
    const result = await runCheck(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.match(JSON.stringify(result.summary.checks), /must contain at least one local evidence file/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("defense rehearsal check fails when outcome still has open issues", async () => {
  const projectRoot = await makeProjectRoot("defense-rehearsal-open-issue-");

  try {
    const evidence = completeEvidence();
    evidence.outcome.openIssues = ["Need another rehearsal"];
    await writeEvidence(projectRoot, evidence);
    const result = await runCheck(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.match(JSON.stringify(result.summary.checks), /outcome\.openIssues/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("defense rehearsal template scaffold writes placeholder JSON", async () => {
  const projectRoot = await makeProjectRoot("defense-rehearsal-template-");
  const output = "docs/reports/submission/defense-rehearsal-evidence.template.json";

  try {
    const result = await execFileAsync(process.execPath, [SCRIPT_PATH, "--write-template", output], {
      env: { ...process.env, DEFENSE_REHEARSAL_PROJECT_ROOT: projectRoot },
    });
    const summary = JSON.parse(result.stdout);
    const template = JSON.parse(await readFile(path.join(projectRoot, output), "utf8"));

    assert.equal(summary.mode, "defense-rehearsal-template");
    assert.equal(summary.status, "scaffolded");
    assert.equal(summary.finalPath, "docs/reports/submission/defense-rehearsal-evidence.json");
    assert.equal(summary.nextSteps.copyFrom, output);
    assert.equal(summary.nextSteps.writeTo, summary.finalPath);
    assert.match(summary.nextSteps.validateWith, /check:defense-rehearsal -- --file docs\/reports\/submission\/defense-rehearsal-evidence\.json/);
    assert.deepEqual(summary.checkCounts, countChecks(summary.checks));
    assert.equal(summary.checks[0].name, "template");
    assert.equal(template.coverage.includes("u6-live-skill"), true);
    assert.equal(template.questions.length, REQUIRED_TOPICS.length);
    assert.equal(template.rehearsal.recording.includes("REPLACE_WITH_RECORDING"), true);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("defense rehearsal template scaffold quotes custom final evidence paths in next steps", async () => {
  const projectRoot = await makeProjectRoot("defense-rehearsal-template-custom-path-");
  const output = "docs/reports/submission/custom defense.template.json";

  try {
    const result = await execFileAsync(process.execPath, [SCRIPT_PATH, "--write-template", output], {
      env: { ...process.env, DEFENSE_REHEARSAL_PROJECT_ROOT: projectRoot },
    });
    const summary = JSON.parse(result.stdout);

    assert.equal(summary.finalPath, "docs/reports/submission/custom defense.json");
    assert.equal(
      summary.checkCommand,
      "npm run check:defense-rehearsal -- --file 'docs/reports/submission/custom defense.json'",
    );
    assert.equal(summary.nextSteps.validateWith, summary.checkCommand);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("defense rehearsal template scaffold refuses final evidence output", async () => {
  const projectRoot = await makeProjectRoot("defense-rehearsal-template-final-");

  try {
    const result = await runCheck(projectRoot, ["--write-template", EVIDENCE_PATH]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.checks[0].name, "fatal");
    assert.match(result.summary.checks[0].detail, /Refusing to write defense rehearsal template to final evidence file/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("defense rehearsal template scaffold refuses symlinked parent outside project", async () => {
  const projectRoot = await makeProjectRoot("defense-rehearsal-template-symlink-");
  const outsideRoot = await mkdtemp(path.join(tmpdir(), "defense-rehearsal-template-outside-"));

  try {
    await symlink(outsideRoot, path.join(projectRoot, "docs/reports/submission/link"));
    const result = await runCheck(projectRoot, ["--write-template", "docs/reports/submission/link/defense-rehearsal-evidence.template.json"]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.checks[0].name, "fatal");
    assert.match(result.summary.checks[0].detail, /symlinked parent outside project root/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
    await rm(outsideRoot, { force: true, recursive: true });
  }
});

async function makeProjectRoot(prefix) {
  const projectRoot = await mkdtemp(path.join(tmpdir(), prefix));
  await mkdir(path.join(projectRoot, "docs/reports/submission/defense-qna-recordings"), { recursive: true });
  await mkdir(path.join(projectRoot, "docs/reports/submission/defense-qna-notes"), { recursive: true });
  await mkdir(path.join(projectRoot, "docs/reports/runs/run-l2-auto-cover-image"), { recursive: true });
  await mkdir(path.join(projectRoot, "services/skills/src"), { recursive: true });
  return projectRoot;
}

async function writeEvidence(projectRoot, evidence) {
  await writeSupportFiles(projectRoot);
  await mkdir(path.dirname(path.join(projectRoot, EVIDENCE_PATH)), { recursive: true });
  await writeFile(path.join(projectRoot, EVIDENCE_PATH), `${JSON.stringify(evidence, null, 2)}\n`);
}

async function writeSupportFiles(projectRoot) {
  await writeFile(path.join(projectRoot, "docs/reports/submission/defense-qna-recordings/qna.mp4"), "recording bytes\n");
  await writeFile(path.join(projectRoot, "docs/reports/submission/defense-qna-notes/qna.md"), "# Notes\n");
  await writeFile(path.join(projectRoot, "docs/reports/submission/defense-prep.md"), "# Defense Prep\n");
  await writeFile(path.join(projectRoot, "docs/reports/runs/run-l2-auto-cover-image/plan.md"), "# Plan\n");
  await writeFile(path.join(projectRoot, "services/skills/src/commentLikeCount.js"), "export const commentLikeCount = {};\n");
}

function completeEvidence() {
  return {
    rehearsal: {
      title: "Final defense dry run",
      startedAt: "2026-05-24T10:00:00+08:00",
      endedAt: "2026-05-24T10:45:00+08:00",
      participants: [
        { name: "Alice", role: "presenter" },
        { name: "Bob", role: "reviewer" },
      ],
      recording: "docs/reports/submission/defense-qna-recordings/qna.mp4",
      notes: "docs/reports/submission/defense-qna-notes/qna.md",
    },
    coverage: REQUIRED_TOPICS,
    questions: REQUIRED_TOPICS.map((topic, index) => ({
      id: `q${index + 1}`,
      topic,
      question: `Question about ${topic}`,
      answerSummary: `Answered with concrete evidence for ${topic}.`,
      status: "answered",
      evidenceRefs: [
        index % 2 === 0
          ? "docs/reports/runs/run-l2-auto-cover-image/plan.md"
          : "services/skills/src/commentLikeCount.js",
      ],
    })),
    followUps: [
      {
        questionId: "q1",
        prompt: "What fails if schema parsing drifts?",
        answerSummary: "The checker fails fast and the demo uses a scoped v0 parser.",
        status: "answered",
      },
      {
        questionId: "q8",
        prompt: "What remains outside local automation?",
        answerSummary: "Public URLs, uploaded video, and final submission are human actions.",
        status: "answered",
      },
    ],
    outcome: {
      status: "passed",
      openIssues: [],
      defensePrepFinalized: true,
      defensePrepPath: "docs/reports/submission/defense-prep.md",
    },
  };
}

async function runCheck(projectRoot, args = []) {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [SCRIPT_PATH, ...args], {
      env: { ...process.env, DEFENSE_REHEARSAL_PROJECT_ROOT: projectRoot },
    });
    return { code: 0, summary: JSON.parse(stdout), stderr };
  } catch (error) {
    return {
      code: error.code,
      summary: JSON.parse(error.stdout),
      stderr: error.stderr,
    };
  }
}

function countChecks(checks) {
  return {
    total: checks.length,
    passed: checks.filter((check) => check.status === "passed").length,
    failed: checks.filter((check) => check.status === "failed").length,
  };
}
