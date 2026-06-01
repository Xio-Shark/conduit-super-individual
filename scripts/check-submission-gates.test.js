import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const SCRIPT_PATH = fileURLToPath(new URL("check-submission-gates.mjs", import.meta.url));
const JSON_GATE_HELPER_PATH = fileURLToPath(new URL("json-gate-summary.mjs", import.meta.url));
const LARGE_STDOUT_CHECK_COUNT = 180;
const LARGE_STDOUT_EVIDENCE_LENGTH = 320;

test("submission gates pass when every delegated gate passes", async () => {
  const projectRoot = await makeProjectRoot("submission-gates-pass-");
  const publicRepo = path.join(projectRoot, "fresh-clone");
  try {
    await writeFixture(projectRoot);
    await mkdir(publicRepo);
    const result = await runCheck(projectRoot, ["--public-repo", publicRepo]);

    assert.equal(result.code, 0);
    assert.equal(result.summary.status, "passed");
    assert.equal(result.summary.blockerCount, 0);
    assert.deepEqual(result.summary.gateCounts, countGates(result.summary.gates));
    assert.deepEqual(result.summary.delegatedCheckCounts, countDelegatedChecks(result.summary.gates));
    assert.deepEqual(result.summary.openPlanItems, []);
    assert.deepEqual(result.summary.nextSteps, []);
    assert.deepEqual(result.summary.categoryCounts, {});
    assert.deepEqual(result.summary.gates.map((gate) => gate.id), [
      "archive",
      "u6",
      "video",
      "external",
      "defense",
      "public-repo",
      "pre-submission",
    ]);
    assert.match(result.summary.gates.find((gate) => gate.id === "external").command, /--public-repo/);
    assert.match(result.summary.gates.find((gate) => gate.id === "external").command, /fresh-clone/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission gates normalize default script projectRoot", async () => {
  const projectRoot = await makeProjectRoot("submission-gates-normalized-project-root-");
  const publicRepo = path.join(projectRoot, "fresh-clone");
  try {
    await writeFixture(projectRoot);
    await mkdir(publicRepo);
    const result = await runCheck(projectRoot, ["--public-repo", publicRepo], { useProjectRootEnv: false });

    assert.equal(result.code, 0);
    assert.equal(result.summary.projectRoot, realpathSync(projectRoot));
    assert.notEqual(result.summary.projectRoot.endsWith(path.sep), true);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission gates render shell-safe command strings for paths with spaces", async () => {
  const projectRoot = await makeProjectRoot("submission-gates-shell-safe-command-");
  const publicRepo = path.join(projectRoot, "fresh clone");
  try {
    await writeFixture(projectRoot);
    await mkdir(publicRepo);
    const result = await runCheck(projectRoot, ["--public-repo", publicRepo]);

    assert.equal(result.code, 0);
    const externalGate = result.summary.gates.find((gate) => gate.id === "external");
    const publicRepoGate = result.summary.gates.find((gate) => gate.id === "public-repo");
    const preSubmissionGate = result.summary.gates.find((gate) => gate.id === "pre-submission");

    assert.match(externalGate.command, /--public-repo '/u);
    assert.match(externalGate.command, /fresh clone'/u);
    assert.match(publicRepoGate.command, /--repo '/u);
    assert.match(publicRepoGate.command, /fresh clone'/u);
    assert.match(preSubmissionGate.command, /^PUBLIC_REPO_CLONE_PATH='/u);
    assert.match(preSubmissionGate.command, /fresh clone' bash scripts\/pre-submission-check\.sh$/u);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission gates keep rendered command strings single-line for control characters", async () => {
  const projectRoot = await makeProjectRoot("submission-gates-shell-control-char-");
  const publicRepo = path.join(projectRoot, "fresh clone\necho injected");
  try {
    await writeFixture(projectRoot);
    await mkdir(publicRepo);
    const result = await runCheck(projectRoot, ["--public-repo", publicRepo]);

    assert.equal(result.code, 0);
    for (const gateId of ["external", "public-repo", "pre-submission"]) {
      const command = result.summary.gates.find((gate) => gate.id === gateId).command;
      assert.equal(command.includes("\n"), false);
      assert.match(command, /fresh clone\\necho injected/u);
    }
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission gates fail clearly when public repo path is missing", async () => {
  const projectRoot = await makeProjectRoot("submission-gates-missing-public-");
  try {
    await writeFixture(projectRoot);
    const result = await runCheck(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.deepEqual(result.summary.gateCounts, countGates(result.summary.gates));
    assert.deepEqual(result.summary.delegatedCheckCounts, countDelegatedChecks(result.summary.gates));
    assert.deepEqual(result.summary.categoryCounts, {
      "public-repo": { total: 1, failed: 1 },
      "pre-submission": { total: 1, failed: 1 },
    });
    const publicRepoBlocker = result.summary.blockers.find((blocker) => blocker.id === "public-repo");
    assert.ok(publicRepoBlocker);
    assert.equal(Object.hasOwn(publicRepoBlocker, "details"), false);
    assert.deepEqual(publicRepoBlocker.nextStep, {
      provide: "--public-repo <fresh-clone-path> or PUBLIC_REPO_CLONE_PATH",
      validateWith: "npm run check:public-repo -- --repo <fresh-clone-path>",
    });
    assert.deepEqual(result.summary.nextSteps.find((step) => step.id === "public-repo"), {
      id: "public-repo",
      label: "S8 public repository fresh clone",
      provide: "--public-repo <fresh-clone-path> or PUBLIC_REPO_CLONE_PATH",
      validateWith: "npm run check:public-repo -- --repo <fresh-clone-path>",
    });
    assert.equal(result.summary.blockers.some((blocker) => blocker.id === "pre-submission"), true);
    const preSubmissionGate = result.summary.gates.find((gate) => gate.id === "pre-submission");
    const preSubmissionBlocker = result.summary.blockers.find((blocker) => blocker.id === "pre-submission");
    assert.equal(preSubmissionGate.command.includes("pre-submission-check.sh"), true);
    assert.equal(preSubmissionGate.summary.mode, "pre-submission-check");
    assert.deepEqual(preSubmissionBlocker.details, [
      {
        name: "pre-submission",
        detail: "PUBLIC_REPO_CLONE_PATH is required",
      },
    ]);
    assert.deepEqual(preSubmissionBlocker.nextStep, {
      provide: "PUBLIC_REPO_CLONE_PATH=<fresh-clone-path>",
      validateWith: "PUBLIC_REPO_CLONE_PATH=<fresh-clone-path> bash scripts/pre-submission-check.sh",
    });
    assert.deepEqual(result.summary.nextSteps.find((step) => step.id === "pre-submission"), {
      id: "pre-submission",
      label: "S9 release-day pre-submission gate",
      provide: "PUBLIC_REPO_CLONE_PATH=<fresh-clone-path>",
      validateWith: "PUBLIC_REPO_CLONE_PATH=<fresh-clone-path> bash scripts/pre-submission-check.sh",
    });
    assert.deepEqual(result.summary.openPlanItems, ["S8", "S9", "S10", "B34", "B35", "B37"]);
    assert.match(JSON.stringify(result.summary.blockers), /PUBLIC_REPO_CLONE_PATH/);
    assert.match(JSON.stringify(result.summary.blockers), /Fresh clone path/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission gates accepts --json as a compatibility no-op", async () => {
  const projectRoot = await makeProjectRoot("submission-gates-json-");
  try {
    await writeFixture(projectRoot);
    const result = await runCheck(projectRoot, ["--json"]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "submission-gates-check");
    assert.equal(result.summary.status, "failed");
    assert.match(JSON.stringify(result.summary.blockers), /PUBLIC_REPO_CLONE_PATH/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission gates returns JSON when CLI arguments are invalid", async () => {
  const projectRoot = await makeProjectRoot("submission-gates-invalid-args-");
  try {
    const result = await runCheck(projectRoot, ["--bogus"]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "submission-gates-check");
    assert.equal(result.summary.status, "failed");
    assert.deepEqual(result.summary.gateCounts, countGates(result.summary.gates));
    assert.deepEqual(result.summary.delegatedCheckCounts, countDelegatedChecks(result.summary.gates));
    assert.deepEqual(result.summary.checkCounts, countChecks(result.summary.checks));
    assert.equal(result.summary.checks[0].name, "fatal");
    assert.match(result.summary.checks[0].detail, /Usage: node scripts\/check-submission-gates\.mjs/);
    assert.equal(result.summary.blockers[0].id, "fatal");
    assert.deepEqual(result.summary.nextSteps, [
      {
        id: "fatal",
        label: "submission gates invocation",
        validateWith: "Usage: node scripts/check-submission-gates.mjs [--u6-manifest <path>] [--public-repo <fresh-clone-path>]",
      },
    ]);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission gates rejects option flags used as missing values", async () => {
  const projectRoot = await makeProjectRoot("submission-gates-missing-flag-value-");
  try {
    const result = await runCheck(projectRoot, [
      "--public-repo",
      "--u6-manifest",
      "docs/reports/submission/custom-u6.json",
    ]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "submission-gates-check");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.blockers[0].id, "fatal");
    assert.match(result.summary.blockers[0].detail, /Usage: node scripts\/check-submission-gates\.mjs/);
    assert.deepEqual(result.summary.gateCounts, countGates(result.summary.gates));
    assert.deepEqual(result.summary.delegatedCheckCounts, countDelegatedChecks(result.summary.gates));
    assert.deepEqual(result.summary.checkCounts, countChecks(result.summary.checks));
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission gates surface delegated gate failures", async () => {
  const projectRoot = await makeProjectRoot("submission-gates-delegated-fail-");
  const publicRepo = path.join(projectRoot, "fresh-clone");
  try {
    await writeFixture(projectRoot, { failGate: "video" });
    await mkdir(publicRepo);
    const result = await runCheck(projectRoot, ["--public-repo", publicRepo]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.deepEqual(result.summary.delegatedCheckCounts, countDelegatedChecks(result.summary.gates));
    const videoGate = result.summary.gates.find((gate) => gate.id === "video");
    assert.equal(videoGate.status, "failed");
    assert.equal(videoGate.summary.mode, "video-evidence-check");
    assert.deepEqual(videoGate.planItems, ["S7", "B33"]);
    assert.match(JSON.stringify(result.summary.blockers), /local S7 video evidence/);
    assert.match(JSON.stringify(result.summary.blockers), /video-evidence\.json/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission gates map external evidence failures to R2 team-info risk", async () => {
  const projectRoot = await makeProjectRoot("submission-gates-external-r2-");
  const publicRepo = path.join(projectRoot, "fresh-clone");
  try {
    await writeFixture(projectRoot, { failGate: "external" });
    await mkdir(publicRepo);
    const result = await runCheck(projectRoot, ["--public-repo", publicRepo]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.deepEqual(result.summary.delegatedCheckCounts, countDelegatedChecks(result.summary.gates));
    const externalGate = result.summary.gates.find((gate) => gate.id === "external");
    assert.equal(externalGate.status, "failed");
    assert.deepEqual(externalGate.planItems, ["R2", "S6", "S8", "S9", "S10", "B29", "B34", "B35", "B37"]);
    assert.deepEqual(result.summary.openPlanItems, ["R2", "S6", "S8", "S9", "S10", "B29", "B34", "B35", "B37"]);
    const externalBlocker = result.summary.blockers.find((blocker) => blocker.id === "external");
    assert.deepEqual(externalBlocker.nextStep, {
      copyFrom: "docs/reports/submission/external-submission-evidence.template.json",
      writeTo: "docs/reports/submission/external-submission-evidence.json",
      validateWith: `npm run check:external-submission -- --file docs/reports/submission/external-submission-evidence.json --public-repo ${publicRepo}`,
    });
    assert.deepEqual(result.summary.nextSteps.find((step) => step.id === "external"), {
      id: "external",
      label: "S6/S8/S9/S10 external submission evidence",
      copyFrom: "docs/reports/submission/external-submission-evidence.template.json",
      writeTo: "docs/reports/submission/external-submission-evidence.json",
      validateWith: `npm run check:external-submission -- --file docs/reports/submission/external-submission-evidence.json --public-repo ${publicRepo}`,
    });
    assert.match(JSON.stringify(result.summary.blockers), /team, Demo, video, repo/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission gates keep provided public repo path in failed blockers and next steps", async () => {
  const projectRoot = await makeProjectRoot("submission-gates-public-repo-next-step-");
  const publicRepo = path.join(projectRoot, "fresh clone with spaces");
  try {
    await writeFixture(projectRoot, { failGate: "public-repo" });
    await mkdir(publicRepo);
    const result = await runCheck(projectRoot, ["--public-repo", publicRepo]);
    const quotedRepo = `'${publicRepo}'`;

    assert.equal(result.code, 1);
    const publicRepoBlocker = result.summary.blockers.find((blocker) => blocker.id === "public-repo");
    assert.equal(publicRepoBlocker.nextStep.provide, undefined);
    assert.equal(publicRepoBlocker.nextStep.validateWith, `npm run check:public-repo -- --repo ${quotedRepo}`);
    assert.equal(result.summary.nextSteps.find((step) => step.id === "public-repo").validateWith, `npm run check:public-repo -- --repo ${quotedRepo}`);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission gates keep provided public repo path in pre-submission next steps", async () => {
  const projectRoot = await makeProjectRoot("submission-gates-pre-submission-repo-next-step-");
  const publicRepo = path.join(projectRoot, "fresh clone with spaces");
  try {
    await writeFixture(projectRoot, { failGate: "pre-submission" });
    await mkdir(publicRepo);
    const result = await runCheck(projectRoot, ["--public-repo", publicRepo]);
    const quotedRepo = `'${publicRepo}'`;

    assert.equal(result.code, 1);
    const preSubmissionBlocker = result.summary.blockers.find((blocker) => blocker.id === "pre-submission");
    assert.equal(preSubmissionBlocker.nextStep.provide, undefined);
    assert.equal(preSubmissionBlocker.nextStep.validateWith, `PUBLIC_REPO_CLONE_PATH=${quotedRepo} bash scripts/pre-submission-check.sh`);
    assert.equal(result.summary.nextSteps.find((step) => step.id === "pre-submission").validateWith, `PUBLIC_REPO_CLONE_PATH=${quotedRepo} bash scripts/pre-submission-check.sh`);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission gates pass custom U6 manifest path to the U6 checker", async () => {
  const projectRoot = await makeProjectRoot("submission-gates-custom-u6-");
  const publicRepo = path.join(projectRoot, "fresh-clone");
  try {
    await writeFixture(projectRoot);
    await mkdir(publicRepo);
    const result = await runCheck(projectRoot, [
      "--public-repo",
      publicRepo,
      "--u6-manifest",
      "docs/reports/submission/custom-u6.json",
    ]);

    assert.equal(result.code, 0);
    const u6Gate = result.summary.gates.find((gate) => gate.id === "u6");
    assert.match(u6Gate.command, /custom-u6\.json/);
    assert.equal(u6Gate.nextStep.writeTo, "docs/reports/submission/custom-u6.json");
    assert.equal(u6Gate.nextStep.validateWith, "npm run check:u6 -- --manifest docs/reports/submission/custom-u6.json");
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission gates keep custom U6 manifest path in failed blockers and next steps", async () => {
  const projectRoot = await makeProjectRoot("submission-gates-custom-u6-failed-");
  const publicRepo = path.join(projectRoot, "fresh-clone");
  try {
    await writeFixture(projectRoot, { failGate: "u6" });
    await mkdir(publicRepo);
    const result = await runCheck(projectRoot, [
      "--public-repo",
      publicRepo,
      "--u6-manifest",
      "docs/reports/submission/custom-u6.json",
    ]);

    assert.equal(result.code, 1);
    const u6Blocker = result.summary.blockers.find((blocker) => blocker.id === "u6");
    assert.equal(u6Blocker.nextStep.writeTo, "docs/reports/submission/custom-u6.json");
    assert.equal(u6Blocker.nextStep.validateWith, "npm run check:u6 -- --manifest docs/reports/submission/custom-u6.json");
    assert.equal(result.summary.nextSteps.find((step) => step.id === "u6").writeTo, "docs/reports/submission/custom-u6.json");
    assert.equal(result.summary.nextSteps.find((step) => step.id === "u6").validateWith, "npm run check:u6 -- --manifest docs/reports/submission/custom-u6.json");
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission gates parses JSON summary from noisy pre-submission output", async () => {
  const projectRoot = await makeProjectRoot("submission-gates-noisy-pre-submission-");
  const publicRepo = path.join(projectRoot, "fresh-clone");
  try {
    await writeFixture(projectRoot, { failGate: "pre-submission", noisyPreSubmission: true });
    await mkdir(publicRepo);
    const result = await runCheck(projectRoot, ["--public-repo", publicRepo]);

    assert.equal(result.code, 1);
    const gate = result.summary.gates.find((item) => item.id === "pre-submission");
    assert.equal(gate.status, "failed");
    assert.equal(gate.summary.mode, "pre-submission-check");
    assert.equal(gate.summary.status, "failed");
    const blocker = result.summary.blockers.find((item) => item.id === "pre-submission");
    assert.deepEqual(result.summary.categoryCounts, {
      "git-tracking": { total: 1, failed: 1 },
      "submission-materials": { total: 1, failed: 1 },
      "public-repo": { total: 1, failed: 1 },
    });
    assert.deepEqual(blocker.categories, {
      "git-tracking": { total: 1, failed: 1 },
      "submission-materials": { total: 1, failed: 1 },
      "public-repo": { total: 1, failed: 1 },
    });
    assert.deepEqual(blocker.categoryNextSteps, {
      "git-tracking": {
        validateWith: "git status --short",
      },
      "submission-materials": {
        validateWith: "PUBLIC_REPO_CLONE_PATH=<fresh-clone-path> bash scripts/pre-submission-check.sh",
      },
      "public-repo": {
        provide: "--public-repo <fresh-clone-path> or PUBLIC_REPO_CLONE_PATH",
        validateWith: "npm run check:public-repo -- --repo <fresh-clone-path>",
      },
    });
    assert.deepEqual(blocker.details, [
      {
        name: "git-tracking",
        detail: "critical release paths are not ready for a tracked public repository",
        evidence: ["?? scripts/untracked-release-helper.mjs"],
      },
      {
        name: "submission-materials",
        detail: "final external submission checklist is not complete",
        evidence: ["docs/reports/submission/checklist.md:1:- [ ] 6.10 前对外提交"],
      },
      {
        name: "public-repo",
        detail: "public repository fresh clone path is missing",
      },
    ]);
    assert.match(JSON.stringify(result.summary.blockers), /tracked public repository/);
    assert.match(blocker.detail, /final external submission checklist is not complete/);
    assert.match(blocker.detail, /public repository fresh clone path is missing/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission gates maps verify pre-submission failures to verify next step", async () => {
  const projectRoot = await makeProjectRoot("submission-gates-pre-submission-verify-");
  const publicRepo = path.join(projectRoot, "fresh-clone");
  try {
    await writeFixture(projectRoot, { failGate: "pre-submission-verify" });
    await mkdir(publicRepo);
    const result = await runCheck(projectRoot, ["--public-repo", publicRepo]);

    assert.equal(result.code, 1);
    const blocker = result.summary.blockers.find((item) => item.id === "pre-submission");
    assert.deepEqual(result.summary.categoryCounts, {
      verify: { total: 1, failed: 1 },
    });
    assert.deepEqual(blocker.categories, {
      verify: { total: 1, failed: 1 },
    });
    assert.deepEqual(blocker.categoryNextSteps, {
      verify: {
        validateWith: "npm run verify",
      },
    });
    assert.deepEqual(blocker.details, [
      {
        name: "verify",
        detail: "npm run verify failed",
      },
    ]);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission gates fail when a delegated gate exits 0 without JSON summary", async () => {
  const projectRoot = await makeProjectRoot("submission-gates-missing-json-");
  const publicRepo = path.join(projectRoot, "fresh-clone");
  try {
    await writeFixture(projectRoot, { plainTextGate: "video" });
    await mkdir(publicRepo);
    const result = await runCheck(projectRoot, ["--public-repo", publicRepo]);

    assert.equal(result.code, 1);
    const videoGate = result.summary.gates.find((gate) => gate.id === "video");
    assert.equal(videoGate.status, "failed");
    assert.equal(videoGate.detail, "command did not emit a parseable JSON summary");
    assert.match(videoGate.stdoutTail, /video fixture passed without JSON/);
    assert.match(JSON.stringify(result.summary.blockers), /parseable JSON summary/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission gates fail when a delegated gate reports an invalid status", async () => {
  const projectRoot = await makeProjectRoot("submission-gates-invalid-status-");
  const publicRepo = path.join(projectRoot, "fresh-clone");
  try {
    await writeFixture(projectRoot, { invalidStatusGate: "external" });
    await mkdir(publicRepo);
    const result = await runCheck(projectRoot, ["--public-repo", publicRepo]);

    assert.equal(result.code, 1);
    const externalGate = result.summary.gates.find((gate) => gate.id === "external");
    assert.equal(externalGate.status, "failed");
    assert.equal(externalGate.detail, "command JSON summary has invalid status: maybe");
    const externalBlocker = result.summary.blockers.find((blocker) => blocker.id === "external");
    assert.equal(Object.hasOwn(externalBlocker, "details"), false);
    assert.deepEqual(externalBlocker.categories, {
      external: { total: 1, failed: 1 },
    });
    assert.match(JSON.stringify(result.summary.blockers), /invalid status/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission gates do not trust delegated details when top-level status is invalid", async () => {
  const projectRoot = await makeProjectRoot("submission-gates-invalid-status-with-details-");
  const publicRepo = path.join(projectRoot, "fresh-clone");
  try {
    await writeFixture(projectRoot, { invalidStatusWithDetailsGate: "video" });
    await mkdir(publicRepo);
    const result = await runCheck(projectRoot, ["--public-repo", publicRepo]);

    assert.equal(result.code, 1);
    const videoGate = result.summary.gates.find((gate) => gate.id === "video");
    const videoBlocker = result.summary.blockers.find((blocker) => blocker.id === "video");
    assert.equal(videoGate.status, "failed");
    assert.equal(videoGate.detail, "command JSON summary has invalid status: maybe");
    assert.equal(Object.hasOwn(videoBlocker, "details"), false);
    assert.deepEqual(videoBlocker.categories, {
      video: { total: 1, failed: 1 },
    });
    assert.doesNotMatch(JSON.stringify(videoBlocker), /do not trust this detail|public-repo/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission gates do not trust delegated details when mode is invalid", async () => {
  const projectRoot = await makeProjectRoot("submission-gates-invalid-mode-with-details-");
  const publicRepo = path.join(projectRoot, "fresh-clone");
  try {
    await writeFixture(projectRoot, { invalidModeWithDetailsGate: "video" });
    await mkdir(publicRepo);
    const result = await runCheck(projectRoot, ["--public-repo", publicRepo]);

    assert.equal(result.code, 1);
    const videoGate = result.summary.gates.find((gate) => gate.id === "video");
    const videoBlocker = result.summary.blockers.find((blocker) => blocker.id === "video");
    assert.equal(videoGate.status, "failed");
    assert.equal(videoGate.detail, "command JSON summary has invalid mode: ");
    assert.equal(Object.hasOwn(videoBlocker, "details"), false);
    assert.deepEqual(videoBlocker.categories, {
      video: { total: 1, failed: 1 },
    });
    assert.doesNotMatch(JSON.stringify(videoBlocker), /do not trust this detail|public-repo/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission gates fail when a delegated gate reports passed with failed checks", async () => {
  const projectRoot = await makeProjectRoot("submission-gates-contradictory-checks-");
  const publicRepo = path.join(projectRoot, "fresh-clone");
  try {
    await writeFixture(projectRoot, { contradictoryChecksGate: "video" });
    await mkdir(publicRepo);
    const result = await runCheck(projectRoot, ["--public-repo", publicRepo]);

    assert.equal(result.code, 1);
    const videoGate = result.summary.gates.find((gate) => gate.id === "video");
    assert.equal(videoGate.status, "failed");
    assert.equal(videoGate.detail, "command JSON summary reports passed but has 1 failed check(s)");
    assert.match(JSON.stringify(result.summary.blockers), /failed check/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission gates fail when a delegated gate reports failed without failed checks", async () => {
  const projectRoot = await makeProjectRoot("submission-gates-empty-failed-checks-");
  const publicRepo = path.join(projectRoot, "fresh-clone");
  try {
    await writeFixture(projectRoot, { failedWithoutFailedChecksGate: "video" });
    await mkdir(publicRepo);
    const result = await runCheck(projectRoot, ["--public-repo", publicRepo]);

    assert.equal(result.code, 1);
    const videoGate = result.summary.gates.find((gate) => gate.id === "video");
    assert.equal(videoGate.status, "failed");
    assert.equal(videoGate.detail, "command JSON summary reports failed but has no failed check(s)");
    assert.match(JSON.stringify(result.summary.blockers), /no failed check/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission gates fail when a delegated gate includes an invalid check status", async () => {
  const projectRoot = await makeProjectRoot("submission-gates-invalid-check-status-");
  const publicRepo = path.join(projectRoot, "fresh-clone");
  try {
    await writeFixture(projectRoot, { invalidCheckStatusGate: "video" });
    await mkdir(publicRepo);
    const result = await runCheck(projectRoot, ["--public-repo", publicRepo]);

    assert.equal(result.code, 1);
    const videoGate = result.summary.gates.find((gate) => gate.id === "video");
    assert.equal(videoGate.status, "failed");
    assert.equal(videoGate.detail, "command JSON summary has check video-fixture with invalid status: skipped");
    assert.match(JSON.stringify(result.summary.blockers), /invalid status: skipped/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission gates report invalid delegated check status before later field errors", async () => {
  const projectRoot = await makeProjectRoot("submission-gates-invalid-check-status-cascade-");
  const publicRepo = path.join(projectRoot, "fresh-clone");
  try {
    await writeFixture(projectRoot, { invalidCheckStatusCascadeGate: "video" });
    await mkdir(publicRepo);
    const result = await runCheck(projectRoot, ["--public-repo", publicRepo]);

    assert.equal(result.code, 1);
    const videoGate = result.summary.gates.find((gate) => gate.id === "video");
    const videoBlocker = result.summary.blockers.find((blocker) => blocker.id === "video");
    assert.equal(videoGate.status, "failed");
    assert.equal(videoGate.detail, "command JSON summary has check video-fixture with invalid status: skipped");
    assert.equal(Object.hasOwn(videoBlocker, "details"), false);
    assert.deepEqual(videoBlocker.categories, {
      video: { total: 1, failed: 1 },
    });
    assert.doesNotMatch(JSON.stringify(result.summary.blockers), /invalid detail|invalid category|empty evidence/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission gates fail when a delegated gate reports empty checks", async () => {
  const projectRoot = await makeProjectRoot("submission-gates-empty-checks-");
  const publicRepo = path.join(projectRoot, "fresh-clone");
  try {
    await writeFixture(projectRoot, { emptyChecksGate: "video" });
    await mkdir(publicRepo);
    const result = await runCheck(projectRoot, ["--public-repo", publicRepo]);

    assert.equal(result.code, 1);
    const videoGate = result.summary.gates.find((gate) => gate.id === "video");
    assert.equal(videoGate.status, "failed");
    assert.equal(videoGate.detail, "command JSON summary has empty checks[]");
    assert.match(JSON.stringify(result.summary.blockers), /empty checks/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission gates fail when a delegated gate reports non-object checks", async () => {
  const projectRoot = await makeProjectRoot("submission-gates-non-object-checks-");
  const publicRepo = path.join(projectRoot, "fresh-clone");
  try {
    await writeFixture(projectRoot, { nonObjectChecksGate: "video" });
    await mkdir(publicRepo);
    const result = await runCheck(projectRoot, ["--public-repo", publicRepo]);

    assert.equal(result.code, 1);
    const videoGate = result.summary.gates.find((gate) => gate.id === "video");
    assert.equal(videoGate.status, "failed");
    assert.equal(videoGate.detail, "command JSON summary has non-object check at index 0");
    assert.match(JSON.stringify(result.summary.blockers), /non-object check/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission gates fail when a delegated gate reports non-object check counts", async () => {
  const projectRoot = await makeProjectRoot("submission-gates-non-object-check-counts-");
  const publicRepo = path.join(projectRoot, "fresh-clone");
  try {
    await writeFixture(projectRoot, { nonObjectCheckCountsGate: "video" });
    await mkdir(publicRepo);
    const result = await runCheck(projectRoot, ["--public-repo", publicRepo]);

    assert.equal(result.code, 1);
    const videoGate = result.summary.gates.find((gate) => gate.id === "video");
    const videoBlocker = result.summary.blockers.find((blocker) => blocker.id === "video");
    assert.equal(videoGate.status, "failed");
    assert.equal(videoGate.detail, "command JSON summary checkCounts must be an object");
    assert.equal(Object.hasOwn(videoBlocker, "details"), false);
    assert.match(JSON.stringify(result.summary.blockers), /checkCounts must be an object/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission gates fail when a delegated gate reports invalid check count values", async () => {
  const projectRoot = await makeProjectRoot("submission-gates-invalid-check-count-values-");
  const publicRepo = path.join(projectRoot, "fresh-clone");
  try {
    await writeFixture(projectRoot, { invalidCheckCountValueGate: "video" });
    await mkdir(publicRepo);
    const result = await runCheck(projectRoot, ["--public-repo", publicRepo]);

    assert.equal(result.code, 1);
    const videoGate = result.summary.gates.find((gate) => gate.id === "video");
    const videoBlocker = result.summary.blockers.find((blocker) => blocker.id === "video");
    assert.equal(videoGate.status, "failed");
    assert.equal(videoGate.detail, "command JSON summary checkCounts.total must be a non-negative integer");
    assert.equal(Object.hasOwn(videoBlocker, "details"), false);
    assert.match(JSON.stringify(result.summary.blockers), /checkCounts\.total must be a non-negative integer/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission gates fail when a delegated gate reports malformed categories", async () => {
  const projectRoot = await makeProjectRoot("submission-gates-malformed-categories-");
  const publicRepo = path.join(projectRoot, "fresh-clone");
  try {
    await writeFixture(projectRoot, { malformedCategoriesGate: "video" });
    await mkdir(publicRepo);
    const result = await runCheck(projectRoot, ["--public-repo", publicRepo]);

    assert.equal(result.code, 1);
    const videoGate = result.summary.gates.find((gate) => gate.id === "video");
    const videoBlocker = result.summary.blockers.find((blocker) => blocker.id === "video");
    assert.equal(videoGate.status, "failed");
    assert.equal(videoGate.detail, "command JSON summary categories.video.failed must be a non-negative integer");
    assert.equal(Object.hasOwn(videoBlocker, "details"), false);
    assert.deepEqual(videoBlocker.categories, {
      video: { total: 1, failed: 1 },
    });
    assert.deepEqual(result.summary.categoryCounts.video, { total: 1, failed: 1 });
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission gates fail when delegated category counts do not match checks", async () => {
  const projectRoot = await makeProjectRoot("submission-gates-mismatched-categories-");
  const publicRepo = path.join(projectRoot, "fresh-clone");
  try {
    await writeFixture(projectRoot, { mismatchedCategoriesGate: "video" });
    await mkdir(publicRepo);
    const result = await runCheck(projectRoot, ["--public-repo", publicRepo]);

    assert.equal(result.code, 1);
    const videoGate = result.summary.gates.find((gate) => gate.id === "video");
    const videoBlocker = result.summary.blockers.find((blocker) => blocker.id === "video");
    assert.equal(videoGate.status, "failed");
    assert.equal(videoGate.detail, "command JSON summary categories.video.total=2 does not match checks[] category total=1");
    assert.equal(Object.hasOwn(videoBlocker, "details"), false);
    assert.deepEqual(videoBlocker.categories, {
      video: { total: 1, failed: 1 },
    });
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission gates fail when delegated checks include undeclared categories", async () => {
  const projectRoot = await makeProjectRoot("submission-gates-undeclared-categories-");
  const publicRepo = path.join(projectRoot, "fresh-clone");
  try {
    await writeFixture(projectRoot, { undeclaredCategoriesGate: "video" });
    await mkdir(publicRepo);
    const result = await runCheck(projectRoot, ["--public-repo", publicRepo]);

    assert.equal(result.code, 1);
    const videoGate = result.summary.gates.find((gate) => gate.id === "video");
    const videoBlocker = result.summary.blockers.find((blocker) => blocker.id === "video");
    assert.equal(videoGate.status, "failed");
    assert.equal(videoGate.detail, "command JSON summary categories is missing category public-repo from checks[]");
    assert.equal(Object.hasOwn(videoBlocker, "details"), false);
    assert.deepEqual(videoBlocker.categories, {
      video: { total: 1, failed: 1 },
    });
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission gates fail when delegated categories include unused entries", async () => {
  const projectRoot = await makeProjectRoot("submission-gates-unused-categories-");
  const publicRepo = path.join(projectRoot, "fresh-clone");
  try {
    await writeFixture(projectRoot, { unusedCategoriesGate: "video" });
    await mkdir(publicRepo);
    const result = await runCheck(projectRoot, ["--public-repo", publicRepo]);

    assert.equal(result.code, 1);
    const videoGate = result.summary.gates.find((gate) => gate.id === "video");
    const videoBlocker = result.summary.blockers.find((blocker) => blocker.id === "video");
    assert.equal(videoGate.status, "failed");
    assert.equal(videoGate.detail, "command JSON summary categories.public-repo has no matching checks[] category");
    assert.equal(Object.hasOwn(videoBlocker, "details"), false);
    assert.deepEqual(videoBlocker.categories, {
      video: { total: 1, failed: 1 },
    });
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission gates fail when delegated checks include invalid category fields", async () => {
  const projectRoot = await makeProjectRoot("submission-gates-invalid-check-category-");
  const publicRepo = path.join(projectRoot, "fresh-clone");
  try {
    await writeFixture(projectRoot, { invalidCheckCategoryGate: "video" });
    await mkdir(publicRepo);
    const result = await runCheck(projectRoot, ["--public-repo", publicRepo]);

    assert.equal(result.code, 1);
    const videoGate = result.summary.gates.find((gate) => gate.id === "video");
    const videoBlocker = result.summary.blockers.find((blocker) => blocker.id === "video");
    assert.equal(videoGate.status, "failed");
    assert.equal(videoGate.detail, "command JSON summary has check video-fixture with invalid category: [object Object]");
    assert.equal(Object.hasOwn(videoBlocker, "details"), false);
    assert.deepEqual(videoBlocker.categories, {
      video: { total: 1, failed: 1 },
    });
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission gates fail when delegated checks include invalid names", async () => {
  const projectRoot = await makeProjectRoot("submission-gates-invalid-check-name-");
  const publicRepo = path.join(projectRoot, "fresh-clone");
  try {
    await writeFixture(projectRoot, { invalidCheckNameGate: "video" });
    await mkdir(publicRepo);
    const result = await runCheck(projectRoot, ["--public-repo", publicRepo]);

    assert.equal(result.code, 1);
    const videoGate = result.summary.gates.find((gate) => gate.id === "video");
    const videoBlocker = result.summary.blockers.find((blocker) => blocker.id === "video");
    assert.equal(videoGate.status, "failed");
    assert.equal(videoGate.detail, "command JSON summary has check with invalid name: ");
    assert.equal(Object.hasOwn(videoBlocker, "details"), false);
    assert.deepEqual(videoBlocker.categories, {
      video: { total: 1, failed: 1 },
    });
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission gates fail when delegated failed checks omit detail", async () => {
  const projectRoot = await makeProjectRoot("submission-gates-missing-failed-detail-");
  const publicRepo = path.join(projectRoot, "fresh-clone");
  try {
    await writeFixture(projectRoot, { missingFailedDetailGate: "video" });
    await mkdir(publicRepo);
    const result = await runCheck(projectRoot, ["--public-repo", publicRepo]);

    assert.equal(result.code, 1);
    const videoGate = result.summary.gates.find((gate) => gate.id === "video");
    const videoBlocker = result.summary.blockers.find((blocker) => blocker.id === "video");
    assert.equal(videoGate.status, "failed");
    assert.equal(videoGate.detail, "command JSON summary has failed check video-fixture with invalid detail: undefined");
    assert.equal(Object.hasOwn(videoBlocker, "details"), false);
    assert.deepEqual(videoBlocker.categories, {
      video: { total: 1, failed: 1 },
    });
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission gates fail when delegated checks include invalid optional detail", async () => {
  const projectRoot = await makeProjectRoot("submission-gates-invalid-optional-detail-");
  const publicRepo = path.join(projectRoot, "fresh-clone");
  try {
    await writeFixture(projectRoot, { invalidOptionalDetailGate: "video" });
    await mkdir(publicRepo);
    const result = await runCheck(projectRoot, ["--public-repo", publicRepo]);

    assert.equal(result.code, 1);
    const videoGate = result.summary.gates.find((gate) => gate.id === "video");
    const videoBlocker = result.summary.blockers.find((blocker) => blocker.id === "video");
    assert.equal(videoGate.status, "failed");
    assert.equal(videoGate.detail, "command JSON summary has check video-fixture with invalid detail: ");
    assert.equal(Object.hasOwn(videoBlocker, "details"), false);
    assert.deepEqual(videoBlocker.categories, {
      video: { total: 1, failed: 1 },
    });
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission gates fail when delegated checks include categories without summary categories", async () => {
  const projectRoot = await makeProjectRoot("submission-gates-missing-categories-");
  const publicRepo = path.join(projectRoot, "fresh-clone");
  try {
    await writeFixture(projectRoot, { missingCategoriesGate: "video" });
    await mkdir(publicRepo);
    const result = await runCheck(projectRoot, ["--public-repo", publicRepo]);

    assert.equal(result.code, 1);
    const videoGate = result.summary.gates.find((gate) => gate.id === "video");
    const videoBlocker = result.summary.blockers.find((blocker) => blocker.id === "video");
    assert.equal(videoGate.status, "failed");
    assert.equal(videoGate.detail, "command JSON summary is missing categories for checks[] categories");
    assert.equal(Object.hasOwn(videoBlocker, "details"), false);
    assert.deepEqual(videoBlocker.categories, {
      video: { total: 1, failed: 1 },
    });
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission gates fail when delegated checks include invalid evidence", async () => {
  const projectRoot = await makeProjectRoot("submission-gates-invalid-evidence-");
  const publicRepo = path.join(projectRoot, "fresh-clone");
  try {
    await writeFixture(projectRoot, { invalidEvidenceGate: "video" });
    await mkdir(publicRepo);
    const result = await runCheck(projectRoot, ["--public-repo", publicRepo]);

    assert.equal(result.code, 1);
    const videoGate = result.summary.gates.find((gate) => gate.id === "video");
    const videoBlocker = result.summary.blockers.find((blocker) => blocker.id === "video");
    assert.equal(videoGate.status, "failed");
    assert.equal(videoGate.detail, "command JSON summary has check video-fixture with non-array evidence");
    assert.equal(Object.hasOwn(videoBlocker, "details"), false);
    assert.deepEqual(videoBlocker.categories, {
      video: { total: 1, failed: 1 },
    });
    assert.match(JSON.stringify(result.summary.blockers), /non-array evidence/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission gates fail when delegated checks include empty evidence", async () => {
  const projectRoot = await makeProjectRoot("submission-gates-empty-evidence-");
  const publicRepo = path.join(projectRoot, "fresh-clone");
  try {
    await writeFixture(projectRoot, { emptyEvidenceGate: "video" });
    await mkdir(publicRepo);
    const result = await runCheck(projectRoot, ["--public-repo", publicRepo]);

    assert.equal(result.code, 1);
    const videoGate = result.summary.gates.find((gate) => gate.id === "video");
    const videoBlocker = result.summary.blockers.find((blocker) => blocker.id === "video");
    assert.equal(videoGate.status, "failed");
    assert.equal(videoGate.detail, "command JSON summary has check video-fixture with empty evidence[]");
    assert.equal(Object.hasOwn(videoBlocker, "details"), false);
    assert.deepEqual(videoBlocker.categories, {
      video: { total: 1, failed: 1 },
    });
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission gates keep failed large JSON output parseable for parent callers", async () => {
  const projectRoot = await makeProjectRoot("submission-gates-large-failed-json-");
  const publicRepo = path.join(projectRoot, "fresh-clone");
  try {
    await writeFixture(projectRoot, { failGate: "pre-submission-large" });
    await mkdir(publicRepo);
    const result = await runCheck(projectRoot, ["--public-repo", publicRepo]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.blockers.some((blocker) => blocker.id === "pre-submission"), true);
    assert.ok(JSON.stringify(result.summary).length > 64 * 1024);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

async function makeProjectRoot(prefix) {
  const projectRoot = await mkdtemp(path.join(tmpdir(), prefix));
  await mkdir(path.join(projectRoot, "scripts"), { recursive: true });
  await copyFile(SCRIPT_PATH, path.join(projectRoot, "scripts/check-submission-gates.mjs"));
  await copyFile(JSON_GATE_HELPER_PATH, path.join(projectRoot, "scripts/json-gate-summary.mjs"));
  return projectRoot;
}

async function writeFixture(projectRoot, options = {}) {
  await writePackage(projectRoot);
  await writeGate(projectRoot, "archive-dry-run.mjs", "archive", options);
  await writeGate(projectRoot, "check-u6-rehearsal.mjs", "u6", options);
  await writeGate(projectRoot, "check-video-evidence.mjs", "video", options);
  await writeGate(projectRoot, "check-external-submission.mjs", "external", options);
  await writeGate(projectRoot, "check-defense-rehearsal.mjs", "defense", options);
  await writePublicRepo(projectRoot, options.failGate);
  await writePreSubmission(projectRoot, options.failGate);
}

async function writePackage(projectRoot) {
  await writeText(projectRoot, "package.json", JSON.stringify({
    scripts: {
      verify: "node scripts/verify-fixture.mjs",
    },
  }));
  await writeText(projectRoot, "scripts/verify-fixture.mjs", "console.log('verify fixture passed');\n");
}

async function writeGate(projectRoot, file, id, options) {
  const status = options.failGate === id ? "failed" : "passed";
  const code = status === "passed" ? 0 : 1;
  const argCheck = id === "external"
    ? `
if (process.argv.includes("--public-repo") && !process.argv[process.argv.indexOf("--public-repo") + 1]) process.exit(1);
`
    : "";
  if (options.plainTextGate === id) {
    await writeText(projectRoot, `scripts/${file}`, `
${argCheck}
console.log("${id} fixture passed without JSON");
process.exit(0);
`);
    return;
  }
  if (options.invalidStatusGate === id) {
    await writeText(projectRoot, `scripts/${file}`, `
${argCheck}
console.log(JSON.stringify({ mode: "${id}-check", status: "maybe" }));
process.exit(0);
`);
    return;
  }
  if (options.invalidStatusWithDetailsGate === id) {
    await writeText(projectRoot, `scripts/${file}`, `
${argCheck}
console.log(JSON.stringify({
  mode: "${id}-check",
  status: "maybe",
  checks: [{ name: "${id}-fixture", status: "failed", detail: "do not trust this detail", category: "public-repo" }],
  categories: { "public-repo": { total: 1, failed: 1 } }
}));
process.exit(0);
`);
    return;
  }
  if (options.invalidModeWithDetailsGate === id) {
    await writeText(projectRoot, `scripts/${file}`, `
${argCheck}
console.log(JSON.stringify({
  mode: "",
  status: "failed",
  checks: [{ name: "${id}-fixture", status: "failed", detail: "do not trust this detail", category: "public-repo" }],
  categories: { "public-repo": { total: 1, failed: 1 } }
}));
process.exit(1);
`);
    return;
  }
  if (options.contradictoryChecksGate === id) {
    await writeText(projectRoot, `scripts/${file}`, `
${argCheck}
console.log(JSON.stringify({
  mode: "${id}-check",
  status: "passed",
  checks: [{ name: "${id}-fixture", status: "failed", detail: "${id} contradiction" }],
  checkCounts: { total: 1, passed: 0, failed: 1 }
}));
process.exit(0);
`);
    return;
  }
  if (options.failedWithoutFailedChecksGate === id) {
    await writeText(projectRoot, `scripts/${file}`, `
${argCheck}
console.log(JSON.stringify({
  mode: "${id}-check",
  status: "failed",
  checks: [{ name: "${id}-fixture", status: "passed", detail: "${id} unexpectedly passed" }],
  checkCounts: { total: 1, passed: 1, failed: 0 }
}));
process.exit(1);
`);
    return;
  }
  if (options.invalidCheckStatusGate === id) {
    await writeText(projectRoot, `scripts/${file}`, `
${argCheck}
console.log(JSON.stringify({
  mode: "${id}-check",
  status: "passed",
  checks: [{ name: "${id}-fixture", status: "skipped", detail: "${id} skipped" }]
}));
process.exit(0);
`);
    return;
  }
  if (options.invalidCheckStatusCascadeGate === id) {
    await writeText(projectRoot, `scripts/${file}`, `
${argCheck}
console.log(JSON.stringify({
  mode: "${id}-check",
  status: "passed",
  checks: [{ name: "${id}-fixture", status: "skipped", detail: "", category: "", evidence: [] }]
}));
process.exit(0);
`);
    return;
  }
  if (options.emptyChecksGate === id) {
    await writeText(projectRoot, `scripts/${file}`, `
${argCheck}
console.log(JSON.stringify({
  mode: "${id}-check",
  status: "passed",
  checks: [],
  checkCounts: { total: 0, passed: 0, failed: 0 }
}));
process.exit(0);
`);
    return;
  }
  if (options.nonObjectChecksGate === id) {
    await writeText(projectRoot, `scripts/${file}`, `
${argCheck}
console.log(JSON.stringify({
  mode: "${id}-check",
  status: "passed",
  checks: [null]
}));
process.exit(0);
`);
    return;
  }
  if (options.nonObjectCheckCountsGate === id) {
    await writeText(projectRoot, `scripts/${file}`, `
${argCheck}
console.log(JSON.stringify({
  mode: "${id}-check",
  status: "passed",
  checks: [{ name: "${id}-fixture", status: "passed", detail: "${id} passed" }],
  checkCounts: null
}));
process.exit(0);
`);
    return;
  }
  if (options.invalidCheckCountValueGate === id) {
    await writeText(projectRoot, `scripts/${file}`, `
${argCheck}
console.log(JSON.stringify({
  mode: "${id}-check",
  status: "passed",
  checks: [{ name: "${id}-fixture", status: "passed", detail: "${id} passed" }],
  checkCounts: { total: "1", passed: 1, failed: 0 }
}));
process.exit(0);
`);
    return;
  }
  if (options.malformedCategoriesGate === id) {
    await writeText(projectRoot, `scripts/${file}`, `
${argCheck}
console.log(JSON.stringify({
  mode: "${id}-check",
  status: "failed",
  checks: [{ name: "${id}-fixture", status: "failed", detail: "${id} failed", category: "video" }],
  categories: { video: { total: 1, failed: "1" } }
}));
process.exit(1);
`);
    return;
  }
  if (options.mismatchedCategoriesGate === id) {
    await writeText(projectRoot, `scripts/${file}`, `
${argCheck}
console.log(JSON.stringify({
  mode: "${id}-check",
  status: "failed",
  checks: [{ name: "${id}-fixture", status: "failed", detail: "${id} failed", category: "video" }],
  categories: { video: { total: 2, failed: 1 } }
}));
process.exit(1);
`);
    return;
  }
  if (options.undeclaredCategoriesGate === id) {
    await writeText(projectRoot, `scripts/${file}`, `
${argCheck}
console.log(JSON.stringify({
  mode: "${id}-check",
  status: "failed",
  checks: [{ name: "${id}-fixture", status: "failed", detail: "${id} failed", category: "public-repo" }],
  categories: {}
}));
process.exit(1);
`);
    return;
  }
  if (options.invalidCheckCategoryGate === id) {
    await writeText(projectRoot, `scripts/${file}`, `
${argCheck}
console.log(JSON.stringify({
  mode: "${id}-check",
  status: "failed",
  checks: [{ name: "${id}-fixture", status: "failed", detail: "${id} failed", category: { name: "video" } }],
  categories: { video: { total: 1, failed: 1 } }
}));
process.exit(1);
`);
    return;
  }
  if (options.unusedCategoriesGate === id) {
    await writeText(projectRoot, `scripts/${file}`, `
${argCheck}
console.log(JSON.stringify({
  mode: "${id}-check",
  status: "failed",
  checks: [{ name: "${id}-fixture", status: "failed", detail: "${id} failed", category: "video" }],
  categories: { video: { total: 1, failed: 1 }, "public-repo": { total: 0, failed: 0 } }
}));
process.exit(1);
`);
    return;
  }
  if (options.invalidCheckNameGate === id) {
    await writeText(projectRoot, `scripts/${file}`, `
${argCheck}
console.log(JSON.stringify({
  mode: "${id}-check",
  status: "passed",
  checks: [{ name: "", status: "passed", detail: "${id} passed" }]
}));
process.exit(0);
`);
    return;
  }
  if (options.missingFailedDetailGate === id) {
    await writeText(projectRoot, `scripts/${file}`, `
${argCheck}
console.log(JSON.stringify({
  mode: "${id}-check",
  status: "failed",
  checks: [{ name: "${id}-fixture", status: "failed" }]
}));
process.exit(1);
`);
    return;
  }
  if (options.invalidOptionalDetailGate === id) {
    await writeText(projectRoot, `scripts/${file}`, `
${argCheck}
console.log(JSON.stringify({
  mode: "${id}-check",
  status: "passed",
  checks: [{ name: "${id}-fixture", status: "passed", detail: "" }]
}));
process.exit(0);
`);
    return;
  }
  if (options.missingCategoriesGate === id) {
    await writeText(projectRoot, `scripts/${file}`, `
${argCheck}
console.log(JSON.stringify({
  mode: "${id}-check",
  status: "failed",
  checks: [{ name: "${id}-fixture", status: "failed", detail: "${id} failed", category: "video" }]
}));
process.exit(1);
`);
    return;
  }
  if (options.invalidEvidenceGate === id) {
    await writeText(projectRoot, `scripts/${file}`, `
${argCheck}
console.log(JSON.stringify({
  mode: "${id}-check",
  status: "failed",
  checks: [{ name: "${id}-fixture", status: "failed", detail: "${id} failed", evidence: "bad evidence" }]
}));
process.exit(1);
`);
    return;
  }
  if (options.emptyEvidenceGate === id) {
    await writeText(projectRoot, `scripts/${file}`, `
${argCheck}
console.log(JSON.stringify({
  mode: "${id}-check",
  status: "failed",
  checks: [{ name: "${id}-fixture", status: "failed", detail: "${id} failed", evidence: [] }]
}));
process.exit(1);
`);
    return;
  }
  await writeText(projectRoot, `scripts/${file}`, `
${argCheck}
console.log(JSON.stringify({
  mode: "${id === "video" ? "video-evidence-check" : `${id}-check`}",
  status: "${status}",
  checks: [{ name: "${id}-fixture", status: "${status}", detail: "${id} fixture ${status}" }]
}));
process.exit(${code});
`);
}

async function writePublicRepo(projectRoot, failGate) {
  const status = failGate === "public-repo" ? "failed" : "passed";
  const code = status === "passed" ? 0 : 1;
  await writeText(projectRoot, "scripts/check-public-repo.mjs", `
const repoIndex = process.argv.indexOf("--repo");
if (repoIndex === -1 || !process.argv[repoIndex + 1]) process.exit(1);
console.log(JSON.stringify({
  mode: "public-repo-check",
  status: "${status}",
  checks: [{ name: "public-repo-fixture", status: "${status}", detail: "public-repo fixture ${status}" }]
}));
process.exit(${code});
`);
}

async function writePreSubmission(projectRoot, failGate) {
  const missingCloneStatus = failGate === "pre-submission" ? "passed" : "failed";
  const status = failGate === "pre-submission" ? "failed" : "passed";
  const code = status === "passed" ? 0 : 1;
  if (failGate === "pre-submission-verify") {
    await writeText(projectRoot, "scripts/pre-submission-check.sh", `#!/usr/bin/env bash
set -euo pipefail
if [[ -z "\${PUBLIC_REPO_CLONE_PATH:-}" ]]; then
  echo '{"mode":"pre-submission-check","status":"failed","checks":[{"name":"pre-submission","status":"failed","detail":"PUBLIC_REPO_CLONE_PATH is required"}]}'
  exit 1
fi
echo '{"mode":"pre-submission-check","status":"failed","categories":{"verify":{"total":1,"failed":1}},"checks":[{"name":"verify","status":"failed","detail":"npm run verify failed","category":"verify"}]}'
exit 1
`);
    return;
  }
  if (failGate === "pre-submission-large") {
    await writeText(projectRoot, "scripts/pre-submission-check.sh", `#!/usr/bin/env bash
set -euo pipefail
if [[ -z "\${PUBLIC_REPO_CLONE_PATH:-}" ]]; then
  echo '{"mode":"pre-submission-check","status":"failed","checks":[{"name":"pre-submission","status":"failed","detail":"PUBLIC_REPO_CLONE_PATH is required"}]}'
  exit 1
fi
node - <<'NODE'
const evidenceText = "x".repeat(${LARGE_STDOUT_EVIDENCE_LENGTH});
const checks = Array.from({ length: ${LARGE_STDOUT_CHECK_COUNT} }, (_, index) => ({
  name: \`git-tracking-\${index}\`,
  status: "failed",
  detail: \`large git tracking evidence \${index}\`,
  category: "git-tracking",
  evidence: [\`?? generated-release-path-\${index}-\${evidenceText}\`],
}));
console.log(JSON.stringify({
  mode: "pre-submission-check",
  status: "failed",
  categories: { "git-tracking": { total: checks.length, failed: checks.length } },
  checks,
}));
NODE
exit 1
`);
    return;
  }
  const noisyOutput = failGate === "pre-submission"
    ? `
echo "== Pre-submission readiness check =="
echo "FAIL: critical release paths are not ready for a tracked public repository"
echo '{"mode":"pre-submission-check","status":"failed","categories":{"git-tracking":{"total":1,"failed":1},"submission-materials":{"total":1,"failed":1},"public-repo":{"total":1,"failed":1}},"checks":[{"name":"git-tracking","status":"failed","detail":"critical release paths are not ready for a tracked public repository","category":"git-tracking","evidence":["?? scripts/untracked-release-helper.mjs"]},{"name":"submission-materials","status":"failed","detail":"final external submission checklist is not complete","category":"submission-materials","evidence":["docs/reports/submission/checklist.md:1:- [ ] 6.10 前对外提交"]},{"name":"public-repo","status":"failed","detail":"public repository fresh clone path is missing","category":"public-repo"}]}'
exit ${code}
`
    : `
echo '{"mode":"pre-submission-check","status":"${status}","checks":[{"name":"pre-submission","status":"${status}","detail":"pre-submission fixture ${status}"}]}'
exit ${code}
`;
await writeText(projectRoot, "scripts/pre-submission-check.sh", `#!/usr/bin/env bash
set -euo pipefail
if [[ -z "\${PUBLIC_REPO_CLONE_PATH:-}" ]]; then
  echo "missing PUBLIC_REPO_CLONE_PATH"
  echo '{"mode":"pre-submission-check","status":"${missingCloneStatus}","checks":[{"name":"pre-submission","status":"${missingCloneStatus}","detail":"PUBLIC_REPO_CLONE_PATH is required"}]}'
  exit ${missingCloneStatus === "passed" ? 0 : 1}
fi
${noisyOutput}
`);
}

async function writeText(projectRoot, relativePath, text) {
  await mkdir(path.dirname(path.join(projectRoot, relativePath)), { recursive: true });
  await writeFile(path.join(projectRoot, relativePath), text);
}

async function runCheck(projectRoot, args = [], { useProjectRootEnv = true } = {}) {
  const env = { ...process.env };
  if (useProjectRootEnv) env.SUBMISSION_GATES_PROJECT_ROOT = projectRoot;
  else delete env.SUBMISSION_GATES_PROJECT_ROOT;
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [
      path.join(projectRoot, "scripts/check-submission-gates.mjs"),
      ...args,
    ], {
      cwd: projectRoot,
      env,
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

function countGates(gates) {
  return {
    total: gates.length,
    passed: gates.filter((gate) => gate.status === "passed").length,
    failed: gates.filter((gate) => gate.status === "failed").length,
  };
}

function countChecks(checks) {
  return {
    total: checks.length,
    passed: checks.filter((check) => check.status === "passed").length,
    failed: checks.filter((check) => check.status === "failed").length,
  };
}

function countDelegatedChecks(gates) {
  return countChecks(gates.flatMap((gate) => Array.isArray(gate.summary?.checks) ? gate.summary.checks : []));
}
