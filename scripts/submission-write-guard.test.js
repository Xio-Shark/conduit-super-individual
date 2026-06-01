import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { FINAL_EVIDENCE_FILENAMES, resolveSafeWriteTarget, writeGeneratedOutput } from "./submission-write-guard.mjs";

test("final evidence filename guard covers every manual submission JSON", () => {
  assert.deepEqual([...FINAL_EVIDENCE_FILENAMES].sort(), [
    "defense-rehearsal-evidence.json",
    "external-submission-evidence.json",
    "u6-rehearsal-manifest.json",
    "video-evidence.json",
  ]);
});

test("resolveSafeWriteTarget allows project-local output files", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "submission-write-guard-"));
  try {
    assert.equal(
      await resolveSafeWriteTarget(projectRoot, "docs/reports/submission/next-steps.md", "test output"),
      path.join(projectRoot, "docs/reports/submission/next-steps.md"),
    );
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("resolveSafeWriteTarget rejects paths outside the project root", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "submission-write-guard-"));
  try {
    await assert.rejects(
      resolveSafeWriteTarget(projectRoot, "../next-steps.md", "test output"),
      /Refusing to write test output outside project root/u,
    );
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("resolveSafeWriteTarget rejects final evidence filenames", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "submission-write-guard-"));
  try {
    await assert.rejects(
      resolveSafeWriteTarget(projectRoot, "docs/reports/submission/video-evidence.json", "test output"),
      /Refusing to write test output to final evidence file docs\/reports\/submission\/video-evidence\.json/u,
    );
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("resolveSafeWriteTarget rejects symlinked parent directories outside the project root", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "submission-write-guard-"));
  const outsideRoot = await mkdtemp(path.join(tmpdir(), "submission-write-outside-"));
  try {
    await mkdir(path.join(projectRoot, "docs/reports"), { recursive: true });
    await symlink(outsideRoot, path.join(projectRoot, "docs/reports/submission"));

    await assert.rejects(
      resolveSafeWriteTarget(projectRoot, "docs/reports/submission/next-steps.md", "test output"),
      /Refusing to write test output through a symlinked parent outside project root/u,
    );
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
    await rm(outsideRoot, { force: true, recursive: true });
  }
});

test("resolveSafeWriteTarget rejects symlink output files", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "submission-write-guard-"));
  const outsideRoot = await mkdtemp(path.join(tmpdir(), "submission-write-outside-"));
  try {
    await mkdir(path.join(projectRoot, "docs/reports/submission"), { recursive: true });
    await writeFile(path.join(outsideRoot, "target.md"), "outside\n");
    await symlink(
      path.join(outsideRoot, "target.md"),
      path.join(projectRoot, "docs/reports/submission/next-steps.md"),
    );

    await assert.rejects(
      resolveSafeWriteTarget(projectRoot, "docs/reports/submission/next-steps.md", "test output"),
      /Refusing to write test output to symlink target docs\/reports\/submission\/next-steps\.md/u,
    );
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
    await rm(outsideRoot, { force: true, recursive: true });
  }
});

test("writeGeneratedOutput creates parent directories and marks bash scripts executable", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "submission-write-guard-"));
  try {
    const target = path.join(projectRoot, "docs/reports/submission/scaffold.sh");
    await writeGeneratedOutput(target, "#!/usr/bin/env bash\necho ok");

    assert.equal(await readFile(target, "utf8"), "#!/usr/bin/env bash\necho ok\n");
    const mode = (await stat(target)).mode & 0o777;
    assert.equal(mode, 0o755);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("writeGeneratedOutput leaves non-script files non-executable", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "submission-write-guard-"));
  try {
    const target = path.join(projectRoot, "docs/reports/submission/next-steps.md");
    await writeGeneratedOutput(target, "# Submission Next Steps");

    assert.equal(await readFile(target, "utf8"), "# Submission Next Steps\n");
    const mode = (await stat(target)).mode & 0o111;
    assert.equal(mode, 0);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("writeGeneratedOutput clears stale execute bits when overwriting with non-script output", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "submission-write-guard-"));
  try {
    const target = path.join(projectRoot, "docs/reports/submission/next-steps.md");
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, "#!/usr/bin/env bash\necho old\n");
    await chmod(target, 0o755);

    await writeGeneratedOutput(target, "# Submission Next Steps");

    assert.equal(await readFile(target, "utf8"), "# Submission Next Steps\n");
    const mode = (await stat(target)).mode & 0o777;
    assert.equal(mode, 0o644);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});
