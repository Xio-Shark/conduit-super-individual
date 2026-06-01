import assert from "node:assert/strict";
import test from "node:test";
import { verifyRun } from "./verificationAgent.js";
import { articleListDisplayFieldSkill } from "../../skills/src/articleListDisplayField.js";
import { articleDraftIndicatorSkill } from "../../skills/src/articleDraftIndicator.js";

test("verifyRun fails when required test script is missing", async () => {
  const sandbox = createFakeSandbox({ scripts: {} });
  const verification = await verifyRun({ sandbox });
  const testCheck = verification.checks.find(
    (check) => check.command === "npm run test",
  );

  assert.equal(verification.status, "failed");
  assert.equal(testCheck.status, "gap");
  assert.equal(testCheck.source, "conduit-script");
  assert.equal(testCheck.exitCode, 1);
  assert.equal(testCheck.summary, "Conduit package.json has no test script");
});

test("verifyRun passes when lint and test commands pass", async () => {
  const sandbox = createFakeSandbox({
    scripts: { lint: "eslint .", test: "vitest" },
  });

  const verification = await verifyRun({ sandbox });

  assert.equal(verification.status, "passed");
  assert.deepEqual(
    verification.checks.map((check) => check.command),
    ["npm run lint", "npm run test"],
  );
  assert.equal(verification.checks[0].source, "conduit-script");
});

test("verifyRun uses implementation lint adapter only when Skill declares it", async () => {
  const sandbox = createFakeSandbox({
    scripts: { test: "vitest" },
  });

  const verification = await verifyRun({ sandbox, skill: articleListDisplayFieldSkill });

  assert.equal(verification.status, "passed");
  assert.equal(verification.checks[0].command, "npm run lint:sandbox");
  assert.equal(verification.checks[0].source, "implementation-lint-adapter");
});

test("verifyRun fails when Conduit lint is absent and Skill does not declare adapter", async () => {
  const sandbox = createFakeSandbox({
    scripts: { test: "vitest" },
  });

  const verification = await verifyRun({
    sandbox,
    skill: { id: "no-lint-adapter", validation: ["npm test"] },
  });

  assert.equal(verification.status, "failed");
  assert.equal(verification.checks[0].command, "npm run lint");
  assert.equal(verification.checks[0].status, "gap");
  assert.equal(
    verification.checks[0].summary,
    "Conduit package.json has no lint script and Skill did not declare lint:sandbox",
  );
});

test("verifyRun fails L2 draft check when changed files lack cross-stack anchors", async () => {
  const sandbox = createFakeSandbox({
    scripts: { lint: "eslint .", test: "vitest" },
    files: {
      "frontend/src/components/ArticlesPreview/ArticlesPreview.jsx": "draft comment only",
      "backend/models/Article.js": "draft comment only",
      "backend/controllers/articles.js": "draft comment only",
    },
  });

  const verification = await verifyRun({
    sandbox,
    skill: articleDraftIndicatorSkill,
    changedFiles: articleDraftIndicatorSkill.targetPaths,
  });
  const crossStack = verification.checks.find((check) => check.command === "cross-stack-sync");

  assert.equal(verification.status, "failed");
  assert.equal(crossStack.status, "failed");
});

test("verifyRun runs cross-stack checks only when the Skill declares one", async () => {
  const sandbox = createFakeSandbox({
    scripts: { lint: "eslint .", test: "vitest" },
    files: {
      "frontend/src/components/ArticlesPreview/ArticlesPreview.jsx": "article list content",
    },
  });

  const verification = await verifyRun({
    sandbox,
    skill: articleListDisplayFieldSkill,
    changedFiles: articleListDisplayFieldSkill.targetPaths,
  });

  assert.equal(verification.status, "passed");
  assert.equal(
    verification.checks.some((check) => check.command === "cross-stack-sync"),
    false,
  );
});

test("verifyRun fails declared cross-stack checks when changed files are missing", async () => {
  const sandbox = createFakeSandbox({
    scripts: { lint: "eslint .", test: "vitest" },
  });

  const verification = await verifyRun({
    sandbox,
    skill: articleDraftIndicatorSkill,
    changedFiles: [],
  });
  const crossStack = verification.checks.find((check) => check.command === "cross-stack-sync");

  assert.equal(verification.status, "failed");
  assert.equal(crossStack.status, "failed");
  assert.match(crossStack.summary, /requires changed file/);
});

function createFakeSandbox({ scripts, files = {} }) {
  return {
    listPackageScripts: async () => scripts,
    readText: async (path) => files[path],
    runNpmScript: async (scriptName) => ({
      command: `npm run ${scriptName}`,
      exitCode: 0,
      stdout: "",
      stderr: "",
      durationMs: 1,
    }),
    runCommand: async (command, args) => ({
      command: [command, ...args].join(" "),
      exitCode: 0,
      stdout: "",
      stderr: "",
      durationMs: 1,
    }),
  };
}
