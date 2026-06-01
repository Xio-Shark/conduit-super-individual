import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const SCRIPT_PATH = fileURLToPath(new URL("check-video-evidence.mjs", import.meta.url));
const EVIDENCE_PATH = "docs/reports/submission/video-evidence.json";
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

test("video evidence check passes with complete local recording evidence", async () => {
  const projectRoot = await makeProjectRoot("video-evidence-pass-");

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

test("video evidence check accepts --json as a compatibility no-op", async () => {
  const projectRoot = await makeProjectRoot("video-evidence-json-");

  try {
    await writeEvidence(projectRoot, completeEvidence());
    const result = await runCheck(projectRoot, ["--json"]);

    assert.equal(result.code, 0);
    assert.equal(result.summary.mode, "video-evidence-check");
    assert.equal(result.summary.status, "passed");
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("video evidence check fails when evidence is missing", async () => {
  const projectRoot = await makeProjectRoot("video-evidence-missing-");

  try {
    const result = await runCheck(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.deepEqual(result.summary.checkCounts, countChecks(result.summary.checks));
    assert.match(JSON.stringify(result.summary.checks), /missing docs\/reports\/submission\/video-evidence\.json/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("video evidence check returns JSON when evidence path escapes project root", async () => {
  const projectRoot = await makeProjectRoot("video-evidence-escape-");

  try {
    const result = await runCheck(projectRoot, ["--json", "--file", "../outside.json"]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "video-evidence-check");
    assert.equal(result.summary.status, "failed");
    assert.match(JSON.stringify(result.summary.checks), /path escapes project root/);
    assert.equal(result.stderr, "");
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("video evidence check rejects option flags used as missing values", async () => {
  const projectRoot = await makeProjectRoot("video-evidence-missing-flag-value-");

  try {
    const result = await runCheck(projectRoot, ["--file", "--write-template"]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "video-evidence-check");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.checks[0].name, "fatal");
    assert.match(result.summary.checks[0].detail, /Usage: node scripts\/check-video-evidence\.mjs/);
    assert.equal(result.stderr, "");
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("video evidence check fails on placeholders and incomplete coverage", async () => {
  const projectRoot = await makeProjectRoot("video-evidence-placeholder-");

  try {
    const evidence = completeEvidence();
    evidence.video.title = "REPLACE_WITH_VIDEO_TITLE";
    evidence.coverage = ["p2.1"];
    evidence.segments = evidence.segments.slice(0, 3);
    await writeEvidence(projectRoot, evidence);
    const result = await runCheck(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.match(JSON.stringify(result.summary.checks), /human-pending placeholder/);
    assert.match(JSON.stringify(result.summary.checks), /coverage\.declared/);
    assert.match(JSON.stringify(result.summary.checks), /coverage\.timeline/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("video evidence check fails when duration is out of range or timeline exceeds video", async () => {
  const projectRoot = await makeProjectRoot("video-evidence-duration-");

  try {
    const evidence = completeEvidence();
    evidence.video.durationMinutes = 2.5;
    evidence.segments.at(-1).endSeconds = 500;
    await writeEvidence(projectRoot, evidence);
    const result = await runCheck(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.match(JSON.stringify(result.summary.checks), /video\.durationMinutes/);
    assert.match(JSON.stringify(result.summary.checks), /outside 150 second video duration/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("video evidence check fails when a segment lacks local evidence refs", async () => {
  const projectRoot = await makeProjectRoot("video-evidence-no-ref-");

  try {
    const evidence = completeEvidence();
    evidence.segments[0].evidenceRefs = [];
    await writeEvidence(projectRoot, evidence);
    const result = await runCheck(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.match(JSON.stringify(result.summary.checks), /must contain at least one local evidence file/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("video evidence check rejects public upload claims", async () => {
  const projectRoot = await makeProjectRoot("video-evidence-upload-claim-");

  try {
    const evidence = completeEvidence();
    evidence.video.url = "https://video.conduit-delivery.dev/watch";
    await writeEvidence(projectRoot, evidence);
    const result = await runCheck(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.match(JSON.stringify(result.summary.checks), /external-upload-claims/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("video evidence template scaffold writes placeholder JSON", async () => {
  const projectRoot = await makeProjectRoot("video-evidence-template-");
  const output = "docs/reports/submission/video-evidence.template.json";

  try {
    const result = await execFileAsync(process.execPath, [SCRIPT_PATH, "--write-template", output], {
      env: { ...process.env, VIDEO_EVIDENCE_PROJECT_ROOT: projectRoot },
    });
    const summary = JSON.parse(result.stdout);
    const template = JSON.parse(await readFile(path.join(projectRoot, output), "utf8"));

    assert.equal(summary.mode, "video-evidence-template");
    assert.equal(summary.status, "scaffolded");
    assert.equal(summary.finalPath, "docs/reports/submission/video-evidence.json");
    assert.equal(summary.nextSteps.copyFrom, output);
    assert.equal(summary.nextSteps.writeTo, summary.finalPath);
    assert.match(summary.nextSteps.validateWith, /check:video-evidence -- --file docs\/reports\/submission\/video-evidence\.json/);
    assert.deepEqual(summary.checkCounts, countChecks(summary.checks));
    assert.equal(summary.checks[0].name, "template");
    assert.equal(template.coverage.includes("u3-plan-llm"), true);
    assert.equal(template.segments.length, REQUIRED_COVERAGE.length);
    assert.equal(template.video.recording.includes("REPLACE_WITH_RECORDING"), true);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("video evidence template scaffold quotes custom final evidence paths in next steps", async () => {
  const projectRoot = await makeProjectRoot("video-evidence-template-custom-path-");
  const output = "docs/reports/submission/custom video.template.json";

  try {
    const result = await execFileAsync(process.execPath, [SCRIPT_PATH, "--write-template", output], {
      env: { ...process.env, VIDEO_EVIDENCE_PROJECT_ROOT: projectRoot },
    });
    const summary = JSON.parse(result.stdout);

    assert.equal(summary.finalPath, "docs/reports/submission/custom video.json");
    assert.equal(
      summary.checkCommand,
      "npm run check:video-evidence -- --file 'docs/reports/submission/custom video.json'",
    );
    assert.equal(summary.nextSteps.validateWith, summary.checkCommand);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("video evidence template scaffold refuses final evidence output", async () => {
  const projectRoot = await makeProjectRoot("video-evidence-template-final-");

  try {
    const result = await runCheck(projectRoot, ["--write-template", EVIDENCE_PATH]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.checks[0].name, "fatal");
    assert.match(result.summary.checks[0].detail, /Refusing to write video evidence template to final evidence file/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("video evidence template scaffold refuses symlinked parent outside project", async () => {
  const projectRoot = await makeProjectRoot("video-evidence-template-symlink-");
  const outsideRoot = await mkdtemp(path.join(tmpdir(), "video-evidence-template-outside-"));

  try {
    await symlink(outsideRoot, path.join(projectRoot, "docs/reports/submission/link"));
    const result = await runCheck(projectRoot, ["--write-template", "docs/reports/submission/link/video-evidence.template.json"]);

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
  await mkdir(path.join(projectRoot, "docs/reports/submission/video-recordings"), { recursive: true });
  await mkdir(path.join(projectRoot, "docs/reports/submission/video-notes"), { recursive: true });
  await mkdir(path.join(projectRoot, "docs/reports/runs/run-l3-multi-turn-clarify"), { recursive: true });
  await mkdir(path.join(projectRoot, "docs/reports/runs/run-plan-llm-driven"), { recursive: true });
  await mkdir(path.join(projectRoot, "docs/reports/runs/run-l2-auto-cover-image"), { recursive: true });
  await mkdir(path.join(projectRoot, "docs/reports/runs/run-semantic-recall-demo"), { recursive: true });
  await mkdir(path.join(projectRoot, "docs/reports/runs/run-l2-comment-like"), { recursive: true });
  await mkdir(path.join(projectRoot, "docs/reports/runs/run-2026-05-21T02-16-15-215Z"), { recursive: true });
  await mkdir(path.join(projectRoot, "services/skills/src"), { recursive: true });
  return projectRoot;
}

async function writeEvidence(projectRoot, evidence) {
  await writeSupportFiles(projectRoot);
  await mkdir(path.dirname(path.join(projectRoot, EVIDENCE_PATH)), { recursive: true });
  await writeFile(path.join(projectRoot, EVIDENCE_PATH), `${JSON.stringify(evidence, null, 2)}\n`);
}

async function writeSupportFiles(projectRoot) {
  await writeFile(path.join(projectRoot, "docs/reports/submission/video-recordings/s7.mp4"), "recording bytes\n");
  await writeFile(path.join(projectRoot, "docs/reports/submission/video-notes/s7.md"), "# Video Notes\n");
  await writeFile(path.join(projectRoot, "docs/reports/submission/video-recording-guide.md"), "# Video Guide\n");
  await writeFile(path.join(projectRoot, "docs/reports/runs/run-l3-multi-turn-clarify/ai-calls.jsonl"), "{}\n{}\n");
  await writeFile(path.join(projectRoot, "docs/reports/runs/run-plan-llm-driven/ai-calls.jsonl"), "{}\n{}\n");
  await writeFile(path.join(projectRoot, "docs/reports/runs/run-l2-auto-cover-image/diff.patch"), "diff --git\n");
  await writeFile(path.join(projectRoot, "docs/reports/runs/run-semantic-recall-demo/history-recall.json"), "[]\n");
  await writeFile(path.join(projectRoot, "docs/reports/runs/run-l2-comment-like/diff.patch"), "diff --git\n");
  await writeFile(path.join(projectRoot, "docs/reports/runs/run-2026-05-21T02-16-15-215Z/pr-draft.md"), "# PR\n");
  await writeFile(path.join(projectRoot, "services/skills/src/registry.js"), "export const registry = [];\n");
}

function completeEvidence() {
  const segments = [
    segment("s1", "Opening and MVP proof", 0, 30, ["p2.1"], ["docs/reports/runs/run-2026-05-21T02-16-15-215Z/pr-draft.md"]),
    segment("s2", "Multi-turn clarify", 30, 90, ["p2.2-6", "u2-multi-turn-clarify"], ["docs/reports/runs/run-l3-multi-turn-clarify/ai-calls.jsonl"]),
    segment("s3", "Plan LLM and AI usage", 90, 140, ["p2.2-4", "u3-plan-llm", "ai-usage"], ["docs/reports/runs/run-plan-llm-driven/ai-calls.jsonl"]),
    segment("s4", "Schema-driven cross stack", 140, 190, ["p2.2-3", "u1-schema-driven"], ["docs/reports/runs/run-l2-auto-cover-image/diff.patch"]),
    segment("s5", "Semantic recall", 190, 230, ["p2.2-5", "u4-semantic-recall"], ["docs/reports/runs/run-semantic-recall-demo/history-recall.json"]),
    segment("s6", "Resume and abstraction", 230, 280, ["p2.2-1", "p2.2-2"], ["services/skills/src/registry.js"]),
    segment("s7", "Non-list skill and public repo boundary", 280, 340, ["u5-non-list-skill", "public-repo"], ["docs/reports/runs/run-l2-comment-like/diff.patch"]),
  ];
  return {
    video: {
      title: "S7 final demo recording",
      recordedAt: "2026-05-24T12:00:00+08:00",
      durationMinutes: 6,
      recording: "docs/reports/submission/video-recordings/s7.mp4",
      notes: "docs/reports/submission/video-notes/s7.md",
    },
    coverage: REQUIRED_COVERAGE,
    segments,
    outcome: {
      status: "recorded",
      openIssues: [],
      scriptReviewed: true,
      guidePath: "docs/reports/submission/video-recording-guide.md",
    },
  };
}

function segment(id, title, startSeconds, endSeconds, coverage, evidenceRefs) {
  return { id, title, startSeconds, endSeconds, coverage, evidenceRefs };
}

async function runCheck(projectRoot, args = []) {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [SCRIPT_PATH, ...args], {
      env: { ...process.env, VIDEO_EVIDENCE_PROJECT_ROOT: projectRoot },
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
