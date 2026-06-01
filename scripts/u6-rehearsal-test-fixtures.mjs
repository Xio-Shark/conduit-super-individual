import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export function makeProjectRoot(prefix) {
  return mkdtemp(path.join(tmpdir(), prefix));
}

export async function writeRehearsalEvidence(projectRoot, options = {}) {
  const runDir = path.join(projectRoot, "docs/reports/runs/run-u6-demo");
  await mkdir(path.join(projectRoot, "services/skills/src"), { recursive: true });
  await mkdir(path.join(projectRoot, "docs/reports/submission/u6-recordings"), { recursive: true });
  await mkdir(path.join(projectRoot, "docs/reports/submission/u6-change-lists"), { recursive: true });
  await mkdir(runDir, { recursive: true });

  await writeFile(path.join(projectRoot, "services/skills/src/commentDraftCounter.js"), "export const commentDraftCounterSkill = { id: 'comment-draft-counter' };\n");
  await writeFile(path.join(projectRoot, "services/skills/src/registry.js"), registryText(options.registerSkill));
  await writeFile(path.join(projectRoot, "docs/reports/submission/u6-recordings/comment-counter.mp4"), "video bytes\n");
  if (!options.skipChangeList) {
    await writeFile(path.join(projectRoot, "docs/reports/submission/u6-change-lists/comment-counter.txt"), changeListText(options.changeListPaths ?? singleChangeList()));
  }

  await writeFile(path.join(runDir, "requirement.md"), "# requirement\n");
  await writeFile(path.join(runDir, "plan.md"), "# plan\n");
  await writeFile(path.join(runDir, "diff.patch"), "diff --git a/frontend/file.js b/frontend/file.js\n");
  await writeFile(path.join(runDir, "run-summary.json"), JSON.stringify({ status: "passed", stage: "ready_for_pr" }));
  await writeFile(path.join(runDir, "verification.json"), JSON.stringify({
    status: options.verificationStatus ?? "passed",
    checks: [{ command: "npm run verify", exitCode: options.exitCode ?? 0 }],
  }));
}

export async function writeManifestEvidence(projectRoot, options = {}) {
  const rehearsals = manifestRehearsals();
  const slowRunIds = new Set(options.slowRunIds ?? []);
  const manifestPath = "docs/reports/submission/u6-rehearsal-manifest.json";

  await mkdir(path.join(projectRoot, "services/skills/src"), { recursive: true });
  await mkdir(path.join(projectRoot, "docs/reports/submission/u6-recordings"), { recursive: true });
  await mkdir(path.join(projectRoot, "docs/reports/submission/u6-change-lists"), { recursive: true });
  await mkdir(path.join(projectRoot, "docs/reports/submission"), { recursive: true });

  for (const rehearsal of rehearsals) {
    await writeManifestRehearsal(projectRoot, {
      ...rehearsal,
      endedAt: slowRunIds.has(rehearsal.runId)
        ? "2026-05-24T10:20:30+08:00"
        : "2026-05-24T10:12:30+08:00",
    });
  }
  await writeFile(path.join(projectRoot, "services/skills/src/registry.js"), registryManifestText(rehearsals));
  await writeFile(path.join(projectRoot, manifestPath), JSON.stringify(manifestJson(rehearsals, slowRunIds)));
  return manifestPath;
}

function registryText(registerSkill) {
  return registerSkill === false
    ? "const SKILLS = Object.freeze([]);\n"
    : "import { commentDraftCounterSkill } from './commentDraftCounter.js';\nconst SKILLS = Object.freeze([commentDraftCounterSkill]);\n";
}

function singleChangeList() {
  return [
    "services/skills/src/commentDraftCounter.js",
    "services/skills/src/registry.js",
    "docs/reports/runs/run-u6-demo/requirement.md",
    "docs/reports/runs/run-u6-demo/plan.md",
    "docs/reports/runs/run-u6-demo/diff.patch",
    "docs/reports/runs/run-u6-demo/verification.json",
    "docs/reports/runs/run-u6-demo/run-summary.json",
    "docs/reports/submission/u6-recordings/comment-counter.mp4",
    "docs/reports/submission/u6-change-lists/comment-counter.txt",
  ];
}

