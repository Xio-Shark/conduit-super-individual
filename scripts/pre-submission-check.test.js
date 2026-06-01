import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const SCRIPT_PATH = fileURLToPath(new URL("pre-submission-check.sh", import.meta.url));
const JSON_GATE_HELPER_PATH = fileURLToPath(new URL("json-gate-summary.mjs", import.meta.url));

test("pre-submission check requires a public repo fresh clone path", async () => {
  const projectRoot = await makeProjectRoot("pre-submission-missing-clone-");
  try {
    const result = await runPreSubmission(projectRoot);
    const summary = parseLastJson(result.stdout);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /PUBLIC_REPO_CLONE_PATH is required/);
    assert.match(result.stdout, /public repository fresh clone path is missing/);
    assert.match(
      result.stdout,
      /  - \[external-evidence\] public repository fresh clone path is missing for external submission evidence/,
    );
    assert.match(result.stdout, /  - \[public-repo\] public repository fresh clone path is missing/);
    assert.equal(result.stdout.includes("\x1F"), false);
    assert.equal(summary.mode, "pre-submission-check");
    assert.equal(summary.status, "failed");
    assert.equal(summary.blockerCount, 2);
    assert.deepEqual(summary.checkCounts, countChecks(summary.checks));
    assert.deepEqual(summary.categories, {
      "external-evidence": { total: 1, failed: 1 },
      "public-repo": { total: 1, failed: 1 },
    });
    assert.deepEqual(summary.checks.map((check) => check.name), ["external-evidence", "public-repo"]);
    assert.match(JSON.stringify(summary.checks), /public repository fresh clone path is missing/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("pre-submission check runs public repo check before verify", async () => {
  const projectRoot = await makeProjectRoot("pre-submission-pass-");
  const clonePath = path.join(projectRoot, "fresh-clone");
  try {
    await mkdir(clonePath);
    const result = await runPreSubmission(projectRoot, {
      PUBLIC_REPO_CLONE_PATH: clonePath,
    });
    const summary = parseLastJson(result.stdout);

    assert.equal(result.code, 0);
    assert.match(result.stdout, /OK: local pre-submission checks/);
    assert.equal(summary.mode, "pre-submission-check");
    assert.equal(summary.status, "passed");
    assert.equal(summary.blockerCount, 0);
    assert.deepEqual(summary.checkCounts, countChecks(summary.checks));
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("pre-submission check summarizes verify failure as a blocker", async () => {
  const projectRoot = await makeProjectRoot("pre-submission-verify-fail-");
  const clonePath = path.join(projectRoot, "fresh-clone");
  try {
    await mkdir(clonePath);
    await writeText(
      projectRoot,
      "scripts/verify-fixture.mjs",
      "console.error('verify fixture failed'); process.exit(1);\n",
    );

    const result = await runPreSubmission(projectRoot, {
      PUBLIC_REPO_CLONE_PATH: clonePath,
    });
    const summary = parseLastJson(result.stdout);

    assert.equal(result.code, 1);
    assert.match(`${result.stdout}\n${result.stderr}`, /verify fixture failed/);
    assert.match(result.stdout, /FAIL: npm run verify failed/);
    assert.match(result.stdout, /  - \[verify\] npm run verify failed/);
    assert.doesNotMatch(result.stdout, /OK: local pre-submission checks/);
    assert.equal(summary.mode, "pre-submission-check");
    assert.equal(summary.status, "failed");
    assert.equal(summary.blockerCount, 1);
    assert.deepEqual(summary.categories, {
      verify: { total: 1, failed: 1 },
    });
    assert.deepEqual(summary.checks.map((check) => check.category), ["verify"]);
    assert.equal(summary.checks[0].detail, "npm run verify failed");
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("pre-submission check rejects placeholder team-info URLs before verify", async () => {
  const projectRoot = await makeProjectRoot("pre-submission-placeholder-url-");
  const clonePath = path.join(projectRoot, "fresh-clone");
  try {
    await mkdir(clonePath);
    await writeText(
      projectRoot,
      "docs/reports/submission/team-info.md",
      "| item | value |\n| team | Alice |\n| demo | https://example.com/demo |\n",
    );

    const result = await runPreSubmission(projectRoot, {
      PUBLIC_REPO_CLONE_PATH: clonePath,
    });

    const summary = parseLastJson(result.stdout);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /submission materials still contain human-pending placeholders/);
    assert.match(result.stdout, /team-info\.md/);
    assert.doesNotMatch(result.stdout, /verify fixture passed/);
    assert.equal(summary.mode, "pre-submission-check");
    assert.equal(summary.status, "failed");
    assert.deepEqual(summary.categories, {
      "submission-materials": { total: 1, failed: 1 },
    });
    assert.equal(summary.checks[0].category, "submission-materials");
    assert.deepEqual(summary.checks[0].evidence, [
      "docs/reports/submission/team-info.md:3:| demo | https://example.com/demo |",
    ]);
    assert.match(JSON.stringify(summary.checks), /submission materials still contain human-pending placeholders/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("pre-submission check includes concrete git-tracking evidence in JSON summary", async () => {
  const projectRoot = await makeProjectRoot("pre-submission-git-evidence-");
  const clonePath = path.join(projectRoot, "fresh-clone");
  try {
    await mkdir(clonePath);
    await writeText(projectRoot, "scripts/untracked-release-helper.mjs", "console.log('release helper');\n");

    const result = await runPreSubmission(projectRoot, {
      PUBLIC_REPO_CLONE_PATH: clonePath,
    });
    const summary = parseLastJson(result.stdout);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /Critical release paths still untracked/);
    assert.deepEqual(summary.categories, {
      "git-tracking": { total: 1, failed: 1 },
    });
    assert.equal(summary.checks[0].category, "git-tracking");
    assert.deepEqual(summary.checks[0].evidence, ["?? scripts/untracked-release-helper.mjs"]);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("pre-submission check does not duplicate secret scan hits under docs", async () => {
  const projectRoot = await makeProjectRoot("pre-submission-secret-scan-");
  const clonePath = path.join(projectRoot, "fresh-clone");
  const secretPath = "docs/reports/submission/security-note.md";
  const fakeSecret = `sk-${"a".repeat(20)}`;
  try {
    await mkdir(clonePath);
    await writeText(projectRoot, secretPath, `Do not publish ${fakeSecret}\n`);
    await execFileAsync("git", ["add", secretPath], { cwd: projectRoot });

    const result = await runPreSubmission(projectRoot, {
      PUBLIC_REPO_CLONE_PATH: clonePath,
    });
    const summary = parseLastJson(result.stdout);
    const hitCount = countOccurrences(result.stdout, secretPath);

    assert.equal(result.code, 1);
    assert.equal(hitCount, 1);
    assert.match(result.stdout, /possible API key pattern in tracked files/);
    assert.doesNotMatch(result.stdout, /verify fixture passed/);
    assert.deepEqual(summary.categories, {
      security: { total: 1, failed: 1 },
    });
    assert.equal(summary.checks[0].category, "security");
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("pre-submission check runs local evidence gates before verify", async () => {
  const projectRoot = await makeProjectRoot("pre-submission-local-evidence-");
  const clonePath = path.join(projectRoot, "fresh-clone");
  try {
    await mkdir(clonePath);
    await writeText(projectRoot, "scripts/check-video-evidence.mjs", `
const fileIndex = process.argv.indexOf("--file");
if (fileIndex === -1 || process.argv[fileIndex + 1] !== "docs/reports/submission/video-evidence.json") process.exit(1);
console.log(JSON.stringify({
  mode: "video-evidence-check",
  status: "failed",
  checks: [{ name: "video", status: "failed", detail: "missing local recording evidence" }],
  checkCounts: { total: 1, passed: 0, failed: 1 }
}));
`);

    const result = await runPreSubmission(projectRoot, {
      PUBLIC_REPO_CLONE_PATH: clonePath,
    });
    const summary = parseLastJson(result.stdout);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /== U6 timed rehearsal evidence check ==/);
    assert.match(result.stdout, /== Local video evidence check ==/);
    assert.match(result.stdout, /local video evidence is missing or incomplete/);
    assert.doesNotMatch(result.stdout, /verify fixture passed/);
    assert.equal(summary.mode, "pre-submission-check");
    assert.equal(summary.status, "failed");
    assert.deepEqual(summary.categories, {
      "video-evidence": { total: 1, failed: 1 },
    });
    assert.match(JSON.stringify(summary.checks), /local video evidence is missing or incomplete/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("pre-submission check rejects successful commands without JSON passed summary", async () => {
  const projectRoot = await makeProjectRoot("pre-submission-plain-gate-");
  const clonePath = path.join(projectRoot, "fresh-clone");
  try {
    await mkdir(clonePath);
    await writeText(projectRoot, "scripts/check-public-repo.mjs", "console.log('plain success without JSON');\n");

    const result = await runPreSubmission(projectRoot, {
      PUBLIC_REPO_CLONE_PATH: clonePath,
    });
    const summary = parseLastJson(result.stdout);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /JSON gate did not emit a parseable JSON summary/);
    assert.match(result.stdout, /public repository fresh clone check failed/);
    assert.doesNotMatch(result.stdout, /verify fixture passed/);
    assert.equal(summary.mode, "pre-submission-check");
    assert.equal(summary.status, "failed");
    assert.deepEqual(summary.categories, {
      "public-repo": { total: 1, failed: 1 },
    });
    assert.equal(summary.checks[0].category, "public-repo");
    assert.match(JSON.stringify(summary.checks), /public repository fresh clone check failed/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("pre-submission check rejects JSON gates without status=passed", async () => {
  const projectRoot = await makeProjectRoot("pre-submission-invalid-status-");
  const clonePath = path.join(projectRoot, "fresh-clone");
  try {
    await mkdir(clonePath);
    await writeText(projectRoot, "scripts/check-external-submission.mjs", `
const repoIndex = process.argv.indexOf("--public-repo");
if (repoIndex === -1 || !process.argv[repoIndex + 1]) process.exit(1);
console.log(JSON.stringify({ mode: "external-submission-check", status: "maybe" }));
`);

    const result = await runPreSubmission(projectRoot, {
      PUBLIC_REPO_CLONE_PATH: clonePath,
    });
    const summary = parseLastJson(result.stdout);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /JSON gate reported status=maybe/);
    assert.match(result.stdout, /external submission evidence is missing or incomplete/);
    assert.doesNotMatch(result.stdout, /verify fixture passed/);
    assert.equal(summary.mode, "pre-submission-check");
    assert.equal(summary.status, "failed");
    assert.deepEqual(summary.categories, {
      "external-evidence": { total: 1, failed: 1 },
    });
    assert.equal(summary.checks[0].category, "external-evidence");
    assert.match(JSON.stringify(summary.checks), /external submission evidence is missing or incomplete/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("pre-submission check does not trust gate details when top-level status is invalid", async () => {
  const projectRoot = await makeProjectRoot("pre-submission-invalid-status-with-details-");
  const clonePath = path.join(projectRoot, "fresh-clone");
  try {
    await mkdir(clonePath);
    await writeText(projectRoot, "scripts/check-external-submission.mjs", `
const repoIndex = process.argv.indexOf("--public-repo");
if (repoIndex === -1 || !process.argv[repoIndex + 1]) process.exit(1);
console.log(JSON.stringify({
  mode: "external-submission-check",
  status: "maybe",
  checks: [{ name: "external-submission", status: "failed", detail: "do not trust this detail", category: "public-repo" }],
  categories: { "public-repo": { total: 1, failed: 1 } }
}));
`);

    const result = await runPreSubmission(projectRoot, {
      PUBLIC_REPO_CLONE_PATH: clonePath,
    });
    const summary = parseLastJson(result.stdout);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /JSON gate reported status=maybe/);
    assert.doesNotMatch(JSON.stringify(summary), /do not trust this detail|public-repo/);
    assert.equal(summary.mode, "pre-submission-check");
    assert.equal(summary.status, "failed");
    assert.deepEqual(summary.categories, {
      "external-evidence": { total: 1, failed: 1 },
    });
    assert.equal(summary.checks[0].category, "external-evidence");
    assert.equal(summary.checks[0].detail, "external submission evidence is missing or incomplete");
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("pre-submission check does not trust gate details when mode is invalid", async () => {
  const projectRoot = await makeProjectRoot("pre-submission-invalid-mode-with-details-");
  const clonePath = path.join(projectRoot, "fresh-clone");
  try {
    await mkdir(clonePath);
    await writeText(projectRoot, "scripts/check-external-submission.mjs", `
const repoIndex = process.argv.indexOf("--public-repo");
if (repoIndex === -1 || !process.argv[repoIndex + 1]) process.exit(1);
console.log(JSON.stringify({
  mode: "",
  status: "failed",
  checks: [{ name: "external-submission", status: "failed", detail: "do not trust this detail", category: "public-repo" }],
  categories: { "public-repo": { total: 1, failed: 1 } }
}));
process.exit(1);
`);

    const result = await runPreSubmission(projectRoot, {
      PUBLIC_REPO_CLONE_PATH: clonePath,
    });
    const summary = parseLastJson(result.stdout);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /JSON gate summary has invalid mode:/);
    assert.doesNotMatch(JSON.stringify(summary), /do not trust this detail|public-repo/);
    assert.equal(summary.mode, "pre-submission-check");
    assert.equal(summary.status, "failed");
    assert.deepEqual(summary.categories, {
      "external-evidence": { total: 1, failed: 1 },
    });
    assert.equal(summary.checks[0].category, "external-evidence");
    assert.equal(summary.checks[0].detail, "external submission evidence is missing or incomplete");
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("pre-submission check rejects JSON gates with inconsistent checkCounts", async () => {
  const projectRoot = await makeProjectRoot("pre-submission-bad-check-counts-");
  const clonePath = path.join(projectRoot, "fresh-clone");
  try {
    await mkdir(clonePath);
    await writeText(projectRoot, "scripts/check-public-repo.mjs", `
const repoIndex = process.argv.indexOf("--repo");
if (repoIndex === -1 || !process.argv[repoIndex + 1]) process.exit(1);
console.log(JSON.stringify({
  mode: "public-repo-check",
  status: "passed",
  checks: [{ name: "public-repo", status: "passed", detail: "contradictory fixture" }],
  checkCounts: { total: 2, passed: 1, failed: 0 }
}));
`);

    const result = await runPreSubmission(projectRoot, {
      PUBLIC_REPO_CLONE_PATH: clonePath,
    });
    const summary = parseLastJson(result.stdout);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /JSON gate checkCounts\.total=2 does not match checks\[\] total=1/);
    assert.match(result.stdout, /public repository fresh clone check failed/);
    assert.doesNotMatch(result.stdout, /verify fixture passed/);
    assert.equal(summary.status, "failed");
    assert.match(JSON.stringify(summary.checks), /public repository fresh clone check failed/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("pre-submission check rejects JSON gates with malformed checkCounts", async () => {
  const projectRoot = await makeProjectRoot("pre-submission-malformed-check-counts-");
  const clonePath = path.join(projectRoot, "fresh-clone");
  try {
    await mkdir(clonePath);
    await writeText(projectRoot, "scripts/check-public-repo.mjs", `
const repoIndex = process.argv.indexOf("--repo");
if (repoIndex === -1 || !process.argv[repoIndex + 1]) process.exit(1);
console.log(JSON.stringify({
  mode: "public-repo-check",
  status: "passed",
  checks: [{ name: "public-repo", status: "passed", detail: "bad checkCounts fixture" }],
  checkCounts: { total: "1", passed: 1, failed: 0 }
}));
`);

    const result = await runPreSubmission(projectRoot, {
      PUBLIC_REPO_CLONE_PATH: clonePath,
    });
    const summary = parseLastJson(result.stdout);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /JSON gate checkCounts\.total must be a non-negative integer/);
    assert.match(result.stdout, /public repository fresh clone check failed/);
    assert.doesNotMatch(result.stdout, /verify fixture passed/);
    assert.equal(summary.status, "failed");
    assert.match(JSON.stringify(summary.checks), /public repository fresh clone check failed/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("pre-submission check rejects JSON gates with malformed categories", async () => {
  const projectRoot = await makeProjectRoot("pre-submission-malformed-categories-");
  const clonePath = path.join(projectRoot, "fresh-clone");
  try {
    await mkdir(clonePath);
    await writeText(projectRoot, "scripts/check-public-repo.mjs", `
const repoIndex = process.argv.indexOf("--repo");
if (repoIndex === -1 || !process.argv[repoIndex + 1]) process.exit(1);
console.log(JSON.stringify({
  mode: "public-repo-check",
  status: "failed",
  checks: [{ name: "public-repo", status: "failed", detail: "bad categories fixture", category: "public-repo" }],
  categories: { "public-repo": { total: 1, failed: "1" } }
}));
process.exit(1);
`);

    const result = await runPreSubmission(projectRoot, {
      PUBLIC_REPO_CLONE_PATH: clonePath,
    });
    const summary = parseLastJson(result.stdout);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /JSON gate summary categories\.public-repo\.failed must be a non-negative integer/);
    assert.match(result.stdout, /public repository fresh clone check failed/);
    assert.doesNotMatch(result.stdout, /verify fixture passed/);
    assert.equal(summary.status, "failed");
    assert.match(JSON.stringify(summary.checks), /public repository fresh clone check failed/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("pre-submission check rejects JSON gates with category counts that do not match checks", async () => {
  const projectRoot = await makeProjectRoot("pre-submission-mismatched-categories-");
  const clonePath = path.join(projectRoot, "fresh-clone");
  try {
    await mkdir(clonePath);
    await writeText(projectRoot, "scripts/check-public-repo.mjs", `
const repoIndex = process.argv.indexOf("--repo");
if (repoIndex === -1 || !process.argv[repoIndex + 1]) process.exit(1);
console.log(JSON.stringify({
  mode: "public-repo-check",
  status: "failed",
  checks: [{ name: "public-repo", status: "failed", detail: "bad category count fixture", category: "public-repo" }],
  categories: { "public-repo": { total: 2, failed: 1 } }
}));
process.exit(1);
`);

    const result = await runPreSubmission(projectRoot, {
      PUBLIC_REPO_CLONE_PATH: clonePath,
    });
    const summary = parseLastJson(result.stdout);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /JSON gate summary categories\.public-repo\.total=2 does not match checks\[\] category total=1/);
    assert.match(result.stdout, /public repository fresh clone check failed/);
    assert.doesNotMatch(result.stdout, /verify fixture passed/);
    assert.equal(summary.status, "failed");
    assert.match(JSON.stringify(summary.checks), /public repository fresh clone check failed/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("pre-submission check rejects JSON gates with undeclared check categories", async () => {
  const projectRoot = await makeProjectRoot("pre-submission-undeclared-categories-");
  const clonePath = path.join(projectRoot, "fresh-clone");
  try {
    await mkdir(clonePath);
    await writeText(projectRoot, "scripts/check-public-repo.mjs", `
const repoIndex = process.argv.indexOf("--repo");
if (repoIndex === -1 || !process.argv[repoIndex + 1]) process.exit(1);
console.log(JSON.stringify({
  mode: "public-repo-check",
  status: "failed",
  checks: [{ name: "public-repo", status: "failed", detail: "undeclared category fixture", category: "public-repo" }],
  categories: {}
}));
process.exit(1);
`);

    const result = await runPreSubmission(projectRoot, {
      PUBLIC_REPO_CLONE_PATH: clonePath,
    });
    const summary = parseLastJson(result.stdout);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /JSON gate summary categories is missing category public-repo from checks\[\]/);
    assert.match(result.stdout, /public repository fresh clone check failed/);
    assert.doesNotMatch(result.stdout, /verify fixture passed/);
    assert.equal(summary.status, "failed");
    assert.match(JSON.stringify(summary.checks), /public repository fresh clone check failed/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("pre-submission check rejects JSON gates with unused summary categories", async () => {
  const projectRoot = await makeProjectRoot("pre-submission-unused-categories-");
  const clonePath = path.join(projectRoot, "fresh-clone");
  try {
    await mkdir(clonePath);
    await writeText(projectRoot, "scripts/check-public-repo.mjs", `
const repoIndex = process.argv.indexOf("--repo");
if (repoIndex === -1 || !process.argv[repoIndex + 1]) process.exit(1);
console.log(JSON.stringify({
  mode: "public-repo-check",
  status: "failed",
  checks: [{ name: "public-repo", status: "failed", detail: "unused category fixture", category: "public-repo" }],
  categories: { "public-repo": { total: 1, failed: 1 }, video: { total: 0, failed: 0 } }
}));
process.exit(1);
`);

    const result = await runPreSubmission(projectRoot, {
      PUBLIC_REPO_CLONE_PATH: clonePath,
    });
    const summary = parseLastJson(result.stdout);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /JSON gate summary categories\.video has no matching checks\[\] category/);
    assert.match(result.stdout, /public repository fresh clone check failed/);
    assert.doesNotMatch(result.stdout, /verify fixture passed/);
    assert.equal(summary.status, "failed");
    assert.match(JSON.stringify(summary.checks), /public repository fresh clone check failed/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("pre-submission check rejects JSON gates with invalid check categories", async () => {
  const projectRoot = await makeProjectRoot("pre-submission-invalid-check-category-");
  const clonePath = path.join(projectRoot, "fresh-clone");
  try {
    await mkdir(clonePath);
    await writeText(projectRoot, "scripts/check-public-repo.mjs", `
const repoIndex = process.argv.indexOf("--repo");
if (repoIndex === -1 || !process.argv[repoIndex + 1]) process.exit(1);
console.log(JSON.stringify({
  mode: "public-repo-check",
  status: "failed",
  checks: [{ name: "public-repo", status: "failed", detail: "invalid category fixture", category: { name: "public-repo" } }],
  categories: { "public-repo": { total: 1, failed: 1 } }
}));
process.exit(1);
`);

    const result = await runPreSubmission(projectRoot, {
      PUBLIC_REPO_CLONE_PATH: clonePath,
    });
    const summary = parseLastJson(result.stdout);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /JSON gate summary has check public-repo with invalid category: \[object Object\]/);
    assert.match(result.stdout, /public repository fresh clone check failed/);
    assert.doesNotMatch(result.stdout, /verify fixture passed/);
    assert.equal(summary.status, "failed");
    assert.match(JSON.stringify(summary.checks), /public repository fresh clone check failed/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("pre-submission check rejects JSON gates with invalid check evidence", async () => {
  const projectRoot = await makeProjectRoot("pre-submission-invalid-check-evidence-");
  const clonePath = path.join(projectRoot, "fresh-clone");
  try {
    await mkdir(clonePath);
    await writeText(projectRoot, "scripts/check-public-repo.mjs", `
const repoIndex = process.argv.indexOf("--repo");
if (repoIndex === -1 || !process.argv[repoIndex + 1]) process.exit(1);
console.log(JSON.stringify({
  mode: "public-repo-check",
  status: "failed",
  checks: [{ name: "public-repo", status: "failed", detail: "invalid evidence fixture", evidence: "bad evidence" }]
}));
process.exit(1);
`);

    const result = await runPreSubmission(projectRoot, {
      PUBLIC_REPO_CLONE_PATH: clonePath,
    });
    const summary = parseLastJson(result.stdout);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /JSON gate summary has check public-repo with non-array evidence/);
    assert.match(result.stdout, /public repository fresh clone check failed/);
    assert.doesNotMatch(result.stdout, /verify fixture passed/);
    assert.equal(summary.status, "failed");
    assert.deepEqual(summary.categories, {
      "public-repo": { total: 1, failed: 1 },
    });
    assert.equal(summary.checks[0].category, "public-repo");
    assert.match(JSON.stringify(summary.checks), /public repository fresh clone check failed/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("pre-submission check rejects JSON gates with empty check evidence", async () => {
  const projectRoot = await makeProjectRoot("pre-submission-empty-check-evidence-");
  const clonePath = path.join(projectRoot, "fresh-clone");
  try {
    await mkdir(clonePath);
    await writeText(projectRoot, "scripts/check-public-repo.mjs", `
const repoIndex = process.argv.indexOf("--repo");
if (repoIndex === -1 || !process.argv[repoIndex + 1]) process.exit(1);
console.log(JSON.stringify({
  mode: "public-repo-check",
  status: "failed",
  checks: [{ name: "public-repo", status: "failed", detail: "empty evidence fixture", evidence: [] }]
}));
process.exit(1);
`);

    const result = await runPreSubmission(projectRoot, {
      PUBLIC_REPO_CLONE_PATH: clonePath,
    });
    const summary = parseLastJson(result.stdout);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /JSON gate summary has check public-repo with empty evidence\[\]/);
    assert.match(result.stdout, /public repository fresh clone check failed/);
    assert.doesNotMatch(result.stdout, /verify fixture passed/);
    assert.equal(summary.status, "failed");
    assert.deepEqual(summary.categories, {
      "public-repo": { total: 1, failed: 1 },
    });
    assert.equal(summary.checks[0].category, "public-repo");
    assert.match(JSON.stringify(summary.checks), /public repository fresh clone check failed/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("pre-submission check rejects JSON gates with invalid check names", async () => {
  const projectRoot = await makeProjectRoot("pre-submission-invalid-check-name-");
  const clonePath = path.join(projectRoot, "fresh-clone");
  try {
    await mkdir(clonePath);
    await writeText(projectRoot, "scripts/check-public-repo.mjs", `
const repoIndex = process.argv.indexOf("--repo");
if (repoIndex === -1 || !process.argv[repoIndex + 1]) process.exit(1);
console.log(JSON.stringify({
  mode: "public-repo-check",
  status: "passed",
  checks: [{ name: "", status: "passed", detail: "invalid name fixture" }]
}));
process.exit(0);
`);

    const result = await runPreSubmission(projectRoot, {
      PUBLIC_REPO_CLONE_PATH: clonePath,
    });
    const summary = parseLastJson(result.stdout);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /JSON gate summary has check with invalid name:/);
    assert.match(result.stdout, /public repository fresh clone check failed/);
    assert.doesNotMatch(result.stdout, /verify fixture passed/);
    assert.equal(summary.status, "failed");
    assert.match(JSON.stringify(summary.checks), /public repository fresh clone check failed/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("pre-submission check reports invalid check status before later field errors", async () => {
  const projectRoot = await makeProjectRoot("pre-submission-invalid-check-status-cascade-");
  const clonePath = path.join(projectRoot, "fresh-clone");
  try {
    await mkdir(clonePath);
    await writeText(projectRoot, "scripts/check-public-repo.mjs", `
const repoIndex = process.argv.indexOf("--repo");
if (repoIndex === -1 || !process.argv[repoIndex + 1]) process.exit(1);
console.log(JSON.stringify({
  mode: "public-repo-check",
  status: "passed",
  checks: [{ name: "public-repo", status: "skipped", detail: "", category: "", evidence: [] }]
}));
process.exit(0);
`);

    const result = await runPreSubmission(projectRoot, {
      PUBLIC_REPO_CLONE_PATH: clonePath,
    });
    const summary = parseLastJson(result.stdout);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /JSON gate summary has check public-repo with invalid status: skipped/);
    assert.doesNotMatch(result.stdout, /invalid detail|invalid category|empty evidence/);
    assert.match(result.stdout, /public repository fresh clone check failed/);
    assert.doesNotMatch(result.stdout, /verify fixture passed/);
    assert.equal(summary.status, "failed");
    assert.deepEqual(summary.categories, {
      "public-repo": { total: 1, failed: 1 },
    });
    assert.equal(summary.checks[0].category, "public-repo");
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("pre-submission check rejects JSON gates with failed checks missing detail", async () => {
  const projectRoot = await makeProjectRoot("pre-submission-missing-failed-detail-");
  const clonePath = path.join(projectRoot, "fresh-clone");
  try {
    await mkdir(clonePath);
    await writeText(projectRoot, "scripts/check-public-repo.mjs", `
const repoIndex = process.argv.indexOf("--repo");
if (repoIndex === -1 || !process.argv[repoIndex + 1]) process.exit(1);
console.log(JSON.stringify({
  mode: "public-repo-check",
  status: "failed",
  checks: [{ name: "public-repo", status: "failed" }]
}));
process.exit(1);
`);

    const result = await runPreSubmission(projectRoot, {
      PUBLIC_REPO_CLONE_PATH: clonePath,
    });
    const summary = parseLastJson(result.stdout);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /JSON gate summary has failed check public-repo with invalid detail: undefined/);
    assert.match(result.stdout, /public repository fresh clone check failed/);
    assert.doesNotMatch(result.stdout, /verify fixture passed/);
    assert.equal(summary.status, "failed");
    assert.match(JSON.stringify(summary.checks), /public repository fresh clone check failed/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("pre-submission check rejects JSON gates with invalid optional detail", async () => {
  const projectRoot = await makeProjectRoot("pre-submission-invalid-optional-detail-");
  const clonePath = path.join(projectRoot, "fresh-clone");
  try {
    await mkdir(clonePath);
    await writeText(projectRoot, "scripts/check-public-repo.mjs", `
const repoIndex = process.argv.indexOf("--repo");
if (repoIndex === -1 || !process.argv[repoIndex + 1]) process.exit(1);
console.log(JSON.stringify({
  mode: "public-repo-check",
  status: "passed",
  checks: [{ name: "public-repo", status: "passed", detail: "" }]
}));
process.exit(0);
`);

    const result = await runPreSubmission(projectRoot, {
      PUBLIC_REPO_CLONE_PATH: clonePath,
    });
    const summary = parseLastJson(result.stdout);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /JSON gate summary has check public-repo with invalid detail:/);
    assert.match(result.stdout, /public repository fresh clone check failed/);
    assert.doesNotMatch(result.stdout, /verify fixture passed/);
    assert.equal(summary.status, "failed");
    assert.deepEqual(summary.categories, {
      "public-repo": { total: 1, failed: 1 },
    });
    assert.equal(summary.checks[0].category, "public-repo");
    assert.match(JSON.stringify(summary.checks), /public repository fresh clone check failed/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("pre-submission check rejects JSON gates with check categories but no categories", async () => {
  const projectRoot = await makeProjectRoot("pre-submission-missing-categories-");
  const clonePath = path.join(projectRoot, "fresh-clone");
  try {
    await mkdir(clonePath);
    await writeText(projectRoot, "scripts/check-public-repo.mjs", `
const repoIndex = process.argv.indexOf("--repo");
if (repoIndex === -1 || !process.argv[repoIndex + 1]) process.exit(1);
console.log(JSON.stringify({
  mode: "public-repo-check",
  status: "failed",
  checks: [{ name: "public-repo", status: "failed", detail: "missing categories fixture", category: "public-repo" }]
}));
process.exit(1);
`);

    const result = await runPreSubmission(projectRoot, {
      PUBLIC_REPO_CLONE_PATH: clonePath,
    });
    const summary = parseLastJson(result.stdout);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /JSON gate summary is missing categories for checks\[\] categories/);
    assert.match(result.stdout, /public repository fresh clone check failed/);
    assert.doesNotMatch(result.stdout, /verify fixture passed/);
    assert.equal(summary.status, "failed");
    assert.match(JSON.stringify(summary.checks), /public repository fresh clone check failed/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("pre-submission check rejects passed JSON gates with failed checks", async () => {
  const projectRoot = await makeProjectRoot("pre-submission-contradictory-checks-");
  const clonePath = path.join(projectRoot, "fresh-clone");
  try {
    await mkdir(clonePath);
    await writeText(projectRoot, "scripts/check-public-repo.mjs", `
const repoIndex = process.argv.indexOf("--repo");
if (repoIndex === -1 || !process.argv[repoIndex + 1]) process.exit(1);
console.log(JSON.stringify({
  mode: "public-repo-check",
  status: "passed",
  checks: [{ name: "public-repo", status: "failed", detail: "contradictory fixture" }],
  checkCounts: { total: 1, passed: 0, failed: 1 }
}));
`);

    const result = await runPreSubmission(projectRoot, {
      PUBLIC_REPO_CLONE_PATH: clonePath,
    });
    const summary = parseLastJson(result.stdout);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /JSON gate summary reports passed but has 1 failed check\(s\)/);
    assert.match(result.stdout, /public repository fresh clone check failed/);
    assert.doesNotMatch(result.stdout, /verify fixture passed/);
    assert.equal(summary.status, "failed");
    assert.match(JSON.stringify(summary.checks), /public repository fresh clone check failed/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("pre-submission check rejects failed JSON gates without failed checks", async () => {
  const projectRoot = await makeProjectRoot("pre-submission-failed-without-failed-checks-");
  const clonePath = path.join(projectRoot, "fresh-clone");
  try {
    await mkdir(clonePath);
    await writeText(projectRoot, "scripts/check-public-repo.mjs", `
const repoIndex = process.argv.indexOf("--repo");
if (repoIndex === -1 || !process.argv[repoIndex + 1]) process.exit(1);
console.log(JSON.stringify({
  mode: "public-repo-check",
  status: "failed",
  checks: [{ name: "public-repo", status: "passed", detail: "bad failed summary fixture" }],
  checkCounts: { total: 1, passed: 1, failed: 0 }
}));
`);

    const result = await runPreSubmission(projectRoot, {
      PUBLIC_REPO_CLONE_PATH: clonePath,
    });
    const summary = parseLastJson(result.stdout);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /JSON gate summary reports failed but has no failed check\(s\)/);
    assert.match(result.stdout, /public repository fresh clone check failed/);
    assert.doesNotMatch(result.stdout, /verify fixture passed/);
    assert.equal(summary.status, "failed");
    assert.match(JSON.stringify(summary.checks), /public repository fresh clone check failed/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("pre-submission check validates JSON summary from commands that exit nonzero", async () => {
  const projectRoot = await makeProjectRoot("pre-submission-nonzero-bad-json-");
  const clonePath = path.join(projectRoot, "fresh-clone");
  try {
    await mkdir(clonePath);
    await writeText(projectRoot, "scripts/check-public-repo.mjs", `
const repoIndex = process.argv.indexOf("--repo");
if (repoIndex === -1 || !process.argv[repoIndex + 1]) process.exit(1);
console.log(JSON.stringify({
  mode: "public-repo-check",
  status: "failed",
  checks: [{ name: "public-repo", status: "passed", detail: "bad failed summary fixture" }],
  checkCounts: { total: 1, passed: 1, failed: 0 }
}));
process.exit(1);
`);

    const result = await runPreSubmission(projectRoot, {
      PUBLIC_REPO_CLONE_PATH: clonePath,
    });
    const summary = parseLastJson(result.stdout);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /JSON gate summary reports failed but has no failed check\(s\)/);
    assert.match(result.stdout, /public repository fresh clone check failed/);
    assert.doesNotMatch(result.stdout, /verify fixture passed/);
    assert.equal(summary.status, "failed");
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("pre-submission check parses large gate output through stdin", async () => {
  const projectRoot = await makeProjectRoot("pre-submission-large-output-");
  const clonePath = path.join(projectRoot, "fresh-clone");
  try {
    await mkdir(clonePath);
    await writeText(projectRoot, "scripts/check-public-repo.mjs", `
const repoIndex = process.argv.indexOf("--repo");
if (repoIndex === -1 || !process.argv[repoIndex + 1]) process.exit(1);
for (let index = 0; index < 512; index += 1) {
  console.log("public repo scan line " + index + " " + "x".repeat(256));
}
console.log(JSON.stringify({
  mode: "public-repo-check",
  status: "passed",
  checks: [{ name: "public-repo", status: "passed", detail: "large output fixture" }],
  checkCounts: { total: 1, passed: 1, failed: 0 }
}));
`);

    const result = await runPreSubmission(projectRoot, {
      PUBLIC_REPO_CLONE_PATH: clonePath,
    });
    const summary = parseLastJson(result.stdout);

    assert.equal(result.code, 0);
    assert.match(result.stdout, /public repo scan line 511/);
    assert.match(result.stdout, /verify fixture passed/);
    assert.equal(summary.status, "passed");
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

async function makeProjectRoot(prefix) {
  const projectRoot = await mkdtemp(path.join(tmpdir(), prefix));
  await writeFixture(projectRoot);
  await execFileAsync("git", ["init"], { cwd: projectRoot });
  await execFileAsync("git", ["add", "."], { cwd: projectRoot });
  return projectRoot;
}

async function writeFixture(projectRoot) {
  await mkdir(path.join(projectRoot, "scripts"), { recursive: true });
  await mkdir(path.join(projectRoot, "docs/reports/submission"), { recursive: true });
  await copyFile(SCRIPT_PATH, path.join(projectRoot, "scripts/pre-submission-check.sh"));
  await copyFile(JSON_GATE_HELPER_PATH, path.join(projectRoot, "scripts/json-gate-summary.mjs"));
  await writeText(projectRoot, "package.json", JSON.stringify({
    scripts: {
      "archive:dry-run": "node scripts/archive-dry-run.mjs",
      "check:u6": "node scripts/check-u6-rehearsal.mjs",
      "check:video-evidence": "node scripts/check-video-evidence.mjs",
      "check:defense-rehearsal": "node scripts/check-defense-rehearsal.mjs",
      "check:public-repo": "node scripts/check-public-repo.mjs",
      "check:external-submission": "node scripts/check-external-submission.mjs",
      verify: "node scripts/verify-fixture.mjs",
    },
  }));
  await writeText(projectRoot, "README.md", "# Public repo\n");
  await writeText(projectRoot, "scripts/archive-dry-run.mjs", "console.log(JSON.stringify({ mode: 'archive-dry-run', status: 'passed', checks: [{ name: 'archive', status: 'passed', detail: 'fixture' }] }));\n");
  await writeText(projectRoot, "scripts/check-u6-rehearsal.mjs", jsonGateFixture("u6-check", "u6"));
  await writeText(projectRoot, "scripts/check-video-evidence.mjs", jsonGateFixture("video-evidence-check", "video-evidence"));
  await writeText(projectRoot, "scripts/check-defense-rehearsal.mjs", jsonGateFixture("defense-rehearsal-check", "defense-rehearsal"));
  await writeText(projectRoot, "scripts/check-public-repo.mjs", checkPublicRepoFixture());
  await writeText(projectRoot, "scripts/check-external-submission.mjs", checkExternalSubmissionFixture());
  await writeText(projectRoot, "scripts/verify-fixture.mjs", "console.log('verify fixture passed');\n");
  await writeText(projectRoot, "scripts/archive-manifest.json", JSON.stringify({
    required: [
      "README.md",
      "scripts/archive-manifest.json",
      "scripts/check-public-repo.mjs",
      "scripts/check-external-submission.mjs",
      "scripts/pre-submission-check.sh",
      "docs/reports/submission/team-info.md",
      "docs/reports/submission/checklist.md",
      "docs/reports/submission/public-repo-guide.md",
    ],
    runIds: [],
    requiredRunFiles: [],
  }));
  await writeText(projectRoot, "docs/reports/submission/team-info.md", "| item | value |\n| team | Alice |\n");
  await writeText(projectRoot, "docs/reports/submission/checklist.md", "- [x] 6.10 前对外提交\n");
  await writeText(projectRoot, "docs/reports/submission/public-repo-guide.md", "| 远端公开 URL | https://github.com/conduit-delivery/conduit-super-individual |\n");
}

function checkPublicRepoFixture() {
  return `
const repoIndex = process.argv.indexOf("--repo");
if (repoIndex === -1 || !process.argv[repoIndex + 1]) {
  console.error("missing --repo");
  process.exit(1);
}
console.log(JSON.stringify({
  mode: "public-repo-check",
  status: "passed",
  checks: [{ name: "public-repo", status: "passed", detail: "fixture" }]
}));
`;
}

function jsonGateFixture(mode, name) {
  return `
console.log(JSON.stringify({
  mode: ${JSON.stringify(mode)},
  status: "passed",
  checks: [{ name: ${JSON.stringify(name)}, status: "passed", detail: "fixture" }],
  checkCounts: { total: 1, passed: 1, failed: 0 }
}));
`;
}

function checkExternalSubmissionFixture() {
  return `
const repoIndex = process.argv.indexOf("--public-repo");
if (repoIndex === -1 || !process.argv[repoIndex + 1]) {
  console.error("missing --public-repo");
  process.exit(1);
}
if (process.argv[repoIndex + 1] !== process.env.PUBLIC_REPO_CLONE_PATH) {
  console.error("public repo path mismatch");
  process.exit(1);
}
console.log(JSON.stringify({
  mode: "external-submission-check",
  status: "passed",
  checks: [{ name: "external-submission", status: "passed", detail: "fixture" }]
}));
`;
}

async function writeText(projectRoot, relativePath, text) {
  await mkdir(path.dirname(path.join(projectRoot, relativePath)), { recursive: true });
  await writeFile(path.join(projectRoot, relativePath), text);
}

async function runPreSubmission(projectRoot, env = {}) {
  try {
    const { stdout, stderr } = await execFileAsync("bash", ["scripts/pre-submission-check.sh"], {
      cwd: projectRoot,
      env: { ...process.env, ...env },
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
}

function parseLastJson(stdout) {
  const lines = stdout.trim().split(/\r?\n/u);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (!lines[index].trim().startsWith("{")) continue;
    try {
      return JSON.parse(lines.slice(index).join("\n"));
    } catch {
      // Keep scanning upward until the start of the final JSON object.
    }
  }
  throw new Error("missing JSON summary");
}

function countChecks(checks) {
  return {
    total: checks.length,
    passed: checks.filter((check) => check.status === "passed").length,
    failed: checks.filter((check) => check.status === "failed").length,
  };
}

function countOccurrences(text, needle) {
  let count = 0;
  let offset = 0;
  while (true) {
    const index = text.indexOf(needle, offset);
    if (index === -1) return count;
    count += 1;
    offset = index + needle.length;
  }
}
