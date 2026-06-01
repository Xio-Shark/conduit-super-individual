import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const SCRIPT_PATH = fileURLToPath(new URL("check-external-submission.mjs", import.meta.url));
const EVIDENCE_PATH = "docs/reports/submission/external-submission-evidence.json";

test("external submission check passes with complete evidence", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "external-submission-pass-"));
  try {
    const freshClonePath = path.join(projectRoot, "fresh-clone");
    await mkdir(freshClonePath, { recursive: true });
    await writeEvidence(projectRoot, completeEvidence({ freshClonePath }));
    const result = await runCheck(projectRoot);

    assert.equal(result.code, 0);
    assert.equal(result.summary.status, "passed");
    assert.equal(result.summary.checks.every((check) => check.status === "passed"), true);
    assert.deepEqual(result.summary.checkCounts, countChecks(result.summary.checks));
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("external submission check accepts --json as a compatibility no-op", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "external-submission-json-"));
  try {
    const freshClonePath = path.join(projectRoot, "fresh-clone");
    await mkdir(freshClonePath, { recursive: true });
    await writeEvidence(projectRoot, completeEvidence({ freshClonePath }));
    const result = await runCheck(projectRoot, { json: true });

    assert.equal(result.code, 0);
    assert.equal(result.summary.mode, "external-submission-check");
    assert.equal(result.summary.status, "passed");
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("external submission check fails when fresh clone path is not a local directory", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "external-submission-missing-clone-"));
  try {
    const evidence = completeEvidence();
    evidence.publicRepo.freshClonePath = path.join(projectRoot, "missing-fresh-clone");
    await writeEvidence(projectRoot, evidence);
    const result = await runCheck(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.match(JSON.stringify(result.summary.checks), /missing local fresh clone directory/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("external submission check requires evidence fresh clone path to match provided public repo path", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "external-submission-clone-match-"));
  try {
    const evidenceClonePath = path.join(projectRoot, "fresh-clone-from-evidence");
    const providedClonePath = path.join(projectRoot, "fresh-clone-from-arg");
    await mkdir(evidenceClonePath, { recursive: true });
    await mkdir(providedClonePath, { recursive: true });
    await writeEvidence(projectRoot, completeEvidence({ freshClonePath: evidenceClonePath }));
    const result = await runCheck(projectRoot, { publicRepo: providedClonePath });

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.match(JSON.stringify(result.summary.checks), /must match expected fresh clone path/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("external submission check fails when evidence is missing", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "external-submission-missing-"));
  try {
    const result = await runCheck(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.deepEqual(result.summary.checkCounts, countChecks(result.summary.checks));
    assert.match(JSON.stringify(result.summary.checks), /missing docs\/reports\/submission\/external-submission-evidence\.json/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("external submission check returns JSON when evidence path escapes project root", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "external-submission-escape-"));
  try {
    const result = await runCheck(projectRoot, { json: true, file: "../outside.json" });

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "external-submission-check");
    assert.equal(result.summary.status, "failed");
    assert.match(JSON.stringify(result.summary.checks), /path escapes project root/);
    assert.equal(result.stderr, "");
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("external submission check rejects option flags used as missing values", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "external-submission-missing-flag-value-"));
  try {
    const result = await runCheck(projectRoot, { file: "--write-template" });

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "external-submission-check");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.checks[0].name, "fatal");
    assert.match(result.summary.checks[0].detail, /Usage: node scripts\/check-external-submission\.mjs/);
    assert.equal(result.stderr, "");
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("external submission check fails on placeholders and incomplete video coverage", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "external-submission-placeholder-"));
  try {
    const evidence = completeEvidence();
    evidence.team.name = "REPLACE_WITH_TEAM_NAME";
    evidence.video.coverage = ["p2.1"];
    await writeEvidence(projectRoot, evidence);
    const result = await runCheck(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.match(JSON.stringify(result.summary.checks), /human-pending placeholder/);
    assert.match(JSON.stringify(result.summary.checks), /video\.coverage/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("external submission check rejects example URLs", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "external-submission-example-url-"));
  try {
    const evidence = completeEvidence();
    evidence.links.demoUrl = "https://demo.example.com";
    await writeEvidence(projectRoot, evidence);
    const result = await runCheck(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.match(JSON.stringify(result.summary.checks), /placeholder URL|human-pending placeholder/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("external submission template scaffold writes placeholder JSON", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "external-submission-template-"));
  const output = "docs/reports/submission/external-submission-evidence.template.json";
  try {
    const result = await execFileAsync(process.execPath, [SCRIPT_PATH, "--write-template", output], {
      env: { ...process.env, EXTERNAL_SUBMISSION_PROJECT_ROOT: projectRoot },
    });
    const summary = JSON.parse(result.stdout);
    const template = JSON.parse(await readFile(path.join(projectRoot, output), "utf8"));

    assert.equal(summary.mode, "external-submission-template");
    assert.equal(summary.status, "scaffolded");
    assert.equal(summary.finalPath, "docs/reports/submission/external-submission-evidence.json");
    assert.equal(summary.nextSteps.copyFrom, output);
    assert.equal(summary.nextSteps.writeTo, summary.finalPath);
    assert.match(summary.nextSteps.validateWith, /check:external-submission -- --file docs\/reports\/submission\/external-submission-evidence\.json --public-repo <fresh-clone-path>/);
    assert.deepEqual(summary.checkCounts, countChecks(summary.checks));
    assert.equal(summary.checks[0].name, "template");
    assert.equal(template.links.demoUrl, "REPLACE_WITH_DEMO_URL");
    assert.equal(template.video.coverage.includes("p2.2-6"), true);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("external submission template scaffold preserves provided public repo path in next steps", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "external-submission-template-public-repo-"));
  const output = "docs/reports/submission/external-submission-evidence.template.json";
  try {
    const result = await execFileAsync(
      process.execPath,
      [SCRIPT_PATH, "--write-template", output, "--public-repo", "/tmp/fresh clone"],
      {
        env: { ...process.env, EXTERNAL_SUBMISSION_PROJECT_ROOT: projectRoot },
      },
    );
    const summary = JSON.parse(result.stdout);

    assert.equal(
      summary.checkCommand,
      "npm run check:external-submission -- --file docs/reports/submission/external-submission-evidence.json --public-repo '/tmp/fresh clone'",
    );
    assert.equal(summary.nextSteps.validateWith, summary.checkCommand);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("external submission template scaffold quotes custom final evidence paths in next steps", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "external-submission-template-custom-path-"));
  const output = "docs/reports/submission/custom external.template.json";
  try {
    const result = await execFileAsync(
      process.execPath,
      [SCRIPT_PATH, "--write-template", output, "--public-repo", "/tmp/fresh clone"],
      {
        env: { ...process.env, EXTERNAL_SUBMISSION_PROJECT_ROOT: projectRoot },
      },
    );
    const summary = JSON.parse(result.stdout);

    assert.equal(summary.finalPath, "docs/reports/submission/custom external.json");
    assert.equal(
      summary.checkCommand,
      "npm run check:external-submission -- --file 'docs/reports/submission/custom external.json' --public-repo '/tmp/fresh clone'",
    );
    assert.equal(summary.nextSteps.validateWith, summary.checkCommand);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("external submission template scaffold refuses final evidence output", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "external-submission-template-final-"));
  try {
    const result = await runCheck(projectRoot, { writeTemplate: EVIDENCE_PATH });

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.checks[0].name, "fatal");
    assert.match(result.summary.checks[0].detail, /Refusing to write external submission template to final evidence file/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("external submission template scaffold refuses symlinked parent outside project", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "external-submission-template-symlink-"));
  const outsideRoot = await mkdtemp(path.join(tmpdir(), "external-submission-template-outside-"));
  try {
    await mkdir(path.join(projectRoot, "docs/reports/submission"), { recursive: true });
    await symlink(outsideRoot, path.join(projectRoot, "docs/reports/submission/link"));
    const result = await runCheck(projectRoot, {
      writeTemplate: "docs/reports/submission/link/external-submission-evidence.template.json",
    });

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.checks[0].name, "fatal");
    assert.match(result.summary.checks[0].detail, /symlinked parent outside project root/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
    await rm(outsideRoot, { force: true, recursive: true });
  }
});

function completeEvidence(overrides = {}) {
  return {
    team: {
      name: "Conduit Delivery Team",
      members: [{ name: "Alice", role: "Full-stack delivery" }],
    },
    links: {
      demoUrl: "https://demo.conduit-delivery.dev",
      videoUrl: "https://video.conduit-delivery.dev/watch",
      publicRepoUrl: "https://github.com/conduit-delivery/conduit-super-individual",
    },
    video: {
      durationMinutes: 5,
      coverage: ["p2.1", "p2.2-1", "p2.2-2", "p2.2-3", "p2.2-4", "p2.2-5", "p2.2-6", "ai-usage", "public-repo"],
    },
    publicRepo: {
      url: "https://github.com/conduit-delivery/conduit-super-individual",
      freshClonePath: overrides.freshClonePath ?? "/tmp/conduit-super-individual-fresh-clone",
      freshCloneCheckStatus: "passed",
      freshCloneCheckedAt: "2026-05-24T10:00:00+08:00",
    },
    security: {
      remoteSecretScanningStatus: "passed",
      remoteSecretScanningCheckedAt: "2026-05-24T10:05:00+08:00",
      remoteSecretScanningEvidence: "GitHub secret scanning shows no active alerts",
    },
    submission: {
      status: "submitted",
      submittedAt: "2026-06-10T20:00:00+08:00",
      platform: "challenge submission portal",
      confirmation: "submission-confirmation-123",
    },
  };
}

async function writeEvidence(projectRoot, evidence) {
  await mkdir(path.dirname(path.join(projectRoot, EVIDENCE_PATH)), { recursive: true });
  await writeFile(path.join(projectRoot, EVIDENCE_PATH), JSON.stringify(evidence));
}

async function runCheck(projectRoot, options = {}) {
  const args = [SCRIPT_PATH];
  if (options.json) args.push("--json");
  if (options.file) args.push("--file", options.file);
  if (options.publicRepo) args.push("--public-repo", options.publicRepo);
  if (options.writeTemplate) args.push("--write-template", options.writeTemplate);
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, args, {
      env: { ...process.env, EXTERNAL_SUBMISSION_PROJECT_ROOT: projectRoot },
    });
    return { code: 0, summary: JSON.parse(stdout), stderr };
  } catch (error) {
    return { code: error.code, summary: JSON.parse(error.stdout), stderr: error.stderr };
  }
}

function countChecks(checks) {
  return {
    total: checks.length,
    passed: checks.filter((check) => check.status === "passed").length,
    failed: checks.filter((check) => check.status === "failed").length,
  };
}