function manifestRehearsals() {
  return [
    manifestRehearsal("评论输入框字数倒计数", "run-u6-comment-counter", "comment-draft-counter", "commentDraftCounter", "comment-counter.mp4"),
    manifestRehearsal("作者资料卡显示注册天数", "run-u6-profile-age", "profile-account-age", "profileAccountAge", "profile-age.mp4"),
    manifestRehearsal("文章卡片收藏状态筛选开关", "run-u6-favorite-filter", "article-favorite-filter-toggle", "articleFavoriteFilterToggle", "favorite-filter.mp4"),
  ];
}

function manifestRehearsal(title, runId, skillId, moduleName, recordingFile) {
  return {
    title,
    runId,
    skillId,
    skillFile: `services/skills/src/${moduleName}.js`,
    implementationChangeList: `docs/reports/submission/u6-change-lists/${moduleName}.txt`,
    moduleName,
    exportName: `${moduleName}Skill`,
    recording: `docs/reports/submission/u6-recordings/${recordingFile}`,
  };
}

function registryManifestText(rehearsals) {
  return [
    ...rehearsals.map((rehearsal) => `import { ${rehearsal.exportName} } from './${rehearsal.moduleName}.js';`),
    `const SKILLS = Object.freeze([${rehearsals.map((rehearsal) => rehearsal.exportName).join(", ")}]);`,
  ].join("\n");
}

function manifestJson(rehearsals, slowRunIds) {
  return {
    minRehearsals: 3,
    minPassed: 2,
    maxMinutes: 15,
    rehearsals: rehearsals.map((rehearsal) => ({
      title: rehearsal.title,
      runId: rehearsal.runId,
      skillId: rehearsal.skillId,
      skillFile: rehearsal.skillFile,
      implementationChangeList: rehearsal.implementationChangeList,
      startedAt: "2026-05-24T10:00:00+08:00",
      endedAt: slowRunIds.has(rehearsal.runId) ? "2026-05-24T10:20:30+08:00" : "2026-05-24T10:12:30+08:00",
      recording: rehearsal.recording,
    })),
  };
}

async function writeManifestRehearsal(projectRoot, rehearsal) {
  const runDir = path.join(projectRoot, `docs/reports/runs/${rehearsal.runId}`);
  await mkdir(runDir, { recursive: true });
  await writeFile(path.join(projectRoot, rehearsal.skillFile), `export const ${rehearsal.exportName} = { id: '${rehearsal.skillId}' };\n`);
  await writeFile(path.join(projectRoot, rehearsal.recording), "video bytes\n");
  await writeFile(path.join(projectRoot, rehearsal.implementationChangeList), changeListText(manifestChangeList(rehearsal)));
  await writeFile(path.join(runDir, "requirement.md"), "# requirement\n");
  await writeFile(path.join(runDir, "plan.md"), "# plan\n");
  await writeFile(path.join(runDir, "diff.patch"), "diff --git a/frontend/file.js b/frontend/file.js\n");
  await writeFile(path.join(runDir, "run-summary.json"), JSON.stringify({ status: "passed", stage: "ready_for_pr" }));
  await writeFile(path.join(runDir, "verification.json"), JSON.stringify({
    status: "passed",
    checks: [{ command: "npm run verify", exitCode: 0 }],
  }));
}

function manifestChangeList(rehearsal) {
  return [
    rehearsal.skillFile,
    "services/skills/src/registry.js",
    `docs/reports/runs/${rehearsal.runId}/requirement.md`,
    `docs/reports/runs/${rehearsal.runId}/plan.md`,
    `docs/reports/runs/${rehearsal.runId}/diff.patch`,
    `docs/reports/runs/${rehearsal.runId}/verification.json`,
    `docs/reports/runs/${rehearsal.runId}/run-summary.json`,
    rehearsal.recording,
    rehearsal.implementationChangeList,
  ];
}

function changeListText(paths) {
  return `${paths.map((relativePath) => `A  ${relativePath}`).join("\n")}\n`;
}
