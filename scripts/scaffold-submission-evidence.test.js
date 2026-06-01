import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const SCRIPT_PATH = fileURLToPath(new URL("scaffold-submission-evidence.mjs", import.meta.url));
const WRITE_GUARD_PATH = fileURLToPath(new URL("submission-write-guard.mjs", import.meta.url));

test("submission evidence scaffold writes all placeholder templates", async () => {
  const projectRoot = await makeProjectRoot();
  try {
    await writeFixtureScripts(projectRoot);
    const result = await runScaffold(projectRoot);
    const summary = result.summary;

    assert.equal(result.code, 0);
    assert.equal(summary.mode, "submission-evidence-scaffold");
    assert.equal(summary.status, "scaffolded");
    assert.deepEqual(summary.availableKinds, [
      "u6-rehearsal",
      "video-evidence",
      "external-submission",
      "defense-rehearsal",
    ]);
    assert.equal(summary.kindFilter, undefined);
    assert.deepEqual(summary.checkCounts, countChecks(summary.checks));
    assert.equal(summary.checks.every((check) => check.status === "passed"), true);
    assert.deepEqual(summary.outputs.map((item) => item.output), [
      "docs/reports/submission/u6-rehearsal-manifest.template.json",
      "docs/reports/submission/video-evidence.template.json",
      "docs/reports/submission/external-submission-evidence.template.json",
      "docs/reports/submission/defense-rehearsal-evidence.template.json",
    ]);
    assert.deepEqual(summary.outputs.map((item) => item.finalPath), [
      "docs/reports/submission/u6-rehearsal-manifest.json",
      "docs/reports/submission/video-evidence.json",
      "docs/reports/submission/external-submission-evidence.json",
      "docs/reports/submission/defense-rehearsal-evidence.json",
    ]);
    assert.deepEqual(summary.finalEvidence, []);
    assert.deepEqual(summary.nextSteps.map((item) => item.writeTo), summary.outputs.map((item) => item.finalPath));
    assert.match(summary.nextSteps.find((item) => item.kind === "video-evidence").validateWith, /--file docs\/reports\/submission\/video-evidence\.json/);
    assert.match(summary.nextSteps.find((item) => item.kind === "external-submission").validateWith, /--file docs\/reports\/submission\/external-submission-evidence\.json --public-repo <fresh-clone-path>/);
    assert.match(summary.nextSteps.find((item) => item.kind === "defense-rehearsal").validateWith, /--file docs\/reports\/submission\/defense-rehearsal-evidence\.json/);
    assert.deepEqual(summary.actionPlan.map((item) => item.kind), [
      "u6-rehearsal",
      "video-evidence",
      "external-submission",
      "defense-rehearsal",
    ]);
    assert.equal(summary.safety.createsFinalEvidenceByDefault, false);
    assert.equal(summary.safety.validatesByDefault, false);
    assert.equal(summary.safety.copyFinalOptInEnv, "SCAFFOLD_SUBMISSION_EVIDENCE_COPY_FINAL=1");
    assert.equal(summary.safety.validationOptInEnv, "SCAFFOLD_SUBMISSION_EVIDENCE_RUN_VALIDATION=1");
    assert.equal(
      summary.actionPlan.find((item) => item.kind === "u6-rehearsal").copyCommand,
      "npm run scaffold:submission-evidence -- --kind u6-rehearsal --copy-final",
    );
    assert.equal(
      summary.actionPlan.find((item) => item.kind === "u6-rehearsal").copyFinalCommand,
      "npm run scaffold:submission-evidence -- --kind u6-rehearsal --copy-final",
    );
    assert.equal(summary.actionPlan.find((item) => item.kind === "external-submission").editTarget, "docs/reports/submission/external-submission-evidence.json");
    assert.deepEqual(summary.actionPlan.find((item) => item.kind === "external-submission").validationSafety, {
      optInRequired: true,
      optInEnv: "SCAFFOLD_SUBMISSION_EVIDENCE_RUN_VALIDATION=1",
      mayRequireFreshClonePath: true,
    });

    for (const output of summary.outputs) {
      const text = await readFile(path.join(projectRoot, output.output), "utf8");
      assert.match(text, /REPLACE_WITH|template/iu);
    }
    assert.match(summary.note, /Templates only/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission evidence scaffold can render a markdown handoff", async () => {
  const projectRoot = await makeProjectRoot();
  try {
    await writeFixtureScripts(projectRoot);
    const result = await runScaffoldRaw(projectRoot, ["--markdown"]);

    assert.equal(result.code, 0);
    assert.match(result.stdout, /^# Submission Evidence Scaffold/u);
    assert.match(result.stdout, /Status: scaffolded/u);
    assert.match(result.stdout, /Available kinds: u6-rehearsal, video-evidence, external-submission, defense-rehearsal/u);
    assert.match(result.stdout, /Kind filter: none/u);
    assert.match(result.stdout, /Templates: 4/u);
    assert.match(result.stdout, /Final evidence files copied: 0/u);
    assert.match(result.stdout, /Safety: commands copy final evidence by default=false; validate by default=false/u);
    assert.match(result.stdout, /Opt in: SCAFFOLD_SUBMISSION_EVIDENCE_COPY_FINAL=1; SCAFFOLD_SUBMISSION_EVIDENCE_RUN_VALIDATION=1/u);
    assert.match(result.stdout, /## Templates\n- u6-rehearsal: `docs\/reports\/submission\/u6-rehearsal-manifest\.template\.json` -> `docs\/reports\/submission\/u6-rehearsal-manifest\.json`/u);
    assert.match(result.stdout, /## Manual Next Steps/u);
    assert.match(result.stdout, /Prepare final placeholder explicitly: `npm run scaffold:submission-evidence -- --kind video-evidence --copy-final`/u);
    assert.match(result.stdout, /Fill real evidence: `docs\/reports\/submission\/external-submission-evidence\.json`/u);
    assert.match(result.stdout, /Validate: `npm run check:external-submission -- --file docs\/reports\/submission\/external-submission-evidence\.json --public-repo <fresh-clone-path>`/u);
    assert.match(result.stdout, /Validation safety: opt-in via `SCAFFOLD_SUBMISSION_EVIDENCE_RUN_VALIDATION=1`; fresh clone path required/u);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission evidence scaffold propagates provided public repo path into JSON next steps", async () => {
  const projectRoot = await makeProjectRoot();
  try {
    await writeFixtureScripts(projectRoot);
    const freshClonePath = "/tmp/fresh clone";
    const result = await runScaffold(projectRoot, ["--kind", "external-submission", "--public-repo", freshClonePath]);
    const externalStep = result.summary.nextSteps.find((item) => item.kind === "external-submission");

    assert.equal(result.code, 0);
    assert.equal(result.summary.publicRepo, freshClonePath);
    assert.equal(
      externalStep.validateWith,
      "npm run check:external-submission -- --file docs/reports/submission/external-submission-evidence.json --public-repo '/tmp/fresh clone'",
    );
    assert.equal(result.summary.actionPlan[0].validationSafety.mayRequireFreshClonePath, false);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission evidence scaffold propagates provided public repo path into markdown handoff", async () => {
  const projectRoot = await makeProjectRoot();
  try {
    await writeFixtureScripts(projectRoot);
    const result = await runScaffoldRaw(projectRoot, [
      "--kind",
      "external-submission",
      "--markdown",
      "--public-repo",
      "/tmp/fresh clone",
    ]);

    assert.equal(result.code, 0);
    assert.equal(
      result.stdout.includes("Validate: `npm run check:external-submission -- --file docs/reports/submission/external-submission-evidence.json --public-repo '/tmp/fresh clone'`"),
      true,
    );
    assert.match(result.stdout, /Validation safety: opt-in via `SCAFFOLD_SUBMISSION_EVIDENCE_RUN_VALIDATION=1`; fresh clone path not required/u);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission evidence scaffold can render shell commands without overwriting final evidence", async () => {
  const projectRoot = await makeProjectRoot();
  try {
    await writeFixtureScripts(projectRoot);
    const result = await runScaffoldRaw(projectRoot, ["--commands"]);

    assert.equal(result.code, 0);
    assert.match(result.stdout, /^#!\/usr\/bin\/env bash\nset -euo pipefail\ncd '/u);
    assert.match(result.stdout, /# Templates have already been generated by scaffold:submission-evidence/u);
    assert.match(result.stdout, /# To focus one evidence type, add: --kind video-evidence/u);
    assert.match(result.stdout, /# available_kinds=u6-rehearsal,video-evidence,external-submission,defense-rehearsal/u);
    assert.match(result.stdout, /# safety_copy_final_by_default=false/u);
    assert.match(result.stdout, /# safety_validate_by_default=false/u);
    assert.match(result.stdout, /# safety_copy_final_opt_in=SCAFFOLD_SUBMISSION_EVIDENCE_COPY_FINAL=1/u);
    assert.match(result.stdout, /# safety_validation_opt_in=SCAFFOLD_SUBMISSION_EVIDENCE_RUN_VALIDATION=1/u);
    assert.match(result.stdout, /: "\$\{FRESH_CLONE_PATH:=\}"/u);
    assert.match(result.stdout, /^if \[ "\$\{SCAFFOLD_SUBMISSION_EVIDENCE_COPY_FINAL:-0\}" != "1" \]; then$/um);
    assert.match(result.stdout, /^  echo 'Skipped final evidence placeholder creation\. Rerun with SCAFFOLD_SUBMISSION_EVIDENCE_COPY_FINAL=1 only when you are ready to fill real evidence\.'$/um);
    assert.match(result.stdout, /^npm run scaffold:submission-evidence -- --kind u6-rehearsal --copy-final$/um);
    assert.doesNotMatch(result.stdout, /\bcp 'docs\/reports\/submission/u);
    assert.match(result.stdout, /^# fill real evidence in docs\/reports\/submission\/external-submission-evidence\.json$/um);
    assert.match(result.stdout, /^if \[ "\$\{SCAFFOLD_SUBMISSION_EVIDENCE_RUN_VALIDATION:-0\}" != "1" \]; then$/um);
    assert.match(result.stdout, /^test -n "\$FRESH_CLONE_PATH" \|\| \{ echo 'FRESH_CLONE_PATH is required'; exit 1; \}$/um);
    assert.match(result.stdout, /^npm run check:external-submission -- --file docs\/reports\/submission\/external-submission-evidence\.json --public-repo "\$FRESH_CLONE_PATH"$/um);
    assert.doesNotMatch(result.stdout, /SCAFFOLD_SUBMISSION_EVIDENCE_COPY_FINAL=1 npm run/u);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission evidence scaffold commands default FRESH_CLONE_PATH from provided public repo path", async () => {
  const projectRoot = await makeProjectRoot();
  try {
    await writeFixtureScripts(projectRoot);
    const result = await runScaffoldRaw(projectRoot, [
      "--kind",
      "external-submission",
      "--commands",
      "--public-repo",
      "/tmp/fresh clone",
    ]);

    assert.equal(result.code, 0);
    assert.match(result.stdout, /: \$\{FRESH_CLONE_PATH:='\/tmp\/fresh clone'\}/u);
    assert.match(result.stdout, /^test -n "\$FRESH_CLONE_PATH" \|\| \{ echo 'FRESH_CLONE_PATH is required'; exit 1; \}$/um);
    assert.match(result.stdout, /^npm run check:external-submission -- --file docs\/reports\/submission\/external-submission-evidence\.json --public-repo "\$FRESH_CLONE_PATH"$/um);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission evidence scaffold commands keep provided public repo path single-line", async () => {
  const projectRoot = await makeProjectRoot();
  try {
    await writeFixtureScripts(projectRoot);
    const result = await runScaffoldRaw(projectRoot, [
      "--kind",
      "external-submission",
      "--commands",
      "--public-repo",
      "/tmp/fresh clone\necho injected",
    ]);

    assert.equal(result.code, 0);
    assert.match(result.stdout, /: \$\{FRESH_CLONE_PATH:='\/tmp\/fresh clone\\necho injected'\}/u);
    assert.doesNotMatch(result.stdout, /^echo injected$/um);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission evidence scaffold markdown keeps provided public repo path single-line", async () => {
  const projectRoot = await makeProjectRoot();
  try {
    await writeFixtureScripts(projectRoot);
    const result = await runScaffoldRaw(projectRoot, [
      "--kind",
      "external-submission",
      "--markdown",
      "--public-repo",
      "/tmp/fresh clone\necho injected",
    ]);

    assert.equal(result.code, 0);
    assert.match(result.stdout, /--public-repo '\/tmp\/fresh clone\\necho injected'/u);
    assert.doesNotMatch(result.stdout, /^echo injected$/um);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission evidence scaffold can write markdown output inside project root", async () => {
  const projectRoot = await makeProjectRoot();
  try {
    await writeFixtureScripts(projectRoot);
    const result = await runScaffoldRaw(projectRoot, ["--markdown", "--write", "docs/reports/submission/scaffold.md"]);

    assert.equal(result.code, 0);
    assert.equal(
      await readFile(path.join(projectRoot, "docs/reports/submission/scaffold.md"), "utf8"),
      `${result.stdout.trimEnd()}\n`,
    );
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission evidence scaffold writes commands output as an executable script", async () => {
  const projectRoot = await makeProjectRoot();
  try {
    await writeFixtureScripts(projectRoot);
    const result = await runScaffoldRaw(projectRoot, ["--commands", "--write", "docs/reports/submission/scaffold.sh"]);

    assert.equal(result.code, 0);
    assert.equal(
      await readFile(path.join(projectRoot, "docs/reports/submission/scaffold.sh"), "utf8"),
      `${result.stdout.trimEnd()}\n`,
    );
    const mode = (await stat(path.join(projectRoot, "docs/reports/submission/scaffold.sh"))).mode & 0o777;
    assert.equal(mode, 0o755);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission evidence scaffold refuses to write outside the project root", async () => {
  const projectRoot = await makeProjectRoot();
  try {
    await writeFixtureScripts(projectRoot);
    const result = await runScaffold(projectRoot, ["--write", "../outside.json"]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.match(result.summary.checks[0].detail, /Refusing to write scaffold output outside project root/u);
    await assert.rejects(
      readFile(path.join(projectRoot, "docs/reports/submission/u6-rehearsal-manifest.template.json"), "utf8"),
      /ENOENT/u,
    );
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission evidence scaffold refuses to write to final evidence files", async () => {
  const projectRoot = await makeProjectRoot();
  try {
    await writeFixtureScripts(projectRoot);
    const result = await runScaffold(projectRoot, ["--write", "docs/reports/submission/video-evidence.json"]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.match(result.summary.checks[0].detail, /Refusing to write scaffold output to final evidence file/u);
    await assert.rejects(
      readFile(path.join(projectRoot, "docs/reports/submission/video-evidence.template.json"), "utf8"),
      /ENOENT/u,
    );
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission evidence scaffold supports --format commands", async () => {
  const projectRoot = await makeProjectRoot();
  try {
    await writeFixtureScripts(projectRoot);
    const result = await runScaffoldRaw(projectRoot, ["--format", "commands"]);

    assert.equal(result.code, 0);
    assert.match(result.stdout, /# Submission evidence scaffold commands/u);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission evidence scaffold can focus on one evidence kind", async () => {
  const projectRoot = await makeProjectRoot();
  try {
    await writeFixtureScripts(projectRoot);
    const result = await runScaffold(projectRoot, ["--kind", "video-evidence"]);
    const summary = result.summary;

    assert.equal(result.code, 0);
    assert.equal(summary.kindFilter, "video-evidence");
    assert.deepEqual(summary.outputs.map((item) => item.kind), ["video-evidence"]);
    assert.deepEqual(summary.nextSteps.map((item) => item.kind), ["video-evidence"]);
    assert.deepEqual(summary.actionPlan.map((item) => item.kind), ["video-evidence"]);
    assert.deepEqual(summary.finalEvidence, []);
    assert.match(
      await readFile(path.join(projectRoot, "docs/reports/submission/video-evidence.template.json"), "utf8"),
      /REPLACE_WITH_TEMPLATE/u,
    );
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission evidence scaffold can copy missing final evidence placeholders explicitly", async () => {
  const projectRoot = await makeProjectRoot();
  try {
    await writeFixtureScripts(projectRoot);
    const result = await runScaffold(projectRoot, ["--copy-final"]);
    const summary = result.summary;

    assert.equal(result.code, 0);
    assert.equal(summary.status, "scaffolded");
    assert.deepEqual(summary.finalEvidence.map((item) => item.status), [
      "copied",
      "copied",
      "copied",
      "copied",
    ]);
    assert.deepEqual(summary.checkCounts, countChecks(summary.checks));
    assert.equal(summary.checks.filter((check) => check.name.startsWith("final:")).length, 4);

    for (const item of summary.finalEvidence) {
      const finalPath = path.join(projectRoot, item.finalPath);
      const text = await readFile(finalPath, "utf8");
      const mode = (await stat(finalPath)).mode & 0o777;
      assert.match(text, /REPLACE_WITH|template/iu);
      assert.match(item.detail, /replace placeholders/u);
      assert.equal(mode, 0o644);
    }
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission evidence scaffold copy-final can focus on one evidence kind", async () => {
  const projectRoot = await makeProjectRoot();
  try {
    await writeFixtureScripts(projectRoot);
    const result = await runScaffold(projectRoot, ["--copy-final", "--kind", "video-evidence"]);
    const summary = result.summary;

    assert.equal(result.code, 0);
    assert.deepEqual(summary.outputs.map((item) => item.kind), ["video-evidence"]);
    assert.deepEqual(summary.finalEvidence, [
      {
        kind: "video-evidence",
        finalPath: "docs/reports/submission/video-evidence.json",
        template: "docs/reports/submission/video-evidence.template.json",
        status: "copied",
        detail: "template copied; replace placeholders with real human/external evidence before validation",
      },
    ]);
    assert.match(
      await readFile(path.join(projectRoot, "docs/reports/submission/video-evidence.json"), "utf8"),
      /REPLACE_WITH_TEMPLATE/u,
    );
    await assert.rejects(
      readFile(path.join(projectRoot, "docs/reports/submission/external-submission-evidence.json"), "utf8"),
      /ENOENT/u,
    );
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission evidence scaffold copy-final does not overwrite existing final evidence", async () => {
  const projectRoot = await makeProjectRoot();
  try {
    await writeFixtureScripts(projectRoot);
    await mkdir(path.join(projectRoot, "docs/reports/submission"), { recursive: true });
    await writeFile(path.join(projectRoot, "docs/reports/submission/video-evidence.json"), '{"note":"real draft"}\n');

    const result = await runScaffold(projectRoot, ["--copy-final"]);
    const videoResult = result.summary.finalEvidence.find((item) => item.kind === "video-evidence");

    assert.equal(result.code, 0);
    assert.equal(videoResult.status, "skipped-existing");
    assert.match(videoResult.detail, /not overwritten/u);
    assert.equal(
      await readFile(path.join(projectRoot, "docs/reports/submission/video-evidence.json"), "utf8"),
      '{"note":"real draft"}\n',
    );
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission evidence scaffold copy-final normalizes executable template mode", async () => {
  const projectRoot = await makeProjectRoot();
  try {
    await writeFixtureScripts(projectRoot);
    const result = await runScaffold(projectRoot, ["--copy-final", "--kind", "video-evidence"]);
    const templatePath = path.join(projectRoot, "docs/reports/submission/video-evidence.template.json");
    const finalPath = path.join(projectRoot, "docs/reports/submission/video-evidence.json");

    assert.equal(result.code, 0);
    assert.equal((await stat(templatePath)).mode & 0o777, 0o755);
    assert.equal((await stat(finalPath)).mode & 0o777, 0o644);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission evidence scaffold copy-final refuses symlinked final evidence parent", async () => {
  const projectRoot = await makeProjectRoot();
  const outsideRoot = await mkdtemp(path.join(tmpdir(), "submission-evidence-outside-"));
  try {
    await writeFixtureScripts(projectRoot);
    await rm(path.join(projectRoot, "docs/reports/submission"), { force: true, recursive: true });
    await mkdir(path.join(projectRoot, "docs/reports"), { recursive: true });
    await symlink(outsideRoot, path.join(projectRoot, "docs/reports/submission"));

    const result = await runScaffold(projectRoot, ["--copy-final", "--kind", "video-evidence"]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.match(result.summary.checks[0].detail, /Refusing to write submission evidence template through a symlinked parent outside project root/u);
    await assert.rejects(
      readFile(path.join(outsideRoot, "video-evidence.json"), "utf8"),
      /ENOENT/u,
    );
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
    await rm(outsideRoot, { force: true, recursive: true });
  }
});

test("submission evidence scaffold copy-final refuses symlinked final evidence files", async () => {
  const projectRoot = await makeProjectRoot();
  const outsideRoot = await mkdtemp(path.join(tmpdir(), "submission-evidence-outside-"));
  try {
    await writeFixtureScripts(projectRoot);
    await mkdir(path.join(projectRoot, "docs/reports/submission"), { recursive: true });
    await writeFile(path.join(outsideRoot, "video-evidence.json"), '{"note":"outside"}\n');
    await symlink(
      path.join(outsideRoot, "video-evidence.json"),
      path.join(projectRoot, "docs/reports/submission/video-evidence.json"),
    );

    const result = await runScaffold(projectRoot, ["--copy-final", "--kind", "video-evidence"]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.match(result.summary.checks[0].detail, /Refusing to write final evidence placeholder to symlink target docs\/reports\/submission\/video-evidence\.json/u);
    assert.equal(await readFile(path.join(outsideRoot, "video-evidence.json"), "utf8"), '{"note":"outside"}\n');
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
    await rm(outsideRoot, { force: true, recursive: true });
  }
});

test("submission evidence scaffold refuses symlinked delegated template output", async () => {
  const projectRoot = await makeProjectRoot();
  const outsideRoot = await mkdtemp(path.join(tmpdir(), "submission-evidence-template-outside-"));
  try {
    await writeSymlinkTemplateFixtureScripts(projectRoot, path.join(outsideRoot, "video-evidence.template.json"));
    const result = await runScaffold(projectRoot, ["--copy-final", "--kind", "video-evidence"]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.match(result.summary.checks[0].detail, /Refusing to write submission evidence template to symlink target docs\/reports\/submission\/video-evidence\.template\.json/u);
    await assert.rejects(
      readFile(path.join(projectRoot, "docs/reports/submission/video-evidence.json"), "utf8"),
      /ENOENT/u,
    );
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
    await rm(outsideRoot, { force: true, recursive: true });
  }
});

test("submission evidence scaffold returns JSON when a delegated template command is missing", async () => {
  const projectRoot = await makeProjectRoot();
  try {
    const result = await runScaffold(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "submission-evidence-scaffold");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.outputs.length, 0);
    assert.deepEqual(result.summary.finalEvidence, []);
    assert.deepEqual(result.summary.checkCounts, countChecks(result.summary.checks));
    assert.deepEqual(result.summary.actionPlan, []);
    assert.equal(result.summary.checks[0].name, "fatal");
    assert.match(result.summary.checks[0].detail, /scaffold-u6-rehearsal\.mjs/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission evidence scaffold returns structured JSON for invalid arguments", async () => {
  const projectRoot = await makeProjectRoot();
  try {
    await writeFixtureScripts(projectRoot);
    const result = await runScaffold(projectRoot, ["--format", "yaml"]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "submission-evidence-scaffold");
    assert.equal(result.summary.status, "failed");
    assert.match(result.summary.usage, /--copy-final/);
    assert.match(result.summary.checks[0].detail, /Usage: node scripts\/scaffold-submission-evidence\.mjs/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission evidence scaffold rejects option flags used as missing values", async () => {
  const projectRoot = await makeProjectRoot();
  try {
    await writeFixtureScripts(projectRoot);
    const result = await runScaffold(projectRoot, ["--kind", "--write", "docs/reports/submission/scaffold.json"]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "submission-evidence-scaffold");
    assert.equal(result.summary.status, "failed");
    assert.match(result.summary.checks[0].detail, /Usage: node scripts\/scaffold-submission-evidence\.mjs/);
    await assert.rejects(
      readFile(path.join(projectRoot, "docs/reports/submission/u6-rehearsal-manifest.template.json"), "utf8"),
      /ENOENT/u,
    );
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission evidence scaffold fails clearly for an unknown evidence kind", async () => {
  const projectRoot = await makeProjectRoot();
  try {
    await writeFixtureScripts(projectRoot);
    const result = await runScaffold(projectRoot, ["--kind", "bogus"]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.deepEqual(result.summary.availableKinds, [
      "u6-rehearsal",
      "video-evidence",
      "external-submission",
      "defense-rehearsal",
    ]);
    assert.match(result.summary.checks[0].detail, /Unknown evidence kind bogus/u);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

async function makeProjectRoot() {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "submission-evidence-scaffold-"));
  await mkdir(path.join(projectRoot, "scripts"), { recursive: true });
  await copyFile(SCRIPT_PATH, path.join(projectRoot, "scripts/scaffold-submission-evidence.mjs"));
  await copyFile(WRITE_GUARD_PATH, path.join(projectRoot, "scripts/submission-write-guard.mjs"));
  return projectRoot;
}

async function runScaffold(projectRoot, args = []) {
  const result = await runScaffoldRaw(projectRoot, args);
  return {
    code: result.code,
    summary: JSON.parse(result.stdout),
    stderr: result.stderr,
  };
}

async function runScaffoldRaw(projectRoot, args = []) {
  const script = path.join(projectRoot, "scripts/scaffold-submission-evidence.mjs");
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [script, ...args], { cwd: projectRoot });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return {
      code: error.code,
      stdout: error.stdout,
      stderr: error.stderr,
    };
  }
}

async function writeFixtureScripts(projectRoot) {
  await writeScript(projectRoot, "scaffold-u6-rehearsal.mjs", `#!/usr/bin/env node
import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
const output = process.argv[process.argv.indexOf("--output") + 1];
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, '{"note":"REPLACE_WITH_U6_TEMPLATE"}\\n');
await chmod(output, 0o755);
`);
  for (const file of [
    "check-video-evidence.mjs",
    "check-external-submission.mjs",
    "check-defense-rehearsal.mjs",
  ]) {
    await writeScript(projectRoot, file, `#!/usr/bin/env node
import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
const output = process.argv[process.argv.indexOf("--write-template") + 1];
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, '{"note":"REPLACE_WITH_TEMPLATE"}\\n');
await chmod(output, 0o755);
`);
  }
}

async function writeSymlinkTemplateFixtureScripts(projectRoot, outsideTemplate) {
  await writeFixtureScripts(projectRoot);
  await writeFile(path.join(projectRoot, "scripts/check-video-evidence.mjs"), `#!/usr/bin/env node
import { mkdir, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
const output = process.argv[process.argv.indexOf("--write-template") + 1];
await mkdir(path.dirname(output), { recursive: true });
await writeFile(${JSON.stringify(outsideTemplate)}, '{"note":"REPLACE_WITH_TEMPLATE"}\\n');
await symlink(${JSON.stringify(outsideTemplate)}, output);
`);
}

async function writeScript(projectRoot, file, text) {
  await writeFile(path.join(projectRoot, "scripts", file), text);
}

function countChecks(checks) {
  return {
    total: checks.length,
    passed: checks.filter((check) => check.status === "passed").length,
    failed: checks.filter((check) => check.status === "failed").length,
  };
}
