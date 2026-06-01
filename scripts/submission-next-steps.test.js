import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, chmod, copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const SCRIPT_PATH = fileURLToPath(new URL("submission-next-steps.mjs", import.meta.url));
const JSON_GATE_HELPER_PATH = fileURLToPath(new URL("json-gate-summary.mjs", import.meta.url));
const WRITE_GUARD_PATH = fileURLToPath(new URL("submission-write-guard.mjs", import.meta.url));
const PACKAGE_JSON_PATH = fileURLToPath(new URL("../package.json", import.meta.url));
const README_PATH = fileURLToPath(new URL("../README.md", import.meta.url));

test("package scripts expose current next-step shortcuts", async () => {
  const packageJson = JSON.parse(await readFile(PACKAGE_JSON_PATH, "utf8"));

  assert.equal(packageJson.scripts.lint, "npm run lint:sandbox");
  assert.equal(packageJson.scripts["submission:next-steps:summary"], "node scripts/submission-next-steps.mjs --summary");
  assert.equal(packageJson.scripts["submission:next-steps:summary:write"], "node scripts/submission-next-steps.mjs --summary --write docs/reports/submission/next-steps-summary.json");
  assert.equal(packageJson.scripts["submission:next-steps:next"], "node scripts/submission-next-steps.mjs --next");
  assert.equal(packageJson.scripts["submission:next-steps:next:summary"], "node scripts/submission-next-steps.mjs --next --summary");
  assert.equal(packageJson.scripts["submission:next-steps:next:summary:write"], "node scripts/submission-next-steps.mjs --next --summary --write docs/reports/submission/next-steps-summary.json");
  assert.equal(packageJson.scripts["submission:next-steps:next:markdown"], "node scripts/submission-next-steps.mjs --next --markdown");
  assert.equal(packageJson.scripts["submission:next-steps:next:commands"], "node scripts/submission-next-steps.mjs --next --commands");
  assert.equal(packageJson.scripts["submission:next-steps:commands:write"], "node scripts/submission-next-steps.mjs --commands --write docs/reports/submission/next-steps.sh");
  assert.equal(packageJson.scripts["submission:next-steps:next:commands:write"], "node scripts/submission-next-steps.mjs --next --commands --write docs/reports/submission/next-steps.sh");
});

test("README documents next-step command opt-in safety switches", async () => {
  const readme = await readFile(README_PATH, "utf8");

  assert.match(readme, /SUBMISSION_NEXT_STEPS_PREPARE_PLACEHOLDERS=1 npm run submission:next-steps -- --commands/u);
  assert.match(readme, /SUBMISSION_NEXT_STEPS_RUN_VALIDATION=1 FRESH_CLONE_PATH=\/path\/to\/fresh\/clone npm run submission:next-steps -- --commands/u);
  assert.match(readme, /npm run submission:next-steps -- --commands --write docs\/reports\/submission\/next-steps\.sh/u);
  assert.match(readme, /npm run submission:next-steps -- --summary/u);
  assert.match(readme, /npm run submission:next-steps -- --summary --write docs\/reports\/submission\/next-steps-summary\.json/u);
  assert.match(readme, /npm run submission:next-steps:summary/u);
  assert.match(readme, /npm run submission:next-steps:summary:write/u);
  assert.match(readme, /npm run submission:next-steps:next:summary/u);
  assert.match(readme, /npm run submission:next-steps:next:summary:write/u);
  assert.match(readme, /npm run submission:next-steps:commands:write/u);
  assert.match(readme, /npm run submission:next-steps:next:commands:write/u);
  assert.match(readme, /避免 `npm run \.\.\. > file` 把 npm banner 写入脚本/u);
  assert.match(readme, /默认输出还会给出 `firstOpenClosureStep`、`fullGateFirstOpenClosureStep`、`fullGateSuggestedNextCommand`、`suggestedNextCommand`、`nextClosureCommandsWriteCommand`、`nextClosureSummaryWriteCommand`、`currentViewNextCommand`、`currentViewCommandsWriteCommand`、`currentViewSummaryWriteCommand`、`filterState`、`prerequisiteState`、`completionSemantics`、`nextStepFocus`、`actionSummary`、`nextClosureActionSummary`、`scriptWriteRecommendation` 和 `summaryWriteRecommendation`/u);
  assert.match(readme, /`actionSummary` 汇总 evidence 文件数、人工输入数、验证命令数、可 scaffold 的 blocker、需要 fresh clone 路径的 blocker，以及缺少准备动作或验证命令的 blocker/u);
  assert.match(readme, /`nextClosureActionSummary` 用同一口径汇总当前视图最早未闭合收口组/u);
  assert.match(readme, /Markdown 输出也会显示当前视图的安全写入命令，并以 `Action summary` 行显示 evidence 文件数、人工输入数、验证命令数、可 scaffold blocker、fresh clone blocker、缺少准备动作的 blocker 和缺少验证命令的 blocker；`Next closure action summary` 用同一格式只显示当前视图最早未闭合收口组；commands 输出也会在脚本头部写入同等 `# action_\*` 和 `# next_action_\*` 注释/u);
  assert.match(readme, /`currentViewCommandsWriteCommand` 保留当前 `--next` \/ `--category` \/ `--plan-item` \/ `--blocker` 过滤器，并追加 `--commands --write docs\/reports\/submission\/next-steps\.sh`/u);
  assert.match(readme, /`nextClosureSummaryWriteCommand` 则把下一收口组聚焦 summary 直接保存为 `docs\/reports\/submission\/next-steps-summary\.json`/u);
  assert.match(readme, /`currentViewSummaryWriteCommand` 保留当前过滤器与转发参数，并追加 `--summary --write docs\/reports\/submission\/next-steps-summary\.json`/u);
  assert.match(readme, /Markdown 输出也会显示当前视图的安全写入命令/u);
  assert.match(readme, /`--public-repo` 和 `--u6-manifest` 会保留到 `forwardedGateArgs\[\]`、下一步建议命令、下一收口组写入命令和当前视图写入命令里/u);
  assert.match(readme, /当 commands 输出需要 fresh clone 路径且已传入 `--public-repo` 时，生成脚本会把该路径作为 `FRESH_CLONE_PATH` 默认值/u);
  assert.match(readme, /`scriptWriteRecommendation` 让自动化明确识别 commands 输出应通过 `--write`、`submission:next-steps:commands:write` 或 `submission:next-steps:next:commands:write` 保存/u);
  assert.match(readme, /`summaryWriteRecommendation` 让自动化明确识别 summary 输出应通过 `--summary --write`、`submission:next-steps:summary:write` 或 `submission:next-steps:next:summary:write` 保存/u);
  assert.match(readme, /默认 JSON 输出包含 `actionWarnings\[\]`/u);
  assert.match(readme, /`--summary` 仅在存在缺少准备动作或缺少验证命令的 blocker 时保留该字段/u);
  assert.match(readme, /Markdown 会显示 `Action warnings` 行，commands 头部会写入 `# action_warnings=\.\.\.` 注释/u);
  assert.match(readme, /该字段只做交接诊断，不改变完整 gate 完成判定、过滤视图语义或退出码/u);
  assert.match(readme, /Closure progress 字段补充：`closureProgressSummary` 按本地 evidence、公开仓 fresh clone、外部提交 evidence、pre-submission gate 四段收口顺序汇总完整 gate 和当前视图的未闭合 blocker/u);
  assert.match(readme, /Markdown 会显示 `Closure progress summary` 行和 `Closure Progress Summary` 小节，commands 头部会写入 `# closure_progress=\.\.\.` 注释/u);
  assert.match(readme, /写出的 bash 脚本会自动设置执行权限/u);
  assert.match(readme, /标明过滤视图隐藏了多少完整 gate blocker/u);
  assert.match(readme, /明确只有完整 gate 通过且 blocker 为 0 时才能标记提交完成/u);
  assert.match(readme, /标明过滤视图是否正在使用 `categoryNextSteps` 覆盖普通 `nextStep`/u);
  assert.match(readme, /`fullGateSuggestedNextCommand` 始终指向未过滤完整 gate 的最早收口组/u);
  assert.match(readme, /`suggestedNextCommand` 则保留当前过滤器，用于继续查看当前聚焦视图/u);
  assert.match(readme, /`nextClosureCommandsWriteCommand` 则把下一收口组聚焦视图直接保存为 `docs\/reports\/submission\/next-steps\.sh`/u);
  assert.match(readme, /`currentViewNextCommand` 在已聚焦视图中优先指向当前 Markdown \/ JSON \/ commands 视图的可复制命令/u);
  assert.match(readme, /`prerequisiteState` 会在聚焦视图从较晚收口组开始时列出被跳过的完整 gate 前置步骤/u);
  assert.match(readme, /JSON 输出保留原始 `nextSteps\[\]` 方便审计完整 gate，同时提供 `focusedNextSteps\[\]` 表示当前过滤范围内实际用于 `actionPlan\[\]` 的 next step/u);
  assert.match(readme, /`--summary` 输出紧凑 JSON，保留完整 blocker 数、过滤后 blocker 数、隐藏 blocker 数、完整 gate 建议命令、当前视图建议命令、当前视图 summary 写入命令、`actionSummary` \/ `nextClosureActionSummary` 聚合计数、当前 blocker 和验证入口/u);
  assert.match(readme, /`filterState\.emptyBecauseOfFilters` 会明确空结果是过滤视图造成的/u);
  assert.match(readme, /带 `--category` 时，`blockers\[\]\.nextStep`、`focusedNextSteps\[\]`、`actionPlan\[\]`、`evidenceChecklist`、`closureSequence`、`planItemBlockers` 与 `categoryBlockers\[\]` 会优先使用对应 `categoryNextSteps`/u);
  assert.match(readme, /当失败 check 带 `evidence\[\]` 时，Markdown \/ commands 输出会显示最多 5 条截断 evidence 摘要和剩余数量/u);
  assert.match(readme, /`blockerCount`、`completionSemantics\.fullGateStatus`、`prerequisiteState\.fullGateFirstOpenClosureStep`、`fullGateSuggestedNextCommand` 和退出码始终反映完整 gate 状态/u);
  assert.match(readme, /`completionSemantics\.filtersChangeCompletion=false` 明确过滤器只改变视图，不改变完成判定/u);
  assert.match(readme, /默认只打印 `TODO` 和跳过提示，不复制最终 evidence JSON，也不执行验证/u);
  assert.match(readme, /当聚焦视图跳过完整 gate 前置步骤时，commands 脚本执行时也会打印 warning、完整 gate next-step 命令和被跳过的 prerequisite 列表/u);
  assert.match(readme, /以非零退出提醒 blockers 仍未闭合/u);
  assert.match(readme, /只有显式设置 `SUBMISSION_NEXT_STEPS_PREPARE_PLACEHOLDERS=1` 时才会通过 `scaffold:submission-evidence -- --kind <kind> --copy-final` 准备缺失的占位 evidence/u);
  assert.match(readme, /只有显式设置 `SUBMISSION_NEXT_STEPS_RUN_VALIDATION=1` 时才会执行验证段/u);
  assert.match(readme, /即使聚焦视图内的验证命令都执行成功，只要完整 gate 仍是 failed，生成脚本末尾仍会非零退出/u);
  assert.match(readme, /如果过滤后没有任何 blocker 但完整 gate 仍 failed，保存后的 commands 脚本直接执行也会非零退出/u);
});

test("submission next steps exits 0 with an empty action list when all gates pass", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-pass-");
  try {
    await writeGateFixture(projectRoot, { status: "passed" });
    const result = await runNextSteps(projectRoot);

    assert.equal(result.code, 0);
    assert.equal(result.summary.mode, "submission-next-steps");
    assert.equal(result.summary.status, "passed");
    assert.equal(result.summary.blockerCount, 0);
    assert.deepEqual(result.summary.completionSemantics, expectedCompletionSemantics({
      status: "passed",
      blockerCount: 0,
      viewBlockerCount: 0,
      viewFiltered: false,
      hiddenBlockerCount: 0,
      canMarkSubmissionComplete: true,
    }));
    assert.deepEqual(result.summary.openPlanItems, []);
    assert.deepEqual(result.summary.blockers, []);
    assert.deepEqual(result.summary.nextSteps, []);
    assert.deepEqual(result.summary.actionPlan, []);
    assert.deepEqual(result.summary.evidenceChecklist, {
      evidenceFiles: [],
      manualInputs: [],
      validationCommands: [],
    });
    assert.deepEqual(result.summary.actionSummary, {
      status: "passed",
      blockerCount: 0,
      fullBlockerCount: 0,
      hiddenBlockerCount: 0,
      blockerIds: [],
      evidenceFileCount: 0,
      manualInputCount: 0,
      validationCommandCount: 0,
      blockersWithScaffold: [],
      blockersRequiringFreshClonePath: [],
      blockersWithoutPrepareAction: [],
      blockersWithoutValidationCommand: [],
      requiresManualEvidence: false,
      canValidateLocally: false,
      commandsCreateEvidenceByDefault: false,
      validationRunsByDefault: false,
    });
    assert.deepEqual(result.summary.nextClosureActionSummary, {
      status: "passed",
      blockerCount: 0,
      fullBlockerCount: 0,
      hiddenBlockerCount: 0,
      blockerIds: [],
      evidenceFileCount: 0,
      manualInputCount: 0,
      validationCommandCount: 0,
      blockersWithScaffold: [],
      blockersRequiringFreshClonePath: [],
      blockersWithoutPrepareAction: [],
      blockersWithoutValidationCommand: [],
      requiresManualEvidence: false,
      canValidateLocally: false,
      commandsCreateEvidenceByDefault: false,
      validationRunsByDefault: false,
    });
    assert.deepEqual(result.summary.actionWarnings, []);
    assert.deepEqual(result.summary.closureSequence, []);
    assert.deepEqual(result.summary.closureProgressSummary, {
      fullOpenCount: 0,
      viewOpenCount: 0,
      steps: [
        {
          id: "local-evidence",
          order: 1,
          label: "Fill local evidence JSONs",
          fullOpenBlockers: [],
          viewOpenBlockers: [],
          fullOpenCount: 0,
          viewOpenCount: 0,
          firstFullOpen: false,
          firstViewOpen: false,
          status: "closed",
          viewStatus: "closed-or-filtered",
        },
        {
          id: "public-repo",
          order: 2,
          label: "Publish and fresh-clone the public AI system repository",
          fullOpenBlockers: [],
          viewOpenBlockers: [],
          fullOpenCount: 0,
          viewOpenCount: 0,
          firstFullOpen: false,
          firstViewOpen: false,
          status: "closed",
          viewStatus: "closed-or-filtered",
        },
        {
          id: "external-submission",
          order: 3,
          label: "Fill external submission evidence",
          fullOpenBlockers: [],
          viewOpenBlockers: [],
          fullOpenCount: 0,
          viewOpenCount: 0,
          firstFullOpen: false,
          firstViewOpen: false,
          status: "closed",
          viewStatus: "closed-or-filtered",
        },
        {
          id: "pre-submission",
          order: 4,
          label: "Run the release-day pre-submission gate",
          fullOpenBlockers: [],
          viewOpenBlockers: [],
          fullOpenCount: 0,
          viewOpenCount: 0,
          firstFullOpen: false,
          firstViewOpen: false,
          status: "closed",
          viewStatus: "closed-or-filtered",
        },
      ],
    });
    assert.deepEqual(result.summary.categoryCounts, {});
    assert.deepEqual(result.summary.categoryBlockers, []);
    assert.match(result.summary.note, /Read-only summary/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps accepts equivalent projectRoot with trailing separator", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-root-normalize-");
  try {
    await writeGateFixture(projectRoot, { status: "passed", projectRootOverride: `${projectRoot}${path.sep}` });
    const result = await runNextSteps(projectRoot, [], { useProjectRootEnv: false });

    assert.equal(result.code, 0);
    assert.equal(result.summary.mode, "submission-next-steps");
    assert.equal(result.summary.status, "passed");
    assert.equal(result.summary.projectRoot, `${projectRoot}${path.sep}`);
    assert.deepEqual(result.summary.blockers, []);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps condenses blockers and preserves actionable validation commands", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-fail-");
  try {
    await writeGateFixture(projectRoot, { status: "failed" });
    const result = await runNextSteps(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.sourceMode, "submission-gates-check");
    assert.deepEqual(result.summary.gateCounts, { total: 2, passed: 1, failed: 1 });
    assert.deepEqual(result.summary.delegatedCheckCounts, { total: 3, passed: 1, failed: 2 });
    assert.equal(result.summary.blockerCount, 2);
    assert.deepEqual(result.summary.filterState, {
      filtersActive: false,
      nextOnly: false,
      exactFilter: {},
      baseFilteredBlockerCount: 2,
      filteredBlockerCount: 2,
      hiddenBlockerCount: 0,
      hasUnknownFilters: false,
      emptyBecauseOfFilters: false,
      note: "Unfiltered view shows all blockers.",
    });
    assert.deepEqual(result.summary.completionSemantics, expectedCompletionSemantics({
      status: "failed",
      blockerCount: 2,
      viewBlockerCount: 2,
      viewFiltered: false,
      hiddenBlockerCount: 0,
      canMarkSubmissionComplete: false,
    }));
    assert.equal(result.summary.currentViewCommandsWriteCommand, "npm run submission:next-steps -- --commands --write docs/reports/submission/next-steps.sh");
    assert.equal(result.summary.nextClosureCommandsWriteCommand, "npm run submission:next-steps -- --next --commands --write docs/reports/submission/next-steps.sh");
    assert.deepEqual(result.summary.openPlanItems, ["S7", "S8"]);
    assert.deepEqual(result.summary.firstOpenClosureStep, {
      id: "local-evidence",
      order: 1,
      label: "Fill local evidence JSONs",
      rationale: "Close rehearsal, video, and defense evidence before publishing or final submission checks.",
    });
    assert.deepEqual(result.summary.fullGateFirstOpenClosureStep, result.summary.firstOpenClosureStep);
    assert.deepEqual(result.summary.prerequisiteState, {
      filtersActive: false,
      fullGateFirstOpenClosureStep: result.summary.firstOpenClosureStep,
      viewFirstOpenClosureStep: result.summary.firstOpenClosureStep,
      viewStartsAfterFullGate: false,
      skippedClosureSteps: [],
      skippedClosureStepCount: 0,
      note: "This view does not skip earlier full-gate closure steps.",
    });
    assert.equal(result.summary.fullGateSuggestedNextCommand, "npm run submission:next-steps -- --next");
    assert.equal(result.summary.suggestedNextCommand, "npm run submission:next-steps -- --next");
    assert.equal(result.summary.currentViewNextCommand, "npm run submission:next-steps -- --next");
    assert.equal(result.summary.nextClosureStep, undefined);
    assert.deepEqual(result.summary.categoryCounts, {
      "video-evidence": { total: 1, failed: 1 },
      "public-repo": { total: 1, failed: 1 },
    });
    assert.deepEqual(result.summary.safety, {
      createsEvidenceByDefault: false,
      validatesByDefault: false,
      defaultBlockedExitCode: 1,
      placeholderOptInEnv: "SUBMISSION_NEXT_STEPS_PREPARE_PLACEHOLDERS=1",
      validationOptInEnv: "SUBMISSION_NEXT_STEPS_RUN_VALIDATION=1",
      note: "Generated commands print TODOs by default; they do not create final evidence or run validation unless explicitly opted in.",
    });
    assert.deepEqual(result.summary.scriptWriteRecommendation, {
      preferWriteFlag: true,
      commandsWriteFlag: "--commands --write docs/reports/submission/next-steps.sh",
      commandsWriteScript: "npm run submission:next-steps:commands:write",
      nextCommandsWriteScript: "npm run submission:next-steps:next:commands:write",
      avoidShellRedirection: true,
      reason: "Use --write or the package shortcuts for commands output so npm banners are not redirected into executable bash scripts.",
    });
    assert.deepEqual(result.summary.availableFilters, {
      blockers: ["public-repo", "video"],
      categories: [
        {
          name: "public-repo",
          blockerCount: 1,
          failed: 1,
          total: 1,
          blockers: ["public-repo"],
        },
        {
          name: "video-evidence",
          blockerCount: 1,
          failed: 1,
          total: 1,
          blockers: ["video"],
        },
      ],
      planItems: [
        {
          name: "S7",
          blockerCount: 1,
          blockers: ["video"],
        },
        {
          name: "S8",
          blockerCount: 1,
          blockers: ["public-repo"],
        },
      ],
    });
    assert.deepEqual(result.summary.categoryBlockers, [
      {
        name: "public-repo",
        total: 1,
        failed: 1,
        blockers: [
          {
            id: "public-repo",
            label: "S8 public repository fresh clone",
            detail: "requires --public-repo <fresh-clone-path>",
            planItems: ["S8"],
            requiredEvidence: "Fresh clone path for the published AI system repository.",
            provide: "--public-repo <fresh-clone-path> or PUBLIC_REPO_CLONE_PATH",
            validateCommand: "npm run check:public-repo -- --repo <fresh-clone-path>",
            validationSafety: expectedValidationSafety(true),
          },
        ],
      },
      {
        name: "video-evidence",
        total: 1,
        failed: 1,
        blockers: [
          {
            id: "video",
            label: "local S7 video evidence",
            detail: "video-evidence.json is missing",
            planItems: ["S7"],
            requiredEvidence: "Real local video evidence.",
            copyFrom: "docs/reports/submission/video-evidence.template.json",
            writeTo: "docs/reports/submission/video-evidence.json",
            validateCommand: "npm run check:video-evidence -- --file docs/reports/submission/video-evidence.json",
            validationSafety: expectedValidationSafety(false),
          },
        ],
      },
    ]);
    assert.deepEqual(result.summary.planItemBlockers, [
      {
        planItem: "S7",
        blockers: [
          {
            id: "video",
            label: "local S7 video evidence",
            detail: "video-evidence.json is missing",
            validateCommand: "npm run check:video-evidence -- --file docs/reports/submission/video-evidence.json",
            validationSafety: expectedValidationSafety(false),
          },
        ],
      },
      {
        planItem: "S8",
        blockers: [
          {
            id: "public-repo",
            label: "S8 public repository fresh clone",
            detail: "requires --public-repo <fresh-clone-path>",
            validateCommand: "npm run check:public-repo -- --repo <fresh-clone-path>",
            validationSafety: expectedValidationSafety(true),
          },
        ],
      },
    ]);
    assert.deepEqual(result.summary.blockers, [
      {
        id: "video",
        label: "local S7 video evidence",
        planItems: ["S7"],
        detail: "video-evidence.json is missing",
        categories: { "video-evidence": { total: 1, failed: 1 } },
        failedChecks: [{ name: "video", detail: "video-evidence.json is missing" }],
        requiredEvidence: "Real local video evidence.",
        nextStep: {
          copyFrom: "docs/reports/submission/video-evidence.template.json",
          writeTo: "docs/reports/submission/video-evidence.json",
          validateWith: "npm run check:video-evidence -- --file docs/reports/submission/video-evidence.json",
        },
      },
      {
        id: "public-repo",
        label: "S8 public repository fresh clone",
        planItems: ["S8"],
        detail: "requires --public-repo <fresh-clone-path>",
        categories: { "public-repo": { total: 1, failed: 1 } },
        requiredEvidence: "Fresh clone path for the published AI system repository.",
        nextStep: {
          provide: "--public-repo <fresh-clone-path> or PUBLIC_REPO_CLONE_PATH",
          validateWith: "npm run check:public-repo -- --repo <fresh-clone-path>",
        },
      },
    ]);
    assert.deepEqual(result.summary.nextSteps.map((step) => step.id), ["video", "public-repo"]);
    assert.deepEqual(result.summary.focusedNextSteps, result.summary.nextSteps);
    assert.deepEqual(result.summary.actionPlan, [
      {
        id: "video",
        label: "local S7 video evidence",
        copyCommand: "npm run scaffold:submission-evidence -- --kind video-evidence --copy-final",
        copySafety: {
          createsFinalEvidence: true,
          optInRequired: true,
          optInEnv: "SUBMISSION_NEXT_STEPS_PREPARE_PLACEHOLDERS=1",
          preferredCommand: "npm run scaffold:submission-evidence -- --kind video-evidence --copy-final",
        },
        copyFinalCommand: "npm run scaffold:submission-evidence -- --kind video-evidence --copy-final",
        editTarget: "docs/reports/submission/video-evidence.json",
        validateCommand: "npm run check:video-evidence -- --file docs/reports/submission/video-evidence.json",
        validationSafety: {
          optInRequired: true,
          optInEnv: "SUBMISSION_NEXT_STEPS_RUN_VALIDATION=1",
          mayRequireFreshClonePath: false,
        },
      },
      {
        id: "public-repo",
        label: "S8 public repository fresh clone",
        manualInput: "--public-repo <fresh-clone-path> or PUBLIC_REPO_CLONE_PATH",
        validateCommand: "npm run check:public-repo -- --repo <fresh-clone-path>",
        validationSafety: {
          optInRequired: true,
          optInEnv: "SUBMISSION_NEXT_STEPS_RUN_VALIDATION=1",
          mayRequireFreshClonePath: true,
        },
      },
    ]);
    assert.deepEqual(result.summary.actionSummary, {
      status: "failed",
      blockerCount: 2,
      fullBlockerCount: 2,
      hiddenBlockerCount: 0,
      blockerIds: ["video", "public-repo"],
      evidenceFileCount: 1,
      manualInputCount: 1,
      validationCommandCount: 2,
      blockersWithScaffold: ["video"],
      blockersRequiringFreshClonePath: ["public-repo"],
      blockersWithoutPrepareAction: [],
      blockersWithoutValidationCommand: [],
      requiresManualEvidence: true,
      canValidateLocally: true,
      commandsCreateEvidenceByDefault: false,
      validationRunsByDefault: false,
    });
    assert.deepEqual(result.summary.nextClosureActionSummary, {
      status: "failed",
      blockerCount: 1,
      fullBlockerCount: 2,
      hiddenBlockerCount: 1,
      blockerIds: ["video"],
      evidenceFileCount: 1,
      manualInputCount: 0,
      validationCommandCount: 1,
      blockersWithScaffold: ["video"],
      blockersRequiringFreshClonePath: [],
      blockersWithoutPrepareAction: [],
      blockersWithoutValidationCommand: [],
      requiresManualEvidence: true,
      canValidateLocally: true,
      commandsCreateEvidenceByDefault: false,
      validationRunsByDefault: false,
    });
    assert.deepEqual(result.summary.evidenceChecklist, {
      evidenceFiles: [
        {
          id: "video",
          label: "local S7 video evidence",
          path: "docs/reports/submission/video-evidence.json",
          template: "docs/reports/submission/video-evidence.template.json",
          scaffoldKind: "video-evidence",
          scaffoldCommand: "npm run scaffold:submission-evidence -- --kind video-evidence --commands",
          copyFinalCommand: "npm run scaffold:submission-evidence -- --kind video-evidence --copy-final",
          copySafety: {
            createsFinalEvidence: true,
            optInRequired: true,
            optInEnv: "SUBMISSION_NEXT_STEPS_PREPARE_PLACEHOLDERS=1",
          },
          requiredEvidence: "Real local video evidence.",
          validateCommand: "npm run check:video-evidence -- --file docs/reports/submission/video-evidence.json",
          validationSafety: {
            optInRequired: true,
            optInEnv: "SUBMISSION_NEXT_STEPS_RUN_VALIDATION=1",
            mayRequireFreshClonePath: false,
          },
        },
      ],
      manualInputs: [
        {
          id: "public-repo",
          label: "S8 public repository fresh clone",
          input: "--public-repo <fresh-clone-path> or PUBLIC_REPO_CLONE_PATH",
          requiredEvidence: "Fresh clone path for the published AI system repository.",
          validateCommand: "npm run check:public-repo -- --repo <fresh-clone-path>",
          validationSafety: {
            optInRequired: true,
            optInEnv: "SUBMISSION_NEXT_STEPS_RUN_VALIDATION=1",
            mayRequireFreshClonePath: true,
          },
        },
      ],
      validationCommands: [
        {
          id: "video",
          label: "local S7 video evidence",
          command: "npm run check:video-evidence -- --file docs/reports/submission/video-evidence.json",
          safety: {
            optInRequired: true,
            optInEnv: "SUBMISSION_NEXT_STEPS_RUN_VALIDATION=1",
            mayRequireFreshClonePath: false,
          },
        },
        {
          id: "public-repo",
          label: "S8 public repository fresh clone",
          command: "npm run check:public-repo -- --repo <fresh-clone-path>",
          safety: {
            optInRequired: true,
            optInEnv: "SUBMISSION_NEXT_STEPS_RUN_VALIDATION=1",
            mayRequireFreshClonePath: true,
          },
        },
      ],
    });
    assert.deepEqual(result.summary.closureSequence, [
      {
        id: "local-evidence",
        order: 1,
        label: "Fill local evidence JSONs",
        rationale: "Close rehearsal, video, and defense evidence before publishing or final submission checks.",
        blockers: [
          {
            id: "video",
            label: "local S7 video evidence",
            planItems: ["S7"],
            validateCommand: "npm run check:video-evidence -- --file docs/reports/submission/video-evidence.json",
            validationSafety: expectedValidationSafety(false),
          },
        ],
      },
      {
        id: "public-repo",
        order: 2,
        label: "Publish and fresh-clone the public AI system repository",
        rationale: "External evidence and final checks must point at a real fresh clone path.",
        blockers: [
          {
            id: "public-repo",
            label: "S8 public repository fresh clone",
            planItems: ["S8"],
            validateCommand: "npm run check:public-repo -- --repo <fresh-clone-path>",
            validationSafety: expectedValidationSafety(true),
          },
        ],
      },
    ]);
    assert.deepEqual(result.summary.checks, [
      {
        name: "video",
        status: "failed",
        detail: "video-evidence.json is missing",
      },
      {
        name: "public-repo",
        status: "failed",
        detail: "requires --public-repo <fresh-clone-path>",
      },
    ]);
    assert.deepEqual(result.summary.checkCounts, { total: 2, passed: 0, failed: 2 });
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps applies consistent validation safety across derived views", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-validation-safety-");
  try {
    await writeGateFixture(projectRoot, { status: "failed" });
    const result = await runNextSteps(projectRoot);

    assert.equal(result.code, 1);
    assert.deepEqual(validationSafetyById(result.summary.actionPlan, "validationSafety"), {
      video: expectedValidationSafety(false),
      "public-repo": expectedValidationSafety(true),
    });
    assert.deepEqual(validationSafetyById(result.summary.evidenceChecklist.evidenceFiles, "validationSafety"), {
      video: expectedValidationSafety(false),
    });
    assert.deepEqual(validationSafetyById(result.summary.evidenceChecklist.manualInputs, "validationSafety"), {
      "public-repo": expectedValidationSafety(true),
    });
    assert.deepEqual(validationSafetyById(result.summary.evidenceChecklist.validationCommands, "safety"), {
      video: expectedValidationSafety(false),
      "public-repo": expectedValidationSafety(true),
    });
    assert.deepEqual(validationSafetyByNestedBlockerId(result.summary.closureSequence), {
      video: expectedValidationSafety(false),
      "public-repo": expectedValidationSafety(true),
    });
    assert.deepEqual(validationSafetyByNestedBlockerId(result.summary.planItemBlockers), {
      video: expectedValidationSafety(false),
      "public-repo": expectedValidationSafety(true),
    });
    assert.deepEqual(validationSafetyByNestedBlockerId(result.summary.categoryBlockers), {
      "public-repo": expectedValidationSafety(true),
      video: expectedValidationSafety(false),
    });
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps forwards supported gate arguments", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-args-");
  try {
    await writeGateFixture(projectRoot, { status: "passed", captureArgs: true });
    const result = await runNextSteps(projectRoot, [
      "--json",
      "--public-repo",
      "/tmp/fresh-clone",
      "--u6-manifest",
      "docs/reports/submission/custom-u6.json",
    ]);

    assert.equal(result.code, 0);
    assert.deepEqual(result.summary.blockers, []);
    assert.deepEqual(result.summary.forwardedGateArgs, [
      { name: "--public-repo", value: "/tmp/fresh-clone" },
      { name: "--u6-manifest", value: "docs/reports/submission/custom-u6.json" },
    ]);
    assert.equal(result.summary.fullGateSuggestedNextCommand, undefined);
    assert.equal(result.summary.suggestedNextCommand, undefined);
    assert.equal(result.summary.currentViewNextCommand, undefined);
    assert.equal(result.summary.nextClosureCommandsWriteCommand, undefined);
    assert.equal(result.summary.nextClosureSummaryWriteCommand, undefined);
    assert.equal(result.summary.currentViewCommandsWriteCommand, "npm run submission:next-steps -- --public-repo /tmp/fresh-clone --u6-manifest docs/reports/submission/custom-u6.json --commands --write docs/reports/submission/next-steps.sh");
    assert.equal(result.summary.currentViewSummaryWriteCommand, "npm run submission:next-steps -- --public-repo /tmp/fresh-clone --u6-manifest docs/reports/submission/custom-u6.json --summary --write docs/reports/submission/next-steps-summary.json");
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps orders focused human actions by closure sequence", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-closure-order-");
  try {
    await writeGateFixture(projectRoot, { status: "failed", withFullClosureBlockers: true });
    const result = await runNextSteps(projectRoot);

    assert.equal(result.code, 1);
    assert.deepEqual(result.summary.nextSteps.map((step) => step.id), [
      "external",
      "pre-submission",
      "video",
      "public-repo",
      "defense",
      "u6",
    ]);
    assert.deepEqual(result.summary.blockers.map((blocker) => blocker.id), [
      "u6",
      "video",
      "defense",
      "public-repo",
      "external",
      "pre-submission",
    ]);
    assert.deepEqual(result.summary.actionPlan.map((action) => action.id), [
      "u6",
      "video",
      "defense",
      "public-repo",
      "external",
      "pre-submission",
    ]);
    assert.deepEqual(result.summary.evidenceChecklist.evidenceFiles.map((item) => item.id), [
      "u6",
      "video",
      "defense",
      "external",
    ]);
    assert.deepEqual(result.summary.evidenceChecklist.manualInputs.map((item) => item.id), [
      "public-repo",
      "pre-submission",
    ]);
    assert.deepEqual(result.summary.checks.map((check) => check.name), [
      "u6",
      "video",
      "defense",
      "public-repo",
      "external",
      "pre-submission",
    ]);
    assert.deepEqual(result.summary.closureSequence.map((step) => ({
      id: step.id,
      blockers: step.blockers.map((blocker) => blocker.id),
    })), [
      { id: "local-evidence", blockers: ["u6", "video", "defense"] },
      { id: "public-repo", blockers: ["public-repo"] },
      { id: "external-submission", blockers: ["external"] },
      { id: "pre-submission", blockers: ["pre-submission"] },
    ]);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps can focus output on the next closure group", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-next-");
  try {
    await writeGateFixture(projectRoot, { status: "failed", withFullClosureBlockers: true });
    const result = await runNextSteps(projectRoot, ["--next"]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.blockerCount, 6);
    assert.equal(result.summary.filteredBlockerCount, 3);
    assert.equal(result.summary.nextOnly, true);
    assert.deepEqual(result.summary.nextClosureStep, {
      id: "local-evidence",
      order: 1,
      label: "Fill local evidence JSONs",
      rationale: "Close rehearsal, video, and defense evidence before publishing or final submission checks.",
    });
    assert.deepEqual(result.summary.firstOpenClosureStep, result.summary.nextClosureStep);
    assert.equal(result.summary.fullGateSuggestedNextCommand, "npm run submission:next-steps -- --next");
    assert.equal(result.summary.suggestedNextCommand, "npm run submission:next-steps -- --next");
    assert.equal(result.summary.nextClosureCommandsWriteCommand, "npm run submission:next-steps -- --next --commands --write docs/reports/submission/next-steps.sh");
    assert.equal(result.summary.currentViewNextCommand, "npm run submission:next-steps -- --next");
    assert.deepEqual(result.summary.blockers.map((blocker) => blocker.id), ["u6", "video", "defense"]);
    assert.deepEqual(result.summary.actionPlan.map((action) => action.id), ["u6", "video", "defense"]);
    assert.deepEqual(result.summary.evidenceChecklist.evidenceFiles.map((item) => item.id), ["u6", "video", "defense"]);
    assert.deepEqual(result.summary.evidenceChecklist.manualInputs, []);
    assert.deepEqual(result.summary.planItemBlockers.map((item) => item.planItem), ["U6", "S7", "S10"]);
    assert.deepEqual(result.summary.planItemBlockers.map((item) => item.blockers.map((blocker) => blocker.id)), [
      ["u6"],
      ["video"],
      ["defense"],
    ]);
    assert.deepEqual(result.summary.closureSequence.map((step) => ({
      id: step.id,
      blockers: step.blockers.map((blocker) => blocker.id),
    })), [
      { id: "local-evidence", blockers: ["u6", "video", "defense"] },
    ]);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps combines next focus with explicit filters", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-next-category-");
  try {
    await writeGateFixture(projectRoot, { status: "failed", withFullClosureBlockers: true });
    const result = await runNextSteps(projectRoot, ["--next", "--category", "public-repo"]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.blockerCount, 6);
    assert.equal(result.summary.filteredBlockerCount, 1);
    assert.equal(result.summary.nextOnly, true);
    assert.deepEqual(result.summary.nextClosureStep, {
      id: "public-repo",
      order: 2,
      label: "Publish and fresh-clone the public AI system repository",
      rationale: "External evidence and final checks must point at a real fresh clone path.",
    });
    assert.deepEqual(result.summary.blockers.map((blocker) => blocker.id), ["public-repo"]);
    assert.deepEqual(result.summary.actionPlan.map((action) => action.id), ["public-repo"]);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps can focus output on one blocker category without changing gate status", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-category-");
  try {
    await writeGateFixture(projectRoot, { status: "failed" });
    const result = await runNextSteps(projectRoot, ["--category", "public-repo"]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.blockerCount, 2);
    assert.equal(result.summary.filteredBlockerCount, 1);
    assert.equal(result.summary.categoryFilter, "public-repo");
    assert.deepEqual(result.summary.categoryCounts, {
      "video-evidence": { total: 1, failed: 1 },
      "public-repo": { total: 1, failed: 1 },
    });
    assert.deepEqual(result.summary.availableFilters.categories.map((category) => category.name), ["public-repo", "video-evidence"]);
    assert.deepEqual(result.summary.availableFilters.planItems.map((planItem) => planItem.name), ["S7", "S8"]);
    assert.deepEqual(result.summary.blockers.map((blocker) => blocker.id), ["public-repo"]);
    assert.deepEqual(result.summary.actionPlan.map((action) => action.id), ["public-repo"]);
    assert.deepEqual(result.summary.planItemBlockers, [
      {
        planItem: "S8",
        blockers: [
          {
            id: "public-repo",
            label: "S8 public repository fresh clone",
            detail: "requires --public-repo <fresh-clone-path>",
            validateCommand: "npm run check:public-repo -- --repo <fresh-clone-path>",
            validationSafety: expectedValidationSafety(true),
          },
        ],
      },
    ]);
    assert.deepEqual(result.summary.categoryBlockers, [
      {
        name: "public-repo",
        total: 1,
        failed: 1,
        blockers: [
          {
            id: "public-repo",
            label: "S8 public repository fresh clone",
            detail: "requires --public-repo <fresh-clone-path>",
            planItems: ["S8"],
            requiredEvidence: "Fresh clone path for the published AI system repository.",
            provide: "--public-repo <fresh-clone-path> or PUBLIC_REPO_CLONE_PATH",
            validateCommand: "npm run check:public-repo -- --repo <fresh-clone-path>",
            validationSafety: expectedValidationSafety(true),
          },
        ],
      },
    ]);
    assert.deepEqual(result.summary.checks, [
      {
        name: "public-repo",
        status: "failed",
        detail: "requires --public-repo <fresh-clone-path>",
      },
    ]);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps can focus verify category from pre-submission", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-category-verify-");
  try {
    await writeGateFixture(projectRoot, { status: "failed", withVerifyBlocker: true });
    const result = await runNextSteps(projectRoot, ["--category", "verify"]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.categoryFilter, "verify");
    assert.deepEqual(result.summary.blockers.map((blocker) => blocker.id), ["pre-submission"]);
    assert.deepEqual(result.summary.focusedNextSteps, [
      {
        id: "pre-submission",
        label: "S9 release-day pre-submission gate",
        validateWith: "npm run verify",
      },
    ]);
    assert.deepEqual(result.summary.actionPlan, [
      {
        id: "pre-submission",
        label: "S9 release-day pre-submission gate",
        validateCommand: "npm run verify",
        validationSafety: expectedValidationSafety(false),
      },
    ]);
    assert.deepEqual(result.summary.categoryBlockers, [
      {
        name: "verify",
        failed: 1,
        total: 1,
        blockers: [
          {
            id: "pre-submission",
            label: "S9 release-day pre-submission gate",
            planItems: ["S9", "S10"],
            detail: "npm run verify failed",
            requiredEvidence: "Release-day pre-submission check with PUBLIC_REPO_CLONE_PATH and all external evidence completed.",
            validateCommand: "npm run verify",
            validationSafety: expectedValidationSafety(false),
          },
        ],
      },
    ]);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps can focus output on one blocker id without changing gate status", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-blocker-");
  try {
    await writeGateFixture(projectRoot, { status: "failed" });
    const result = await runNextSteps(projectRoot, ["--blocker", "video"]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.blockerCount, 2);
    assert.equal(result.summary.filteredBlockerCount, 1);
    assert.equal(result.summary.blockerFilter, "video");
    assert.deepEqual(result.summary.blockers.map((blocker) => blocker.id), ["video"]);
    assert.deepEqual(result.summary.actionPlan.map((action) => action.id), ["video"]);
    assert.deepEqual(result.summary.evidenceChecklist.evidenceFiles.map((item) => item.id), ["video"]);
    assert.deepEqual(result.summary.evidenceChecklist.evidenceFiles.map((item) => item.scaffoldKind), ["video-evidence"]);
    assert.deepEqual(result.summary.evidenceChecklist.manualInputs, []);
    assert.deepEqual(result.summary.categoryBlockers.map((category) => category.name), ["video-evidence"]);
    assert.deepEqual(result.summary.closureSequence.map((step) => step.id), ["local-evidence"]);
    assert.deepEqual(result.summary.planItemBlockers, [
      {
        planItem: "S7",
        blockers: [
          {
            id: "video",
            label: "local S7 video evidence",
            detail: "video-evidence.json is missing",
            validateCommand: "npm run check:video-evidence -- --file docs/reports/submission/video-evidence.json",
            validationSafety: expectedValidationSafety(false),
          },
        ],
      },
    ]);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps focuses failed checks when a blocker carries several categories", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-category-checks-");
  try {
    await writeGateFixture(projectRoot, { status: "failed", withMultiCategoryBlocker: true });
    const result = await runNextSteps(projectRoot, ["--category", "public-repo"]);

    assert.equal(result.code, 1);
    assert.deepEqual(result.summary.blockers.map((blocker) => blocker.id), ["public-repo", "pre-submission"]);
    assert.deepEqual(result.summary.blockers[1].categories, {
      "public-repo": { total: 1, failed: 1 },
    });
    assert.deepEqual(result.summary.blockers[1].failedChecks, [
      {
        name: "public-repo",
        detail: "public repository fresh clone path is missing",
      },
    ]);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps can focus output on one plan item without changing gate status", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-plan-item-");
  try {
    await writeGateFixture(projectRoot, { status: "failed" });
    const result = await runNextSteps(projectRoot, ["--plan-item", "S7"]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.blockerCount, 2);
    assert.equal(result.summary.filteredBlockerCount, 1);
    assert.equal(result.summary.planItemFilter, "S7");
    assert.deepEqual(result.summary.blockers.map((blocker) => blocker.id), ["video"]);
    assert.deepEqual(result.summary.actionPlan.map((action) => action.id), ["video"]);
    assert.deepEqual(result.summary.planItemBlockers, [
      {
        planItem: "S7",
        blockers: [
          {
            id: "video",
            label: "local S7 video evidence",
            detail: "video-evidence.json is missing",
            validateCommand: "npm run check:video-evidence -- --file docs/reports/submission/video-evidence.json",
            validationSafety: expectedValidationSafety(false),
          },
        ],
      },
    ]);
    assert.deepEqual(result.summary.categoryBlockers, [
      {
        name: "video-evidence",
        total: 1,
        failed: 1,
        blockers: [
          {
            id: "video",
            label: "local S7 video evidence",
            detail: "video-evidence.json is missing",
            planItems: ["S7"],
            requiredEvidence: "Real local video evidence.",
            copyFrom: "docs/reports/submission/video-evidence.template.json",
            writeTo: "docs/reports/submission/video-evidence.json",
            validateCommand: "npm run check:video-evidence -- --file docs/reports/submission/video-evidence.json",
            validationSafety: expectedValidationSafety(false),
          },
        ],
      },
    ]);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps can combine category and plan item filters", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-combined-filter-");
  try {
    await writeGateFixture(projectRoot, { status: "failed", withMultiCategoryBlocker: true });
    const result = await runNextSteps(projectRoot, ["--category", "public-repo", "--plan-item", "S9"]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.blockerCount, 3);
    assert.equal(result.summary.filteredBlockerCount, 1);
    assert.equal(result.summary.categoryFilter, "public-repo");
    assert.equal(result.summary.planItemFilter, "S9");
    assert.deepEqual(result.summary.filterState, {
      filtersActive: true,
      nextOnly: false,
      exactFilter: {
        category: "public-repo",
        planItem: "S9",
      },
      baseFilteredBlockerCount: 1,
      filteredBlockerCount: 1,
      hiddenBlockerCount: 2,
      hasUnknownFilters: false,
      emptyBecauseOfFilters: false,
      note: "Filtered view shows 1 of 3 blockers; full gate status is unchanged.",
    });
    assert.deepEqual(result.summary.completionSemantics, expectedCompletionSemantics({
      status: "failed",
      blockerCount: 3,
      viewBlockerCount: 1,
      viewFiltered: true,
      hiddenBlockerCount: 2,
      canMarkSubmissionComplete: false,
    }));
    assert.deepEqual(result.summary.fullGateFirstOpenClosureStep, {
      id: "local-evidence",
      order: 1,
      label: "Fill local evidence JSONs",
      rationale: "Close rehearsal, video, and defense evidence before publishing or final submission checks.",
    });
    assert.deepEqual(result.summary.firstOpenClosureStep, {
      id: "pre-submission",
      order: 4,
      label: "Run the release-day pre-submission gate",
      rationale: "Run this only after every human and external evidence item is real.",
    });
    assert.deepEqual(result.summary.prerequisiteState, {
      filtersActive: true,
      fullGateFirstOpenClosureStep: {
        id: "local-evidence",
        order: 1,
        label: "Fill local evidence JSONs",
        rationale: "Close rehearsal, video, and defense evidence before publishing or final submission checks.",
      },
      viewFirstOpenClosureStep: {
        id: "pre-submission",
        order: 4,
        label: "Run the release-day pre-submission gate",
        rationale: "Run this only after every human and external evidence item is real.",
      },
      viewStartsAfterFullGate: true,
      skippedClosureSteps: [
        {
          id: "local-evidence",
          order: 1,
          label: "Fill local evidence JSONs",
          rationale: "Close rehearsal, video, and defense evidence before publishing or final submission checks.",
          blockers: ["video"],
        },
        {
          id: "public-repo",
          order: 2,
          label: "Publish and fresh-clone the public AI system repository",
          rationale: "External evidence and final checks must point at a real fresh clone path.",
          blockers: ["public-repo"],
        },
      ],
      skippedClosureStepCount: 2,
      note: "This filtered view starts after earlier full-gate closure steps; complete skipped prerequisites before treating this view as a release-day path.",
    });
    assert.equal(result.summary.fullGateSuggestedNextCommand, "npm run submission:next-steps -- --next");
    assert.equal(result.summary.suggestedNextCommand, "npm run submission:next-steps -- --next --category public-repo --plan-item S9");
    assert.equal(result.summary.nextClosureCommandsWriteCommand, "npm run submission:next-steps -- --next --category public-repo --plan-item S9 --commands --write docs/reports/submission/next-steps.sh");
    assert.equal(result.summary.nextClosureSummaryWriteCommand, "npm run submission:next-steps -- --next --category public-repo --plan-item S9 --summary --write docs/reports/submission/next-steps-summary.json");
    assert.equal(result.summary.currentViewNextCommand, "npm run submission:next-steps -- --next --category public-repo --plan-item S9");
    assert.equal(result.summary.currentViewCommandsWriteCommand, "npm run submission:next-steps -- --category public-repo --plan-item S9 --commands --write docs/reports/submission/next-steps.sh");
    assert.equal(result.summary.currentViewSummaryWriteCommand, "npm run submission:next-steps -- --category public-repo --plan-item S9 --summary --write docs/reports/submission/next-steps-summary.json");
    assert.deepEqual(result.summary.nextStepFocus, {
      mode: "category",
      category: "public-repo",
      usesCategoryNextSteps: true,
      focusedBlockers: ["pre-submission"],
      fallbackBlockers: [],
      note: "Category-specific nextStep overrides are applied to focused derived views.",
    });
    assert.deepEqual(result.summary.nextSteps.find((step) => step.id === "pre-submission"), undefined);
    assert.deepEqual(result.summary.focusedNextSteps, [
      {
        id: "pre-submission",
        label: "S9 release-day pre-submission gate",
        provide: "--public-repo <fresh-clone-path> or PUBLIC_REPO_CLONE_PATH",
        validateWith: "npm run check:public-repo -- --repo <fresh-clone-path>",
      },
    ]);
    assert.deepEqual(result.summary.blockers, [
      {
        id: "pre-submission",
        label: "S9 release-day pre-submission gate",
        planItems: ["S9", "S10"],
        detail: "git-tracking and public-repo failures",
        categories: { "public-repo": { total: 1, failed: 1 } },
        failedChecks: [
          {
            name: "public-repo",
            detail: "public repository fresh clone path is missing",
          },
        ],
        requiredEvidence: "Release-day pre-submission check with PUBLIC_REPO_CLONE_PATH and all external evidence completed.",
        nextStep: {
          provide: "--public-repo <fresh-clone-path> or PUBLIC_REPO_CLONE_PATH",
          validateWith: "npm run check:public-repo -- --repo <fresh-clone-path>",
        },
      },
    ]);
    assert.deepEqual(result.summary.actionPlan, [
      {
        id: "pre-submission",
        label: "S9 release-day pre-submission gate",
        manualInput: "--public-repo <fresh-clone-path> or PUBLIC_REPO_CLONE_PATH",
        validateCommand: "npm run check:public-repo -- --repo <fresh-clone-path>",
        validationSafety: expectedValidationSafety(true),
      },
    ]);
    assert.deepEqual(result.summary.evidenceChecklist.manualInputs, [
      {
        id: "pre-submission",
        label: "S9 release-day pre-submission gate",
        input: "--public-repo <fresh-clone-path> or PUBLIC_REPO_CLONE_PATH",
        requiredEvidence: "Release-day pre-submission check with PUBLIC_REPO_CLONE_PATH and all external evidence completed.",
        validateCommand: "npm run check:public-repo -- --repo <fresh-clone-path>",
        validationSafety: expectedValidationSafety(true),
      },
    ]);
    assert.deepEqual(result.summary.evidenceChecklist.validationCommands, [
      {
        id: "pre-submission",
        label: "S9 release-day pre-submission gate",
        command: "npm run check:public-repo -- --repo <fresh-clone-path>",
        safety: expectedValidationSafety(true),
      },
    ]);
    assert.deepEqual(result.summary.planItemBlockers, [
      {
        planItem: "S9",
        blockers: [
          {
            id: "pre-submission",
            label: "S9 release-day pre-submission gate",
            detail: "git-tracking and public-repo failures",
            validateCommand: "npm run check:public-repo -- --repo <fresh-clone-path>",
            validationSafety: expectedValidationSafety(true),
          },
        ],
      },
    ]);
    assert.deepEqual(result.summary.closureSequence, [
      {
        id: "pre-submission",
        order: 4,
        label: "Run the release-day pre-submission gate",
        rationale: "Run this only after every human and external evidence item is real.",
        blockers: [
          {
            id: "pre-submission",
            label: "S9 release-day pre-submission gate",
            planItems: ["S9", "S10"],
            validateCommand: "npm run check:public-repo -- --repo <fresh-clone-path>",
            validationSafety: expectedValidationSafety(true),
          },
        ],
      },
    ]);
    assert.deepEqual(result.summary.categoryBlockers, [
      {
        name: "public-repo",
        total: 1,
        failed: 1,
        blockers: [
          {
            id: "pre-submission",
            label: "S9 release-day pre-submission gate",
            detail: "git-tracking and public-repo failures",
            planItems: ["S9", "S10"],
            requiredEvidence: "Release-day pre-submission check with PUBLIC_REPO_CLONE_PATH and all external evidence completed.",
            provide: "--public-repo <fresh-clone-path> or PUBLIC_REPO_CLONE_PATH",
            validateCommand: "npm run check:public-repo -- --repo <fresh-clone-path>",
            validationSafety: expectedValidationSafety(true),
          },
        ],
      },
    ]);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps compact summary names skipped prerequisite closure steps", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-summary-skipped-prereqs-");
  try {
    await writeGateFixture(projectRoot, { status: "failed", withMultiCategoryBlocker: true });
    const result = await runNextSteps(projectRoot, ["--summary", "--category", "public-repo", "--plan-item", "S9"]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.filteredBlockerCount, 1);
    assert.equal(result.summary.hiddenBlockerCount, 2);
    assert.deepEqual(result.summary.blockers.map((blocker) => blocker.id), ["pre-submission"]);
    assert.deepEqual(result.summary.viewSafety, expectedCompactViewSafety({
      filtersActive: true,
      hiddenBlockerCount: 2,
      emptyBecauseOfFilters: false,
      viewStartsAfterFullGate: true,
      skippedClosureStepCount: 2,
      skippedClosureSteps: [
        {
          id: "local-evidence",
          order: 1,
          label: "Fill local evidence JSONs",
          rationale: "Close rehearsal, video, and defense evidence before publishing or final submission checks.",
          blockers: ["video"],
        },
        {
          id: "public-repo",
          order: 2,
          label: "Publish and fresh-clone the public AI system repository",
          rationale: "External evidence and final checks must point at a real fresh clone path.",
          blockers: ["public-repo"],
        },
      ],
    }));
    assert.deepEqual(result.summary.closureProgress, {
      fullGateFirstOpenStep: {
        id: "local-evidence",
        order: 1,
        label: "Fill local evidence JSONs",
        rationale: "Close rehearsal, video, and defense evidence before publishing or final submission checks.",
      },
      viewFirstOpenStep: {
        id: "pre-submission",
        order: 4,
        label: "Run the release-day pre-submission gate",
        rationale: "Run this only after every human and external evidence item is real.",
      },
      currentViewStep: {
        id: "pre-submission",
        order: 4,
        label: "Run the release-day pre-submission gate",
        rationale: "Run this only after every human and external evidence item is real.",
      },
      viewStartsAfterFullGate: true,
      skippedClosureStepCount: 2,
      skippedClosureSteps: [
        {
          id: "local-evidence",
          order: 1,
          label: "Fill local evidence JSONs",
          rationale: "Close rehearsal, video, and defense evidence before publishing or final submission checks.",
          blockers: ["video"],
        },
        {
          id: "public-repo",
          order: 2,
          label: "Publish and fresh-clone the public AI system repository",
          rationale: "External evidence and final checks must point at a real fresh clone path.",
          blockers: ["public-repo"],
        },
      ],
    });
    assert.equal(result.summary.actionWarnings, undefined);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps markdown keeps focused blockers when no generated action exists", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-markdown-no-action-");
  try {
    await writeGateFixture(projectRoot, { status: "failed", withMultiCategoryBlocker: true });
    const result = await runNextStepsRaw(projectRoot, ["--markdown", "--category", "public-repo", "--plan-item", "S9"]);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /Filtered blockers: 1 for category public-repo and plan item S9/u);
    assert.match(result.stdout, /Hidden blockers in this view: 2/u);
    assert.match(result.stdout, /Prerequisites: focused view starts after full gate; skipped prerequisites: 1\. Fill local evidence JSONs \(video\); 2\. Publish and fresh-clone the public AI system repository \(public-repo\)/u);
    assert.match(result.stdout, /Full gate suggested next command: `npm run submission:next-steps -- --next --markdown`/u);
    assert.match(result.stdout, /Suggested next command: `npm run submission:next-steps -- --next --category public-repo --plan-item S9 --markdown`/u);
    assert.match(result.stdout, /Focused next step mode: category public-repo: categoryNextSteps applied to pre-submission/u);
    assert.match(result.stdout, /## Categories\n- public-repo: failed=1 total=1; blockers=pre-submission/u);
    assert.match(result.stdout, /## Plan Items\n- S9: pre-submission/u);
    assert.match(result.stdout, /## pre-submission: S9 release-day pre-submission gate/u);
    assert.match(result.stdout, /Manual input: `--public-repo <fresh-clone-path> or PUBLIC_REPO_CLONE_PATH`/u);
    assert.match(result.stdout, /Validate: `npm run check:public-repo -- --repo <fresh-clone-path>`/u);
    assert.doesNotMatch(result.stdout, /No generated action plan entries were emitted for these blockers/u);
    assert.doesNotMatch(result.stdout, /Validate: `PUBLIC_REPO_CLONE_PATH=<fresh-clone-path> bash scripts\/pre-submission-check\.sh`/u);
    assert.doesNotMatch(result.stdout, /No blockers match category public-repo and plan item S9/u);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps commands keep focused blockers when no generated action exists", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-commands-no-action-");
  try {
    await writeGateFixture(projectRoot, { status: "failed", withMultiCategoryBlocker: true });
    const result = await runNextStepsRaw(projectRoot, ["--commands", "--category", "public-repo", "--plan-item", "S9"]);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /# filtered_blockers=1 category=public-repo plan-item=S9/u);
    assert.match(result.stdout, /# hidden_blockers=2/u);
    assert.match(result.stdout, /# full_gate_first_open_closure_step=1:local-evidence/u);
    assert.match(result.stdout, /# view_starts_after_full_gate=true/u);
    assert.match(result.stdout, /# skipped_closure_steps=1:local-evidence\(video\) 2:public-repo\(public-repo\)/u);
    assert.match(result.stdout, /# empty_because_of_filters=false/u);
    assert.match(result.stdout, /# focused_next_step=category=public-repo category_next_steps=pre-submission/u);
    assert.match(result.stdout, /# full_gate_suggested_next_command=npm run submission:next-steps -- --next --commands/u);
    assert.match(result.stdout, /# suggested_next_command=npm run submission:next-steps -- --next --category public-repo --plan-item S9 --commands/u);
    assert.match(result.stdout, /# current_view_next_command=npm run submission:next-steps -- --next --category public-repo --plan-item S9 --commands/u);
    assert.match(result.stdout, /# This focused view skips earlier full-gate prerequisites\.\n# prerequisite 1 local-evidence: blockers=video\n# prerequisite 2 public-repo: blockers=public-repo/u);
    assert.match(result.stdout, /^echo 'WARNING: this focused view starts after earlier full-gate prerequisites\.'$/um);
    assert.match(result.stdout, /^echo 'Run full gate next steps first: npm run submission:next-steps -- --next --commands'$/um);
    assert.match(result.stdout, /^echo 'Prerequisite 1 Fill local evidence JSONs: video'$/um);
    assert.match(result.stdout, /^echo 'Prerequisite 2 Publish and fresh-clone the public AI system repository: public-repo'$/um);
    assert.match(result.stdout, /# Category blocker groups\n# category public-repo: blockers=pre-submission/u);
    assert.match(result.stdout, /# validate public-repo\/pre-submission: npm run check:public-repo -- --repo <fresh-clone-path>/u);
    assert.doesNotMatch(result.stdout, /# No generated action commands were emitted for these blockers\./u);
    assert.doesNotMatch(result.stdout, /# validate pre-submission: PUBLIC_REPO_CLONE_PATH=<fresh-clone-path> bash scripts\/pre-submission-check\.sh/u);
    assert.match(result.stdout, /^echo 'TODO provide pre-submission: --public-repo <fresh-clone-path> or PUBLIC_REPO_CLONE_PATH'$/um);
    assert.match(result.stdout, /^npm run check:public-repo -- --repo "\$FRESH_CLONE_PATH"$/um);
    assert.match(result.stdout, /^  exit 1$/um);
    assert.doesNotMatch(result.stdout, /# No blockers match category public-repo and plan item S9/u);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps markdown includes truncated evidence for focused failed checks", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-markdown-evidence-");
  try {
    await writeGateFixture(projectRoot, { status: "failed", withMultiCategoryBlocker: true });
    const result = await runNextStepsRaw(projectRoot, ["--markdown", "--category", "git-tracking"]);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /Filtered blockers: 1 for category git-tracking/u);
    assert.match(result.stdout, /## Categories\n- git-tracking: failed=1 total=1; blockers=pre-submission/u);
    assert.match(result.stdout, /Action summary: evidence files=0; manual inputs=0; validation commands=1; scaffold blockers=none; fresh clone blockers=none; no prepare action=pre-submission; no validation command=none/u);
    assert.match(result.stdout, /Next closure action summary: evidence files=0; manual inputs=0; validation commands=1; scaffold blockers=none; fresh clone blockers=none; no prepare action=pre-submission; no validation command=none/u);
    assert.match(result.stdout, /Action warnings: current-view\/missing-prepare-action=pre-submission; next-closure\/missing-prepare-action=pre-submission/u);
    assert.match(result.stdout, /Closure progress summary: 1:local-evidence full=video view=none; 2:public-repo full=public-repo view=none; 4:pre-submission full=pre-submission view=pre-submission/u);
    assert.match(result.stdout, /## Closure Progress Summary\n- 1\. Fill local evidence JSONs: full=video; view=none; full-first-open\n- 2\. Publish and fresh-clone the public AI system repository: full=public-repo; view=none\n- 3\. Fill external submission evidence: full=none; view=none\n- 4\. Run the release-day pre-submission gate: full=pre-submission; view=pre-submission; view-first-open/u);
    assert.match(result.stdout, /Evidence: 5 shown of 6: \?\? scripts\/untracked-release-helper\.mjs; \?\? docs\/reports\/runs\/run-2026-05-26T01-12-39-433Z\/; \?\? docs\/reports\/runs\/run-2026-05-26T01-16-10-565Z\/; \?\? docs\/reports\/runs\/run-2026-05-26T01-20-16-608Z\/; \?\? docs\/reports\/runs\/run-2026-05-26T01-25-03-129Z\/; 1 more/u);
    assert.doesNotMatch(result.stdout, /run-2026-05-26T01-28-45-226Z/u);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps commands include truncated evidence for focused failed checks", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-commands-evidence-");
  try {
    await writeGateFixture(projectRoot, { status: "failed", withMultiCategoryBlocker: true });
    const result = await runNextStepsRaw(projectRoot, ["--commands", "--category", "git-tracking"]);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /# filtered_blockers=1 category=git-tracking/u);
    assert.match(result.stdout, /# action_without_prepare=pre-submission/u);
    assert.match(result.stdout, /# action_without_validation=none/u);
    assert.match(result.stdout, /# next_action_blockers=pre-submission/u);
    assert.match(result.stdout, /# next_action_evidence_files=0/u);
    assert.match(result.stdout, /# next_action_manual_inputs=0/u);
    assert.match(result.stdout, /# next_action_validation_commands=1/u);
    assert.match(result.stdout, /# next_action_without_prepare=pre-submission/u);
    assert.match(result.stdout, /# next_action_without_validation=none/u);
    assert.match(result.stdout, /# action_warnings=current-view:missing-prepare-action:pre-submission;next-closure:missing-prepare-action:pre-submission/u);
    assert.match(result.stdout, /# closure_progress=1:local-evidence:full=video:view=none 2:public-repo:full=public-repo:view=none 4:pre-submission:full=pre-submission:view=pre-submission/u);
    assert.match(result.stdout, /# category git-tracking: blockers=pre-submission/u);
    assert.match(result.stdout, /# evidence git-tracking\/pre-submission\/git-tracking: 5 shown of 6: \?\? scripts\/untracked-release-helper\.mjs; \?\? docs\/reports\/runs\/run-2026-05-26T01-12-39-433Z\/; \?\? docs\/reports\/runs\/run-2026-05-26T01-16-10-565Z\/; \?\? docs\/reports\/runs\/run-2026-05-26T01-20-16-608Z\/; \?\? docs\/reports\/runs\/run-2026-05-26T01-25-03-129Z\/; 1 more/u);
    assert.doesNotMatch(result.stdout, /run-2026-05-26T01-28-45-226Z/u);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps focused commands print skipped prerequisite warnings when executed", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-commands-prereq-exec-");
  try {
    await writeGateFixture(projectRoot, { status: "failed", withMultiCategoryBlocker: true });
    const result = await runNextStepsRaw(projectRoot, ["--commands", "--category", "public-repo", "--plan-item", "S9"]);

    assert.equal(result.code, 1);

    const commandPath = path.join(projectRoot, "focused-next-steps.sh");
    await writeFile(commandPath, result.stdout);
    const executed = await runShellRaw(commandPath, { cwd: projectRoot });

    assert.equal(executed.code, 1);
    assert.match(executed.stdout, /WARNING: this focused view starts after earlier full-gate prerequisites/u);
    assert.match(executed.stdout, /Run full gate next steps first: npm run submission:next-steps -- --next --commands/u);
    assert.match(executed.stdout, /Prerequisite 1 Fill local evidence JSONs: video/u);
    assert.match(executed.stdout, /Prerequisite 2 Publish and fresh-clone the public AI system repository: public-repo/u);
    assert.match(executed.stdout, /TODO provide pre-submission: --public-repo <fresh-clone-path> or PUBLIC_REPO_CLONE_PATH/u);
    assert.match(executed.stdout, /Submission blockers remain; validation was not run/u);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps can combine blocker, category, and plan item filters", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-combined-blocker-filter-");
  try {
    await writeGateFixture(projectRoot, { status: "failed", withMultiCategoryBlocker: true });
    const result = await runNextSteps(projectRoot, [
      "--blocker",
      "pre-submission",
      "--category",
      "public-repo",
      "--plan-item",
      "S9",
    ]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.blockerCount, 3);
    assert.equal(result.summary.filteredBlockerCount, 1);
    assert.equal(result.summary.blockerFilter, "pre-submission");
    assert.equal(result.summary.categoryFilter, "public-repo");
    assert.equal(result.summary.planItemFilter, "S9");
    assert.deepEqual(result.summary.blockers.map((blocker) => blocker.id), ["pre-submission"]);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps reports an empty focused category without hiding the failed full status", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-category-empty-");
  try {
    await writeGateFixture(projectRoot, { status: "failed" });
    const result = await runNextSteps(projectRoot, ["--category", "external"]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.blockerCount, 2);
    assert.equal(result.summary.filteredBlockerCount, 0);
    assert.equal(result.summary.categoryFilter, "external");
    assert.deepEqual(result.summary.filterState, {
      filtersActive: true,
      nextOnly: false,
      exactFilter: {
        category: "external",
      },
      baseFilteredBlockerCount: 0,
      filteredBlockerCount: 0,
      hiddenBlockerCount: 2,
      hasUnknownFilters: true,
      emptyBecauseOfFilters: true,
      note: "Filtered view shows 0 of 2 blockers; full gate status is unchanged.",
    });
    assert.deepEqual(result.summary.blockers, []);
    assert.deepEqual(result.summary.actionPlan, []);
    assert.deepEqual(result.summary.evidenceChecklist, {
      evidenceFiles: [],
      manualInputs: [],
      validationCommands: [],
    });
    assert.deepEqual(result.summary.closureSequence, []);
    assert.deepEqual(result.summary.categoryBlockers, []);
    assert.deepEqual(result.summary.checkCounts, { total: 0, passed: 0, failed: 0 });
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps warns when focused category is unknown", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-category-unknown-");
  try {
    await writeGateFixture(projectRoot, { status: "failed" });
    const result = await runNextSteps(projectRoot, ["--category", "bogus", "--plan-item", "S99", "--blocker", "missing"]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.filteredBlockerCount, 0);
    assert.equal(result.summary.currentViewCommandsWriteCommand, "npm run submission:next-steps -- --category bogus --plan-item S99 --blocker missing --commands --write docs/reports/submission/next-steps.sh");
    assert.equal(result.summary.currentViewSummaryWriteCommand, "npm run submission:next-steps -- --category bogus --plan-item S99 --blocker missing --summary --write docs/reports/submission/next-steps-summary.json");
    assert.deepEqual(result.summary.completionSemantics, expectedCompletionSemantics({
      status: "failed",
      blockerCount: 2,
      viewBlockerCount: 0,
      viewFiltered: true,
      hiddenBlockerCount: 2,
      canMarkSubmissionComplete: false,
    }));
    assert.deepEqual(result.summary.filterWarnings, [
      {
        type: "unknown-blocker",
        filter: "missing",
        message: "Unknown blocker filter missing",
        available: ["public-repo", "video"],
      },
      {
        type: "unknown-category",
        filter: "bogus",
        message: "Unknown category filter bogus",
        available: ["public-repo", "video-evidence"],
      },
      {
        type: "unknown-plan-item",
        filter: "S99",
        message: "Unknown plan item filter S99",
        available: ["S7", "S8"],
      },
    ]);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps compact summary preserves unknown filter warnings", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-summary-unknown-filter-");
  try {
    await writeGateFixture(projectRoot, { status: "failed" });
    const result = await runNextSteps(projectRoot, ["--summary", "--category", "bogus", "--plan-item", "S99", "--blocker", "missing"]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.blockerCount, 2);
    assert.equal(result.summary.filteredBlockerCount, 0);
    assert.equal(result.summary.hiddenBlockerCount, 2);
    assert.deepEqual(result.summary.blockers, []);
    assert.deepEqual(result.summary.viewSafety, expectedCompactViewSafety({
      filtersActive: true,
      hiddenBlockerCount: 2,
      emptyBecauseOfFilters: true,
      viewStartsAfterFullGate: false,
      skippedClosureStepCount: 0,
    }));
    assert.deepEqual(result.summary.activeFilters, {
      blocker: "missing",
      category: "bogus",
      planItem: "S99",
    });
    assert.deepEqual(result.summary.filterWarnings, [
      {
        type: "unknown-blocker",
        filter: "missing",
        message: "Unknown blocker filter missing",
        available: ["public-repo", "video"],
      },
      {
        type: "unknown-category",
        filter: "bogus",
        message: "Unknown category filter bogus",
        available: ["public-repo", "video-evidence"],
      },
      {
        type: "unknown-plan-item",
        filter: "S99",
        message: "Unknown plan item filter S99",
        available: ["S7", "S8"],
      },
    ]);
    assert.deepEqual(result.summary.availableFilters, {
      blockers: ["public-repo", "video"],
      categories: [
        { name: "public-repo", blockerCount: 1, failed: 1, total: 1 },
        { name: "video-evidence", blockerCount: 1, failed: 1, total: 1 },
      ],
      planItems: [
        { name: "S7", blockerCount: 1 },
        { name: "S8", blockerCount: 1 },
      ],
    });
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps reports an empty focused plan item without hiding the failed full status", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-plan-item-empty-");
  try {
    await writeGateFixture(projectRoot, { status: "failed" });
    const result = await runNextSteps(projectRoot, ["--plan-item", "S10"]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.blockerCount, 2);
    assert.equal(result.summary.filteredBlockerCount, 0);
    assert.equal(result.summary.planItemFilter, "S10");
    assert.deepEqual(result.summary.blockers, []);
    assert.deepEqual(result.summary.actionPlan, []);
    assert.deepEqual(result.summary.planItemBlockers, []);
    assert.deepEqual(result.summary.checkCounts, { total: 0, passed: 0, failed: 0 });
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps warns when focused plan item is unknown", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-plan-item-unknown-");
  try {
    await writeGateFixture(projectRoot, { status: "failed" });
    const result = await runNextSteps(projectRoot, ["--plan-item", "S99"]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.filteredBlockerCount, 0);
    assert.deepEqual(result.summary.filterWarnings, [
      {
        type: "unknown-plan-item",
        filter: "S99",
        message: "Unknown plan item filter S99",
        available: ["S7", "S8"],
      },
    ]);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps warns when focused blocker is unknown", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-blocker-unknown-");
  try {
    await writeGateFixture(projectRoot, { status: "failed" });
    const result = await runNextSteps(projectRoot, ["--blocker", "bogus"]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.filteredBlockerCount, 0);
    assert.deepEqual(result.summary.filterWarnings, [
      {
        type: "unknown-blocker",
        filter: "bogus",
        message: "Unknown blocker filter bogus",
        available: ["public-repo", "video"],
      },
    ]);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps prints a human-readable markdown checklist", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-markdown-");
  try {
    await writeGateFixture(projectRoot, { status: "failed" });
    const result = await runNextStepsRaw(projectRoot, ["--markdown"]);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /^# Submission Next Steps/u);
    assert.match(result.stdout, /Status: failed/u);
    assert.match(result.stdout, /Blockers: 2/u);
    assert.match(result.stdout, /Filtered blockers: none/u);
    assert.match(result.stdout, /Action summary: evidence files=1; manual inputs=1; validation commands=2; scaffold blockers=video; fresh clone blockers=public-repo; no prepare action=none; no validation command=none/u);
    assert.match(result.stdout, /Next closure action summary: evidence files=1; manual inputs=0; validation commands=1; scaffold blockers=video; fresh clone blockers=none; no prepare action=none; no validation command=none/u);
    assert.match(result.stdout, /Completion: full gate failed; blocked; filters change completion=false/u);
    assert.match(result.stdout, /Next closure step: not focused/u);
    assert.match(result.stdout, /First open closure step: 1\. Fill local evidence JSONs \(local-evidence\)/u);
    assert.match(result.stdout, /Full gate suggested next command: `npm run submission:next-steps -- --next --markdown`/u);
    assert.match(result.stdout, /Suggested next command: `npm run submission:next-steps -- --next --markdown`/u);
    assert.match(result.stdout, /Next closure commands write command: `npm run submission:next-steps -- --next --commands --write docs\/reports\/submission\/next-steps\.sh`/u);
    assert.match(result.stdout, /Next closure summary write command: `npm run submission:next-steps -- --next --summary --write docs\/reports\/submission\/next-steps-summary\.json`/u);
    assert.match(result.stdout, /Current view next command: `npm run submission:next-steps -- --next --markdown`/u);
    assert.match(result.stdout, /Current view commands write command: `npm run submission:next-steps -- --commands --write docs\/reports\/submission\/next-steps\.sh`/u);
    assert.match(result.stdout, /Open plan items: S7, S8/u);
    assert.match(result.stdout, /Available blocker filters: public-repo, video/u);
    assert.match(result.stdout, /Categories: video-evidence=1, public-repo=1/u);
    assert.match(result.stdout, /Available category filters: public-repo\(1\), video-evidence\(1\)/u);
    assert.match(result.stdout, /Available plan item filters: S7\(1\), S8\(1\)/u);
    assert.match(result.stdout, /Safety: commands create evidence by default=false; validate by default=false; blocked default exit=1/u);
    assert.match(result.stdout, /Opt in: SUBMISSION_NEXT_STEPS_PREPARE_PLACEHOLDERS=1; SUBMISSION_NEXT_STEPS_RUN_VALIDATION=1/u);
    assert.match(result.stdout, /## Evidence Checklist\n- Evidence file video: `docs\/reports\/submission\/video-evidence\.json`\n  - Template: `docs\/reports\/submission\/video-evidence\.template\.json`\n  - Scaffold handoff: `npm run scaffold:submission-evidence -- --kind video-evidence --commands`\n  - Prepare placeholder explicitly: `npm run scaffold:submission-evidence -- --kind video-evidence --copy-final`\n  - Validate: `npm run check:video-evidence -- --file docs\/reports\/submission\/video-evidence\.json`\n  - Validation safety: opt-in via `SUBMISSION_NEXT_STEPS_RUN_VALIDATION=1`; fresh clone path not required\n- Manual input public-repo: `--public-repo <fresh-clone-path> or PUBLIC_REPO_CLONE_PATH`/u);
    assert.match(result.stdout, /Validation safety: opt-in via `SUBMISSION_NEXT_STEPS_RUN_VALIDATION=1`; fresh clone path not required/u);
    assert.match(result.stdout, /Validation safety: opt-in via `SUBMISSION_NEXT_STEPS_RUN_VALIDATION=1`; fresh clone path required/u);
    assert.match(result.stdout, /## Categories\n- public-repo: failed=1 total=1; blockers=public-repo\n  - public-repo: `npm run check:public-repo -- --repo <fresh-clone-path>`\n    - Validation safety: opt-in via `SUBMISSION_NEXT_STEPS_RUN_VALIDATION=1`; fresh clone path required\n- video-evidence: failed=1 total=1; blockers=video/u);
    assert.match(result.stdout, /## Closure Sequence\n1\. Fill local evidence JSONs: video\n   - Close rehearsal, video, and defense evidence before publishing or final submission checks\.\n   - video: `npm run check:video-evidence -- --file docs\/reports\/submission\/video-evidence\.json`\n     - Validation safety: opt-in via `SUBMISSION_NEXT_STEPS_RUN_VALIDATION=1`; fresh clone path not required\n2\. Publish and fresh-clone the public AI system repository: public-repo/u);
    assert.match(result.stdout, /## Plan Items\n- S7: video\n- S8: public-repo/u);
    assert.match(result.stdout, /## video: local S7 video evidence/u);
    assert.match(result.stdout, /Categories: video-evidence=1/u);
    assert.match(result.stdout, /Failed checks:\n  - video: video-evidence\.json is missing/u);
    assert.match(result.stdout, /Prepare placeholder explicitly: `npm run scaffold:submission-evidence -- --kind video-evidence --copy-final`/u);
    assert.doesNotMatch(result.stdout, /Copy template: `test -e 'docs\/reports\/submission\/video-evidence\.json' \|\| cp/u);
    assert.match(result.stdout, /Fill evidence: `docs\/reports\/submission\/video-evidence\.json`/u);
    assert.match(result.stdout, /Validate: `npm run check:video-evidence -- --file docs\/reports\/submission\/video-evidence\.json`/u);
    assert.match(result.stdout, /## public-repo: S8 public repository fresh clone/u);
    assert.match(result.stdout, /Manual input: `--public-repo <fresh-clone-path> or PUBLIC_REPO_CLONE_PATH`/u);
    assert.doesNotThrow(() => {
      JSON.parse(JSON.stringify({ markdown: result.stdout }));
    });
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps prints compact summary JSON for handoff", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-summary-");
  try {
    await writeGateFixture(projectRoot, { status: "failed" });
    const result = await runNextStepsRaw(projectRoot, ["--summary"]);
    const summary = JSON.parse(result.stdout);

    assert.equal(result.code, 1);
    assert.deepEqual(Object.keys(summary), [
      "status",
      "blockerCount",
      "filteredBlockerCount",
      "hiddenBlockerCount",
      "canMarkSubmissionComplete",
      "viewSafety",
      "closureProgress",
      "closureProgressSummary",
      "actionSummary",
      "nextClosureActionSummary",
      "nextClosureStep",
      "fullGateSuggestedNextCommand",
      "suggestedNextCommand",
      "currentViewNextCommand",
      "nextClosureCommandsWriteCommand",
      "currentViewCommandsWriteCommand",
      "nextClosureSummaryWriteCommand",
      "currentViewSummaryWriteCommand",
      "safety",
      "scriptWriteRecommendation",
      "summaryWriteRecommendation",
      "blockers",
      "note",
    ]);
    assert.equal(summary.status, "failed");
    assert.equal(summary.blockerCount, 2);
    assert.equal(summary.hiddenBlockerCount, 0);
    assert.equal(summary.canMarkSubmissionComplete, false);
    assert.deepEqual(summary.viewSafety, expectedCompactViewSafety({
      filtersActive: false,
      hiddenBlockerCount: 0,
      emptyBecauseOfFilters: false,
      viewStartsAfterFullGate: false,
      skippedClosureStepCount: 0,
    }));
    assert.deepEqual(summary.closureProgress, {
      fullGateFirstOpenStep: {
        id: "local-evidence",
        order: 1,
        label: "Fill local evidence JSONs",
        rationale: "Close rehearsal, video, and defense evidence before publishing or final submission checks.",
      },
      viewFirstOpenStep: {
        id: "local-evidence",
        order: 1,
        label: "Fill local evidence JSONs",
        rationale: "Close rehearsal, video, and defense evidence before publishing or final submission checks.",
      },
      currentViewStep: {
        id: "local-evidence",
        order: 1,
        label: "Fill local evidence JSONs",
        rationale: "Close rehearsal, video, and defense evidence before publishing or final submission checks.",
      },
      viewStartsAfterFullGate: false,
      skippedClosureStepCount: 0,
    });
    assert.deepEqual(summary.closureProgressSummary, {
      fullOpenCount: 2,
      viewOpenCount: 2,
      fullFirstOpenStep: {
        id: "local-evidence",
        order: 1,
        label: "Fill local evidence JSONs",
        rationale: "Close rehearsal, video, and defense evidence before publishing or final submission checks.",
      },
      viewFirstOpenStep: {
        id: "local-evidence",
        order: 1,
        label: "Fill local evidence JSONs",
        rationale: "Close rehearsal, video, and defense evidence before publishing or final submission checks.",
      },
      openSteps: [
        {
          id: "local-evidence",
          order: 1,
          label: "Fill local evidence JSONs",
          fullOpenBlockers: ["video"],
          viewOpenBlockers: ["video"],
          firstFullOpen: true,
          firstViewOpen: true,
        },
        {
          id: "public-repo",
          order: 2,
          label: "Publish and fresh-clone the public AI system repository",
          fullOpenBlockers: ["public-repo"],
          viewOpenBlockers: ["public-repo"],
        },
      ],
    });
    assert.deepEqual(summary.actionSummary, {
      status: "failed",
      blockerCount: 2,
      fullBlockerCount: 2,
      hiddenBlockerCount: 0,
      blockerIds: ["video", "public-repo"],
      evidenceFileCount: 1,
      manualInputCount: 1,
      validationCommandCount: 2,
      blockersWithScaffold: ["video"],
      blockersRequiringFreshClonePath: ["public-repo"],
      blockersWithoutPrepareAction: [],
      blockersWithoutValidationCommand: [],
      requiresManualEvidence: true,
      canValidateLocally: true,
      commandsCreateEvidenceByDefault: false,
      validationRunsByDefault: false,
    });
    assert.deepEqual(summary.nextClosureActionSummary, {
      status: "failed",
      blockerCount: 1,
      fullBlockerCount: 2,
      hiddenBlockerCount: 1,
      blockerIds: ["video"],
      evidenceFileCount: 1,
      manualInputCount: 0,
      validationCommandCount: 1,
      blockersWithScaffold: ["video"],
      blockersRequiringFreshClonePath: [],
      blockersWithoutPrepareAction: [],
      blockersWithoutValidationCommand: [],
      requiresManualEvidence: true,
      canValidateLocally: true,
      commandsCreateEvidenceByDefault: false,
      validationRunsByDefault: false,
    });
    assert.equal(summary.fullGateSuggestedNextCommand, "npm run submission:next-steps -- --next");
    assert.equal(summary.suggestedNextCommand, "npm run submission:next-steps -- --next");
    assert.equal(summary.currentViewNextCommand, "npm run submission:next-steps -- --next");
    assert.equal(summary.nextClosureCommandsWriteCommand, "npm run submission:next-steps -- --next --commands --write docs/reports/submission/next-steps.sh");
    assert.equal(summary.currentViewCommandsWriteCommand, "npm run submission:next-steps -- --commands --write docs/reports/submission/next-steps.sh");
    assert.equal(summary.nextClosureSummaryWriteCommand, "npm run submission:next-steps -- --next --summary --write docs/reports/submission/next-steps-summary.json");
    assert.equal(summary.currentViewSummaryWriteCommand, "npm run submission:next-steps -- --summary --write docs/reports/submission/next-steps-summary.json");
    assertSubmissionSafety(summary.safety);
    assert.deepEqual(summary.scriptWriteRecommendation, {
      preferWriteFlag: true,
      commandsWriteFlag: "--commands --write docs/reports/submission/next-steps.sh",
      commandsWriteScript: "npm run submission:next-steps:commands:write",
      nextCommandsWriteScript: "npm run submission:next-steps:next:commands:write",
      avoidShellRedirection: true,
      reason: "Use --write or the package shortcuts for commands output so npm banners are not redirected into executable bash scripts.",
    });
    assert.deepEqual(summary.summaryWriteRecommendation, {
      preferWriteFlag: true,
      summaryWriteFlag: "--summary --write docs/reports/submission/next-steps-summary.json",
      summaryWriteScript: "npm run submission:next-steps:summary:write",
      nextSummaryWriteScript: "npm run submission:next-steps:next:summary:write",
      avoidShellRedirection: true,
      reason: "Use --summary --write or the package shortcuts for summary output so npm banners are not redirected into JSON files.",
    });
    assert.deepEqual(summary.nextClosureStep, {
      id: "local-evidence",
      order: 1,
      label: "Fill local evidence JSONs",
      rationale: "Close rehearsal, video, and defense evidence before publishing or final submission checks.",
    });
    assert.deepEqual(summary.blockers.map((blocker) => blocker.id), ["video", "public-repo"]);
    assert.equal(summary.blockers[0].scaffoldCommand, "npm run scaffold:submission-evidence -- --kind video-evidence --commands");
    assert.equal(summary.blockers[0].copyFinalCommand, "npm run scaffold:submission-evidence -- --kind video-evidence --copy-final");
    assert.deepEqual(summary.blockers[0].copySafety, expectedCompactCopySafety());
    assert.equal(summary.blockers[0].writeTo, "docs/reports/submission/video-evidence.json");
    assert.equal(summary.blockers[0].validateCommand, "npm run check:video-evidence -- --file docs/reports/submission/video-evidence.json");
    assert.deepEqual(summary.blockers[0].validationSafety, expectedValidationSafety(false));
    assert.equal(Object.hasOwn(summary.blockers[1], "scaffoldCommand"), false);
    assert.equal(Object.hasOwn(summary.blockers[1], "copyFinalCommand"), false);
    assert.equal(Object.hasOwn(summary.blockers[1], "copySafety"), false);
    assert.equal(summary.blockers[1].provide, "--public-repo <fresh-clone-path> or PUBLIC_REPO_CLONE_PATH");
    assert.equal(summary.blockers[1].validateCommand, "npm run check:public-repo -- --repo <fresh-clone-path>");
    assert.deepEqual(summary.blockers[1].validationSafety, expectedValidationSafety(true));
    assert.equal(Object.hasOwn(summary, "categoryBlockers"), false);
    assert.equal(Object.hasOwn(summary, "evidenceChecklist"), false);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps supports --format summary", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-format-summary-");
  try {
    await writeGateFixture(projectRoot, { status: "failed" });
    const result = await runNextStepsRaw(projectRoot, ["--format", "summary", "--next"]);
    const summary = JSON.parse(result.stdout);

    assert.equal(result.code, 1);
    assert.equal(summary.status, "failed");
    assert.equal(summary.filteredBlockerCount, 1);
    assert.deepEqual(summary.blockers.map((blocker) => blocker.id), ["video"]);
    assert.equal(summary.suggestedNextCommand, "npm run submission:next-steps -- --next");
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps compact summary preserves forwarded custom U6 manifest validation", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-custom-u6-summary-");
  try {
    const gateSummary = fullClosureGateSummary(projectRoot);
    const u6Blocker = gateSummary.blockers.find((blocker) => blocker.id === "u6");
    u6Blocker.detail = "custom U6 manifest is missing";
    u6Blocker.nextStep = {
      ...u6Blocker.nextStep,
      writeTo: "docs/reports/submission/custom-u6.json",
      validateWith: "npm run check:u6 -- --manifest docs/reports/submission/custom-u6.json",
    };
    gateSummary.nextSteps = gateSummary.blockers.map((blocker) => ({
      id: blocker.id,
      label: blocker.label,
      ...blocker.nextStep,
    }));
    await writeText(projectRoot, "scripts/check-submission-gates.mjs", `
console.log(JSON.stringify(${JSON.stringify(gateSummary)}, null, 2));
process.exit(1);
`);

    const result = await runNextStepsRaw(projectRoot, [
      "--summary",
      "--next",
      "--u6-manifest",
      "docs/reports/submission/custom-u6.json",
    ]);
    const summary = JSON.parse(result.stdout);

    assert.equal(result.code, 1);
    const u6 = summary.blockers.find((blocker) => blocker.id === "u6");
    assert.equal(u6.writeTo, "docs/reports/submission/custom-u6.json");
    assert.equal(u6.validateCommand, "npm run check:u6 -- --manifest docs/reports/submission/custom-u6.json");
    assert.equal(summary.nextClosureSummaryWriteCommand, "npm run submission:next-steps -- --next --u6-manifest docs/reports/submission/custom-u6.json --summary --write docs/reports/submission/next-steps-summary.json");
    assert.equal(summary.currentViewSummaryWriteCommand, "npm run submission:next-steps -- --next --u6-manifest docs/reports/submission/custom-u6.json --summary --write docs/reports/submission/next-steps-summary.json");
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps compact summary preserves provided public repo validation path", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-public-repo-summary-");
  try {
    const gateSummary = fullClosureGateSummary(projectRoot);
    for (const blocker of gateSummary.blockers) {
      if (blocker.id === "public-repo") {
        blocker.nextStep = {
          validateWith: "npm run check:public-repo -- --repo /tmp/fresh-clone",
        };
        blocker.categoryNextSteps = {
          "public-repo": blocker.nextStep,
        };
      }
      if (blocker.id === "external") {
        blocker.nextStep = {
          ...blocker.nextStep,
          validateWith: "npm run check:external-submission -- --file docs/reports/submission/external-submission-evidence.json --public-repo /tmp/fresh-clone",
        };
        blocker.categories = { "external-evidence": { total: 1, failed: 1 } };
        blocker.categoryNextSteps = {
          "external-evidence": blocker.nextStep,
        };
      }
      if (blocker.id === "pre-submission") {
        blocker.nextStep = {
          validateWith: "PUBLIC_REPO_CLONE_PATH=/tmp/fresh-clone bash scripts/pre-submission-check.sh",
        };
      }
    }
    gateSummary.nextSteps = gateSummary.blockers.map((blocker) => ({
      id: blocker.id,
      label: blocker.label,
      ...blocker.nextStep,
    }));
    await writeText(projectRoot, "scripts/check-submission-gates.mjs", `
console.log(JSON.stringify(${JSON.stringify(gateSummary)}, null, 2));
process.exit(1);
`);

    const result = await runNextStepsRaw(projectRoot, [
      "--summary",
      "--public-repo",
      "/tmp/fresh-clone",
    ]);
    const summary = JSON.parse(result.stdout);

    assert.equal(result.code, 1);
    assert.equal(summary.blockers.find((blocker) => blocker.id === "public-repo").validateCommand, "npm run check:public-repo -- --repo /tmp/fresh-clone");
    assert.equal(summary.blockers.find((blocker) => blocker.id === "external").validateCommand, "npm run check:external-submission -- --file docs/reports/submission/external-submission-evidence.json --public-repo /tmp/fresh-clone");
    assert.equal(summary.blockers.find((blocker) => blocker.id === "pre-submission").validateCommand, "PUBLIC_REPO_CLONE_PATH=/tmp/fresh-clone bash scripts/pre-submission-check.sh");
    const publicRepoCommands = summary.blockers
      .filter((blocker) => ["public-repo", "external", "pre-submission"].includes(blocker.id))
      .map((blocker) => blocker.validateCommand)
      .join("\n");
    assert.equal(publicRepoCommands.includes("<fresh-clone-path>"), false);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps markdown can focus on the next closure group", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-markdown-next-");
  try {
    await writeGateFixture(projectRoot, { status: "failed", withFullClosureBlockers: true });
    const result = await runNextStepsRaw(projectRoot, ["--markdown", "--next"]);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /Filtered blockers: 3 for next closure step local-evidence/u);
    assert.match(result.stdout, /Next closure step: 1\. Fill local evidence JSONs \(local-evidence\)/u);
    assert.match(result.stdout, /Full gate suggested next command: `npm run submission:next-steps -- --next --markdown`/u);
    assert.match(result.stdout, /Suggested next command: `npm run submission:next-steps -- --next --markdown`/u);
    assert.match(result.stdout, /Next closure commands write command: `npm run submission:next-steps -- --next --commands --write docs\/reports\/submission\/next-steps\.sh`/u);
    assert.match(result.stdout, /Current view next command: `npm run submission:next-steps -- --next --markdown`/u);
    assert.match(result.stdout, /## u6: U6 timed rehearsal manifest/u);
    assert.match(result.stdout, /## video: local S7 video evidence/u);
    assert.match(result.stdout, /## defense: S10 Q&A rehearsal evidence/u);
    assert.doesNotMatch(result.stdout, /## public-repo: S8 public repository fresh clone/u);
    assert.doesNotMatch(result.stdout, /## external: S6\/S8\/S9\/S10 external submission evidence/u);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps markdown can focus on a single category", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-markdown-category-");
  try {
    await writeGateFixture(projectRoot, { status: "failed" });
    const result = await runNextStepsRaw(projectRoot, ["--markdown", "--category", "public-repo"]);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /Blockers: 2/u);
    assert.match(result.stdout, /Filtered blockers: 1 for category public-repo/u);
    assert.match(result.stdout, /Completion: full gate failed; blocked; filters change completion=false; filtered view shows 1; hidden=1/u);
    assert.match(result.stdout, /Available category filters: public-repo\(1\), video-evidence\(1\)/u);
    assert.match(result.stdout, /## Categories\n- public-repo: failed=1 total=1; blockers=public-repo/u);
    assert.doesNotMatch(result.stdout, /video-evidence: failed=1/u);
    assert.doesNotMatch(result.stdout, /## video: local S7 video evidence/u);
    assert.match(result.stdout, /## public-repo: S8 public repository fresh clone/u);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps markdown explains an empty focused category", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-markdown-category-empty-");
  try {
    await writeGateFixture(projectRoot, { status: "failed" });
    const result = await runNextStepsRaw(projectRoot, ["--markdown", "--category", "external"]);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /Filtered blockers: 0 for category external/u);
    assert.match(result.stdout, /Hidden blockers in this view: 2/u);
    assert.match(result.stdout, /No blockers match category external\. The full submission gate status is still failed\./u);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps markdown shows unknown filter warnings", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-markdown-warning-");
  try {
    await writeGateFixture(projectRoot, { status: "failed" });
    const result = await runNextStepsRaw(projectRoot, ["--markdown", "--category", "bogus", "--plan-item", "S99"]);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /Filter warnings:\n- Unknown category filter bogus; available: public-repo, video-evidence\n- Unknown plan item filter S99; available: S7, S8/u);
    assert.match(result.stdout, /Current view commands write command: `npm run submission:next-steps -- --category bogus --plan-item S99 --commands --write docs\/reports\/submission\/next-steps\.sh`/u);
    assert.match(result.stdout, /No blockers match category bogus and plan item S99\. The full submission gate status is still failed\./u);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps markdown can focus on a single blocker id", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-markdown-blocker-");
  try {
    await writeGateFixture(projectRoot, { status: "failed" });
    const result = await runNextStepsRaw(projectRoot, ["--markdown", "--blocker", "video"]);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /Filtered blockers: 1 for blocker video/u);
    assert.match(result.stdout, /## Evidence Checklist\n- Evidence file video: `docs\/reports\/submission\/video-evidence\.json`/u);
    assert.doesNotMatch(result.stdout, /Manual input public-repo/u);
    assert.match(result.stdout, /## video: local S7 video evidence/u);
    assert.doesNotMatch(result.stdout, /## public-repo: S8 public repository fresh clone/u);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps markdown can focus on a single plan item", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-markdown-plan-item-");
  try {
    await writeGateFixture(projectRoot, { status: "failed" });
    const result = await runNextStepsRaw(projectRoot, ["--markdown", "--plan-item", "S7"]);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /Blockers: 2/u);
    assert.match(result.stdout, /Filtered blockers: 1 for plan item S7/u);
    assert.match(result.stdout, /## Plan Items\n- S7: video/u);
    assert.match(result.stdout, /## video: local S7 video evidence/u);
    assert.doesNotMatch(result.stdout, /## public-repo: S8 public repository fresh clone/u);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps supports --format markdown and keeps forwarding gate arguments", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-format-markdown-");
  try {
    await writeGateFixture(projectRoot, { status: "passed", captureArgs: true });
    const result = await runNextStepsRaw(projectRoot, [
      "--format",
      "markdown",
      "--public-repo",
      "/tmp/fresh-clone",
      "--u6-manifest",
      "docs/reports/submission/custom-u6.json",
    ]);

    assert.equal(result.code, 0);
    assert.match(result.stdout, /^# Submission Next Steps/u);
    assert.match(result.stdout, /Status: passed/u);
    assert.match(result.stdout, /Action summary: no blockers in current view/u);
    assert.match(result.stdout, /Forwarded gate args: --public-repo=\/tmp\/fresh-clone, --u6-manifest=docs\/reports\/submission\/custom-u6\.json/u);
    assert.match(result.stdout, /Current view commands write command: `npm run submission:next-steps -- --public-repo \/tmp\/fresh-clone --u6-manifest docs\/reports\/submission\/custom-u6\.json --commands --write docs\/reports\/submission\/next-steps\.sh`/u);
    assert.match(result.stdout, /No blockers remain/u);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps prints a copy-and-validate command checklist", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-commands-");
  try {
    await writeGateFixture(projectRoot, { status: "failed" });
    const result = await runNextStepsRaw(projectRoot, ["--commands"]);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /^#!\/usr\/bin\/env bash\nset -euo pipefail\ncd '/u);
    assert.match(result.stdout, /# Submission next steps commands/u);
    assert.match(result.stdout, /# status=failed blockers=2/u);
    assert.match(result.stdout, /# filtered_blockers=none/u);
    assert.match(result.stdout, /# action_evidence_files=1/u);
    assert.match(result.stdout, /# action_manual_inputs=1/u);
    assert.match(result.stdout, /# action_validation_commands=2/u);
    assert.match(result.stdout, /# action_scaffold_blockers=video/u);
    assert.match(result.stdout, /# action_fresh_clone_blockers=public-repo/u);
    assert.match(result.stdout, /# action_without_prepare=none/u);
    assert.match(result.stdout, /# action_without_validation=none/u);
    assert.match(result.stdout, /# next_action_blockers=video/u);
    assert.match(result.stdout, /# next_action_evidence_files=1/u);
    assert.match(result.stdout, /# next_action_manual_inputs=0/u);
    assert.match(result.stdout, /# next_action_validation_commands=1/u);
    assert.match(result.stdout, /# next_action_without_prepare=none/u);
    assert.match(result.stdout, /# next_action_without_validation=none/u);
    assert.match(result.stdout, /# full_gate_status=failed/u);
    assert.match(result.stdout, /# can_mark_submission_complete=false/u);
    assert.match(result.stdout, /# filters_change_completion=false/u);
    assert.match(result.stdout, /# exit_code_reflects_full_gate=true/u);
    assert.match(result.stdout, /# next_closure_step=none/u);
    assert.match(result.stdout, /# first_open_closure_step=1:local-evidence/u);
    assert.match(result.stdout, /# full_gate_suggested_next_command=npm run submission:next-steps -- --next --commands/u);
    assert.match(result.stdout, /# suggested_next_command=npm run submission:next-steps -- --next --commands/u);
    assert.match(result.stdout, /# next_closure_commands_write_command=npm run submission:next-steps -- --next --commands --write docs\/reports\/submission\/next-steps\.sh/u);
    assert.match(result.stdout, /# next_closure_summary_write_command=npm run submission:next-steps -- --next --summary --write docs\/reports\/submission\/next-steps-summary\.json/u);
    assert.match(result.stdout, /# current_view_next_command=npm run submission:next-steps -- --next --commands/u);
    assert.match(result.stdout, /# available_blocker_filters=public-repo, video/u);
    assert.match(result.stdout, /# categories=video-evidence=1, public-repo=1/u);
    assert.match(result.stdout, /# available_category_filters=public-repo\(1\), video-evidence\(1\)/u);
    assert.match(result.stdout, /# available_plan_item_filters=S7\(1\), S8\(1\)/u);
    assert.match(result.stdout, /# safety_create_evidence_by_default=false/u);
    assert.match(result.stdout, /# safety_validate_by_default=false/u);
    assert.match(result.stdout, /# safety_blocked_default_exit_code=1/u);
    assert.match(result.stdout, /# safety_placeholder_opt_in=SUBMISSION_NEXT_STEPS_PREPARE_PLACEHOLDERS=1/u);
    assert.match(result.stdout, /# safety_validation_opt_in=SUBMISSION_NEXT_STEPS_RUN_VALIDATION=1/u);
    assert.match(result.stdout, /: "\$\{FRESH_CLONE_PATH:=\}"/u);
    assert.match(result.stdout, /^echo 'WARNING: validation requires FRESH_CLONE_PATH because --public-repo was not forwarded\.'$/um);
    assert.match(result.stdout, /# Evidence checklist\n# evidence_file video: path=docs\/reports\/submission\/video-evidence\.json template=docs\/reports\/submission\/video-evidence\.template\.json\n# scaffold video: npm run scaffold:submission-evidence -- --kind video-evidence --commands\n# copy_final video: npm run scaffold:submission-evidence -- --kind video-evidence --copy-final\n# manual_input public-repo: --public-repo <fresh-clone-path> or PUBLIC_REPO_CLONE_PATH/u);
    assert.match(result.stdout, /# Category blocker groups\n# category public-repo: blockers=public-repo\n# validate public-repo\/public-repo: npm run check:public-repo -- --repo <fresh-clone-path>\n# category video-evidence: blockers=video\n# validate video-evidence\/video: npm run check:video-evidence -- --file docs\/reports\/submission\/video-evidence\.json/u);
    assert.match(result.stdout, /# Closure sequence\n# sequence 1 local-evidence: blockers=video\n# sequence 2 public-repo: blockers=public-repo/u);
    assert.match(result.stdout, /^# Prepare placeholder files and manual inputs$/um);
    assert.match(result.stdout, /^# Manual TODOs$/um);
    assert.match(result.stdout, /^echo 'TODO fill real evidence for video: docs\/reports\/submission\/video-evidence\.json'$/um);
    assert.match(result.stdout, /^echo 'TODO provide public-repo: --public-repo <fresh-clone-path> or PUBLIC_REPO_CLONE_PATH'$/um);
    assert.match(result.stdout, /^# Placeholder file creation is opt-in so final evidence paths are not populated accidentally\.$/um);
    assert.match(result.stdout, /^if \[ "\$\{SUBMISSION_NEXT_STEPS_PREPARE_PLACEHOLDERS:-0\}" != "1" \]; then$/um);
    assert.match(result.stdout, /^  echo 'Skipped placeholder file creation\. Rerun with SUBMISSION_NEXT_STEPS_PREPARE_PLACEHOLDERS=1 only when you are ready to fill real evidence\.'$/um);
    assert.match(result.stdout, /^# Validate after filling real evidence$/um);
    assert.match(result.stdout, /^# Validation is opt-in so placeholder evidence is not checked immediately\.$/um);
    assert.match(result.stdout, /^if \[ "\$\{SUBMISSION_NEXT_STEPS_RUN_VALIDATION:-0\}" != "1" \]; then$/um);
    assert.match(result.stdout, /^  echo 'Prepared placeholders\/manual inputs only\. Fill real evidence, then rerun with SUBMISSION_NEXT_STEPS_RUN_VALIDATION=1 to validate\.'$/um);
    assert.match(result.stdout, /^  echo 'Submission blockers remain; validation was not run\.'$/um);
    assert.match(result.stdout, /^  exit 1$/um);
    assertOutputOrder(result.stdout, "# Prepare placeholder files and manual inputs", "# placeholder copy only; fill real evidence before expecting validation to pass");
    assertOutputOrder(result.stdout, "# placeholder copy only; fill real evidence before expecting validation to pass", "# Validation is opt-in so placeholder evidence is not checked immediately.");
    assertOutputOrder(result.stdout, "# Validation is opt-in so placeholder evidence is not checked immediately.", "# Validate after filling real evidence");
    assertOutputOrder(result.stdout, "# Validate after filling real evidence", "\nnpm run check:video-evidence -- --file docs/reports/submission/video-evidence.json");
    assert.match(result.stdout, /## video: local S7 video evidence/u);
    assert.match(result.stdout, /^# placeholder copy only; fill real evidence before expecting validation to pass$/um);
    assert.match(result.stdout, /^npm run scaffold:submission-evidence -- --kind video-evidence --copy-final$/um);
    assert.doesNotMatch(result.stdout, /\bcp 'docs\/reports\/submission/u);
    assert.match(result.stdout, /^# fill real evidence in docs\/reports\/submission\/video-evidence\.json$/um);
    assert.match(result.stdout, /^npm run check:video-evidence -- --file docs\/reports\/submission\/video-evidence\.json$/um);
    assert.match(result.stdout, /## public-repo: S8 public repository fresh clone/u);
    assert.match(result.stdout, /^# manual input required: --public-repo <fresh-clone-path> or PUBLIC_REPO_CLONE_PATH$/um);
    assert.match(result.stdout, /^# validation opt-in: SUBMISSION_NEXT_STEPS_RUN_VALIDATION=1$/um);
    assert.match(result.stdout, /^# fresh clone path required: no$/um);
    assert.match(result.stdout, /^# fresh clone path required: yes$/um);
    assert.match(result.stdout, /^test -n "\$FRESH_CLONE_PATH" \|\| \{ echo 'FRESH_CLONE_PATH is required'; exit 1; \}$/um);
    assert.match(result.stdout, /^npm run check:public-repo -- --repo "\$FRESH_CLONE_PATH"$/um);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps commands can focus on the next closure group", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-commands-next-");
  try {
    await writeGateFixture(projectRoot, { status: "failed", withFullClosureBlockers: true });
    const result = await runNextStepsRaw(projectRoot, ["--commands", "--next"]);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /# filtered_blockers=3 next=true/u);
    assert.match(result.stdout, /# next_closure_step=1:local-evidence/u);
    assert.match(result.stdout, /# next_closure_commands_write_command=npm run submission:next-steps -- --next --commands --write docs\/reports\/submission\/next-steps\.sh/u);
    assert.match(result.stdout, /# current_view_next_command=npm run submission:next-steps -- --next --commands/u);
    assert.doesNotMatch(result.stdout, /FRESH_CLONE_PATH/u);
    assert.match(result.stdout, /# Closure sequence\n# sequence 1 local-evidence: blockers=u6,video,defense/u);
    assert.match(result.stdout, /^# Prepare placeholder files and manual inputs$/um);
    assert.match(result.stdout, /^if \[ "\$\{SUBMISSION_NEXT_STEPS_PREPARE_PLACEHOLDERS:-0\}" != "1" \]; then$/um);
    assert.match(result.stdout, /^# Validate after filling real evidence$/um);
    assert.match(result.stdout, /^if \[ "\$\{SUBMISSION_NEXT_STEPS_RUN_VALIDATION:-0\}" != "1" \]; then$/um);
    assertOutputOrder(result.stdout, "# Prepare placeholder files and manual inputs", "# Validate after filling real evidence");
    assert.match(result.stdout, /^# placeholder copy only; fill real evidence before expecting validation to pass$/um);
    assert.match(result.stdout, /## u6: U6 timed rehearsal manifest/u);
    assert.match(result.stdout, /## video: local S7 video evidence/u);
    assert.match(result.stdout, /## defense: S10 Q&A rehearsal evidence/u);
    assert.doesNotMatch(result.stdout, /## public-repo: S8 public repository fresh clone/u);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps generated commands do not create final evidence by default", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-commands-safe-");
  try {
    await writeGateFixture(projectRoot, { status: "failed" });
    await writeText(projectRoot, "docs/reports/submission/video-evidence.template.json", "{}\n");
    const result = await runNextStepsRaw(projectRoot, ["--commands", "--blocker", "video"]);

    assert.equal(result.code, 1);

    const commandPath = path.join(projectRoot, "next-steps.sh");
    await writeFile(commandPath, result.stdout);
    const executed = await runShellRaw(commandPath, { cwd: projectRoot });

    assert.equal(executed.code, 1);
    assert.match(executed.stdout, /Skipped placeholder file creation/u);
    assert.match(executed.stdout, /TODO fill real evidence for video: docs\/reports\/submission\/video-evidence\.json/u);
    assert.match(executed.stdout, /Prepared placeholders\/manual inputs only/u);
    assert.match(executed.stdout, /Submission blockers remain; validation was not run/u);
    await assertFileMissing(path.join(projectRoot, "docs/reports/submission/video-evidence.json"));
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps generated commands keep failed full gate exit after focused validation passes", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-commands-failed-after-validation-");
  try {
    await writeGateFixture(projectRoot, { status: "failed" });
    await writeText(projectRoot, "docs/reports/submission/video-evidence.template.json", "{}\n");
    const result = await runNextStepsRaw(projectRoot, ["--commands", "--blocker", "video"]);

    assert.equal(result.code, 1);

    const commandPath = path.join(projectRoot, "next-steps.sh");
    await writeFile(commandPath, result.stdout);
    const binDir = path.join(projectRoot, "bin");
    await mkdir(binDir, { recursive: true });
    const npmShimPath = path.join(binDir, "npm");
    await writeFile(npmShimPath, "#!/usr/bin/env bash\necho \"mock npm $*\"\nexit 0\n");
    await chmodExecutable(npmShimPath);

    const executed = await runShellRaw(commandPath, {
      cwd: projectRoot,
      env: {
        ...process.env,
        PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
        SUBMISSION_NEXT_STEPS_RUN_VALIDATION: "1",
      },
    });

    assert.equal(executed.code, 1);
    assert.match(executed.stdout, /mock npm run check:video-evidence -- --file docs\/reports\/submission\/video-evidence\.json/u);
    assert.match(executed.stdout, /Submission blockers remain; generated checklist cannot mark the full gate complete/u);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps writes a clean executable commands file", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-write-commands-");
  try {
    await writeGateFixture(projectRoot, { status: "failed" });
    await writeText(projectRoot, "docs/reports/submission/video-evidence.template.json", "{}\n");
    const result = await runNextStepsRaw(projectRoot, [
      "--commands",
      "--blocker",
      "video",
      "--write",
      "docs/reports/submission/next-steps.sh",
    ]);

    assert.equal(result.code, 1);

    const writtenPath = path.join(projectRoot, "docs/reports/submission/next-steps.sh");
    const written = await readFile(writtenPath, "utf8");
    assert.match(written, /^#!\/usr\/bin\/env bash\nset -euo pipefail/u);
    assert.match(written, /# full_gate_status=failed/u);
    assert.match(written, /# can_mark_submission_complete=false/u);
    assert.match(written, /# exit_code_reflects_full_gate=true/u);
    assert.match(written, /# current_view_commands_write_command=npm run submission:next-steps -- --blocker video --commands --write docs\/reports\/submission\/next-steps\.sh/u);
    assert.match(written, /# next_closure_summary_write_command=npm run submission:next-steps -- --next --blocker video --summary --write docs\/reports\/submission\/next-steps-summary\.json/u);
    assert.match(written, /# commands_write_script=npm run submission:next-steps:commands:write/u);
    assert.match(written, /# next_commands_write_script=npm run submission:next-steps:next:commands:write/u);
    assert.match(written, /# avoid_shell_redirection=true/u);
    assert.doesNotMatch(written, /> conduit-super-individual/u);
    assert.equal(written, `${result.stdout.trimEnd()}\n`);
    assertExecutable(writtenPath);

    const executed = await runShellRaw(writtenPath, { cwd: projectRoot });
    assert.equal(executed.code, 1);
    assert.match(executed.stdout, /Submission blockers remain; validation was not run/u);
    await assertFileMissing(path.join(projectRoot, "docs/reports/submission/video-evidence.json"));
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps package write shortcut writes a clean executable commands file", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-package-write-commands-");
  try {
    await writeGateFixture(projectRoot, { status: "failed" });
    await writeText(projectRoot, "docs/reports/submission/video-evidence.template.json", "{}\n");
    await writeText(projectRoot, "package.json", `${JSON.stringify({
      type: "module",
      scripts: {
        "submission:next-steps:commands:write": "node scripts/submission-next-steps.mjs --commands --write docs/reports/submission/next-steps.sh",
      },
    }, null, 2)}\n`);

    const result = await runPackageScriptRaw(projectRoot, "submission:next-steps:commands:write");

    assert.equal(result.code, 1);
    assert.match(result.stdout, /submission:next-steps:commands:write/u);

    const writtenPath = path.join(projectRoot, "docs/reports/submission/next-steps.sh");
    const written = await readFile(writtenPath, "utf8");
    assert.match(written, /^#!\/usr\/bin\/env bash\nset -euo pipefail/u);
    assert.match(written, /# current_view_commands_write_command=npm run submission:next-steps -- --commands --write docs\/reports\/submission\/next-steps\.sh/u);
    assert.match(written, /# commands_write_script=npm run submission:next-steps:commands:write/u);
    assert.match(written, /# next_commands_write_script=npm run submission:next-steps:next:commands:write/u);
    assert.match(written, /# avoid_shell_redirection=true/u);
    assert.doesNotMatch(written, /^> /um);
    assertExecutable(writtenPath);

    const executed = await runShellRaw(writtenPath, { cwd: projectRoot });
    assert.equal(executed.code, 1);
    assert.match(executed.stdout, /Submission blockers remain; validation was not run/u);
    await assertFileMissing(path.join(projectRoot, "docs/reports/submission/video-evidence.json"));
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps package next write shortcut focuses the first closure group", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-package-next-write-commands-");
  try {
    await writeGateFixture(projectRoot, { status: "failed", withFullClosureBlockers: true });
    await writeText(projectRoot, "docs/reports/submission/u6-rehearsal-manifest.template.json", "{}\n");
    await writeText(projectRoot, "docs/reports/submission/video-evidence.template.json", "{}\n");
    await writeText(projectRoot, "docs/reports/submission/defense-rehearsal-evidence.template.json", "{}\n");
    await writeText(projectRoot, "package.json", `${JSON.stringify({
      type: "module",
      scripts: {
        "submission:next-steps:next:commands:write": "node scripts/submission-next-steps.mjs --next --commands --write docs/reports/submission/next-steps.sh",
      },
    }, null, 2)}\n`);

    const result = await runPackageScriptRaw(projectRoot, "submission:next-steps:next:commands:write");

    assert.equal(result.code, 1);
    assert.match(result.stdout, /submission:next-steps:next:commands:write/u);

    const writtenPath = path.join(projectRoot, "docs/reports/submission/next-steps.sh");
    const written = await readFile(writtenPath, "utf8");
    assert.match(written, /^#!\/usr\/bin\/env bash\nset -euo pipefail/u);
    assert.match(written, /# filtered_blockers=3 next=true/u);
    assert.match(written, /# next_closure_step=1:local-evidence/u);
    assert.match(written, /# current_view_next_command=npm run submission:next-steps -- --next --commands/u);
    assert.match(written, /# current_view_commands_write_command=npm run submission:next-steps -- --next --commands --write docs\/reports\/submission\/next-steps\.sh/u);
    assert.match(written, /# next_closure_summary_write_command=npm run submission:next-steps -- --next --summary --write docs\/reports\/submission\/next-steps-summary\.json/u);
    assert.match(written, /# commands_write_script=npm run submission:next-steps:commands:write/u);
    assert.match(written, /# next_commands_write_script=npm run submission:next-steps:next:commands:write/u);
    assert.match(written, /# full_gate_suggested_next_command=npm run submission:next-steps -- --next --commands/u);
    assert.match(written, /# suggested_next_command=npm run submission:next-steps -- --next --commands/u);
    assert.match(written, /## u6: U6 timed rehearsal manifest/u);
    assert.match(written, /## video: local S7 video evidence/u);
    assert.match(written, /## defense: S10 Q&A rehearsal evidence/u);
    assert.doesNotMatch(written, /## public-repo: S8 public repository fresh clone/u);
    assert.doesNotMatch(written, /## external: S6\/S8\/S9\/S10 external submission evidence/u);
    assert.doesNotMatch(written, /## pre-submission: S9 release-day pre-submission gate/u);
    assert.doesNotMatch(written, /^> /um);
    assertExecutable(writtenPath);

    const executed = await runShellRaw(writtenPath, { cwd: projectRoot });
    assert.equal(executed.code, 1);
    assert.match(executed.stdout, /Submission blockers remain; validation was not run/u);
    await assertFileMissing(path.join(projectRoot, "docs/reports/submission/u6-rehearsal-manifest.json"));
    await assertFileMissing(path.join(projectRoot, "docs/reports/submission/video-evidence.json"));
    await assertFileMissing(path.join(projectRoot, "docs/reports/submission/defense-rehearsal-evidence.json"));
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps package summary shortcut prints compact JSON", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-package-summary-");
  try {
    await writeGateFixture(projectRoot, { status: "failed" });
    await writeText(projectRoot, "package.json", `${JSON.stringify({
      type: "module",
      scripts: {
        "submission:next-steps:summary": "node scripts/submission-next-steps.mjs --summary",
      },
    }, null, 2)}\n`);

    const result = await runPackageScriptRaw(projectRoot, "submission:next-steps:summary");
    const summary = parseJsonFromNpmOutput(result.stdout);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /submission:next-steps:summary/u);
    assert.deepEqual(Object.keys(summary), [
      "status",
      "blockerCount",
      "filteredBlockerCount",
      "hiddenBlockerCount",
      "canMarkSubmissionComplete",
      "viewSafety",
      "closureProgress",
      "closureProgressSummary",
      "actionSummary",
      "nextClosureActionSummary",
      "nextClosureStep",
      "fullGateSuggestedNextCommand",
      "suggestedNextCommand",
      "currentViewNextCommand",
      "nextClosureCommandsWriteCommand",
      "currentViewCommandsWriteCommand",
      "nextClosureSummaryWriteCommand",
      "currentViewSummaryWriteCommand",
      "safety",
      "scriptWriteRecommendation",
      "summaryWriteRecommendation",
      "blockers",
      "note",
    ]);
    assert.equal(summary.status, "failed");
    assert.equal(summary.blockerCount, 2);
    assert.equal(summary.filteredBlockerCount, 2);
    assert.equal(summary.hiddenBlockerCount, 0);
    assert.equal(summary.canMarkSubmissionComplete, false);
    assert.deepEqual(summary.viewSafety, expectedCompactViewSafety({
      filtersActive: false,
      hiddenBlockerCount: 0,
      emptyBecauseOfFilters: false,
      viewStartsAfterFullGate: false,
      skippedClosureStepCount: 0,
    }));
    assert.deepEqual(summary.closureProgress, {
      fullGateFirstOpenStep: {
        id: "local-evidence",
        order: 1,
        label: "Fill local evidence JSONs",
        rationale: "Close rehearsal, video, and defense evidence before publishing or final submission checks.",
      },
      viewFirstOpenStep: {
        id: "local-evidence",
        order: 1,
        label: "Fill local evidence JSONs",
        rationale: "Close rehearsal, video, and defense evidence before publishing or final submission checks.",
      },
      currentViewStep: {
        id: "local-evidence",
        order: 1,
        label: "Fill local evidence JSONs",
        rationale: "Close rehearsal, video, and defense evidence before publishing or final submission checks.",
      },
      viewStartsAfterFullGate: false,
      skippedClosureStepCount: 0,
    });
    assert.deepEqual(summary.actionSummary, {
      status: "failed",
      blockerCount: 2,
      fullBlockerCount: 2,
      hiddenBlockerCount: 0,
      blockerIds: ["video", "public-repo"],
      evidenceFileCount: 1,
      manualInputCount: 1,
      validationCommandCount: 2,
      blockersWithScaffold: ["video"],
      blockersRequiringFreshClonePath: ["public-repo"],
      blockersWithoutPrepareAction: [],
      blockersWithoutValidationCommand: [],
      requiresManualEvidence: true,
      canValidateLocally: true,
      commandsCreateEvidenceByDefault: false,
      validationRunsByDefault: false,
    });
    assert.deepEqual(summary.nextClosureActionSummary, {
      status: "failed",
      blockerCount: 1,
      fullBlockerCount: 2,
      hiddenBlockerCount: 1,
      blockerIds: ["video"],
      evidenceFileCount: 1,
      manualInputCount: 0,
      validationCommandCount: 1,
      blockersWithScaffold: ["video"],
      blockersRequiringFreshClonePath: [],
      blockersWithoutPrepareAction: [],
      blockersWithoutValidationCommand: [],
      requiresManualEvidence: true,
      canValidateLocally: true,
      commandsCreateEvidenceByDefault: false,
      validationRunsByDefault: false,
    });
    assert.deepEqual(summary.blockers.map((blocker) => blocker.id), ["video", "public-repo"]);
    assert.equal(summary.suggestedNextCommand, "npm run submission:next-steps -- --next");
    assert.equal(summary.fullGateSuggestedNextCommand, "npm run submission:next-steps -- --next");
    assert.equal(summary.currentViewNextCommand, "npm run submission:next-steps -- --next");
    assert.equal(summary.nextClosureCommandsWriteCommand, "npm run submission:next-steps -- --next --commands --write docs/reports/submission/next-steps.sh");
    assert.equal(summary.currentViewCommandsWriteCommand, "npm run submission:next-steps -- --commands --write docs/reports/submission/next-steps.sh");
    assert.equal(summary.nextClosureSummaryWriteCommand, "npm run submission:next-steps -- --next --summary --write docs/reports/submission/next-steps-summary.json");
    assert.equal(summary.currentViewSummaryWriteCommand, "npm run submission:next-steps -- --summary --write docs/reports/submission/next-steps-summary.json");
    assertSubmissionSafety(summary.safety);
    assert.equal(summary.scriptWriteRecommendation.commandsWriteScript, "npm run submission:next-steps:commands:write");
    assert.equal(summary.scriptWriteRecommendation.nextCommandsWriteScript, "npm run submission:next-steps:next:commands:write");
    assert.equal(summary.scriptWriteRecommendation.avoidShellRedirection, true);
    assert.equal(summary.summaryWriteRecommendation.summaryWriteScript, "npm run submission:next-steps:summary:write");
    assert.equal(summary.summaryWriteRecommendation.nextSummaryWriteScript, "npm run submission:next-steps:next:summary:write");
    assert.equal(Object.hasOwn(summary, "categoryBlockers"), false);
    assert.equal(Object.hasOwn(summary, "evidenceChecklist"), false);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps package next summary shortcut focuses the first closure group", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-package-next-summary-");
  try {
    await writeGateFixture(projectRoot, { status: "failed", withFullClosureBlockers: true });
    await writeText(projectRoot, "package.json", `${JSON.stringify({
      type: "module",
      scripts: {
        "submission:next-steps:next:summary": "node scripts/submission-next-steps.mjs --next --summary",
      },
    }, null, 2)}\n`);

    const result = await runPackageScriptRaw(projectRoot, "submission:next-steps:next:summary");
    const summary = parseJsonFromNpmOutput(result.stdout);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /submission:next-steps:next:summary/u);
    assert.equal(summary.status, "failed");
    assert.equal(summary.blockerCount, 6);
    assert.equal(summary.filteredBlockerCount, 3);
    assert.equal(summary.hiddenBlockerCount, 3);
    assert.equal(summary.canMarkSubmissionComplete, false);
    assert.deepEqual(summary.viewSafety, expectedCompactViewSafety({
      filtersActive: true,
      hiddenBlockerCount: 3,
      emptyBecauseOfFilters: false,
      viewStartsAfterFullGate: false,
      skippedClosureStepCount: 0,
    }));
    assert.deepEqual(summary.activeFilters, { nextOnly: true });
    assert.deepEqual(summary.blockers.map((blocker) => blocker.id), ["u6", "video", "defense"]);
    assert.deepEqual(summary.blockers.map((blocker) => blocker.scaffoldCommand), [
      "npm run scaffold:submission-evidence -- --kind u6-rehearsal --commands",
      "npm run scaffold:submission-evidence -- --kind video-evidence --commands",
      "npm run scaffold:submission-evidence -- --kind defense-rehearsal --commands",
    ]);
    assert.deepEqual(summary.blockers.map((blocker) => blocker.copyFinalCommand), [
      "npm run scaffold:submission-evidence -- --kind u6-rehearsal --copy-final",
      "npm run scaffold:submission-evidence -- --kind video-evidence --copy-final",
      "npm run scaffold:submission-evidence -- --kind defense-rehearsal --copy-final",
    ]);
    assert.deepEqual(summary.blockers.map((blocker) => blocker.copySafety), [
      expectedCompactCopySafety(),
      expectedCompactCopySafety(),
      expectedCompactCopySafety(),
    ]);
    assert.deepEqual(summary.blockers.map((blocker) => blocker.validationSafety), [
      expectedValidationSafety(false),
      expectedValidationSafety(false),
      expectedValidationSafety(false),
    ]);
    assert.equal(summary.suggestedNextCommand, "npm run submission:next-steps -- --next");
    assert.equal(summary.fullGateSuggestedNextCommand, "npm run submission:next-steps -- --next");
    assert.equal(summary.currentViewNextCommand, "npm run submission:next-steps -- --next");
    assert.equal(summary.nextClosureCommandsWriteCommand, "npm run submission:next-steps -- --next --commands --write docs/reports/submission/next-steps.sh");
    assert.equal(summary.currentViewCommandsWriteCommand, "npm run submission:next-steps -- --next --commands --write docs/reports/submission/next-steps.sh");
    assert.equal(summary.nextClosureSummaryWriteCommand, "npm run submission:next-steps -- --next --summary --write docs/reports/submission/next-steps-summary.json");
    assert.equal(summary.currentViewSummaryWriteCommand, "npm run submission:next-steps -- --next --summary --write docs/reports/submission/next-steps-summary.json");
    assertSubmissionSafety(summary.safety);
    assert.equal(summary.scriptWriteRecommendation.commandsWriteScript, "npm run submission:next-steps:commands:write");
    assert.equal(summary.scriptWriteRecommendation.nextCommandsWriteScript, "npm run submission:next-steps:next:commands:write");
    assert.equal(summary.scriptWriteRecommendation.avoidShellRedirection, true);
    assert.equal(summary.summaryWriteRecommendation.nextSummaryWriteScript, "npm run submission:next-steps:next:summary:write");
    assert.deepEqual(summary.nextClosureStep, {
      id: "local-evidence",
      order: 1,
      label: "Fill local evidence JSONs",
      rationale: "Close rehearsal, video, and defense evidence before publishing or final submission checks.",
    });
    assert.equal(Object.hasOwn(summary, "categoryBlockers"), false);
    assert.equal(Object.hasOwn(summary, "evidenceChecklist"), false);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps package summary write shortcut writes clean compact JSON", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-package-summary-write-");
  try {
    await writeGateFixture(projectRoot, { status: "failed" });
    await writeText(projectRoot, "package.json", `${JSON.stringify({
      type: "module",
      scripts: {
        "submission:next-steps:summary:write": "node scripts/submission-next-steps.mjs --summary --write docs/reports/submission/next-steps-summary.json",
      },
    }, null, 2)}\n`);

    const result = await runPackageScriptRaw(projectRoot, "submission:next-steps:summary:write");

    assert.equal(result.code, 1);
    assert.match(result.stdout, /submission:next-steps:summary:write/u);

    const writtenPath = path.join(projectRoot, "docs/reports/submission/next-steps-summary.json");
    const written = await readFile(writtenPath, "utf8");
    const summary = JSON.parse(written);
    assert.equal(written, `${JSON.stringify(summary, null, 2)}\n`);
    assert.equal(summary.status, "failed");
    assert.equal(summary.blockerCount, 2);
    assert.equal(summary.hiddenBlockerCount, 0);
    assert.equal(summary.nextClosureSummaryWriteCommand, "npm run submission:next-steps -- --next --summary --write docs/reports/submission/next-steps-summary.json");
    assert.equal(summary.currentViewSummaryWriteCommand, "npm run submission:next-steps -- --summary --write docs/reports/submission/next-steps-summary.json");
    assert.equal(summary.summaryWriteRecommendation.avoidShellRedirection, true);
    assert.deepEqual(summary.blockers.map((blocker) => blocker.id), ["video", "public-repo"]);
    assert.doesNotMatch(written, /^> /um);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps package next summary write shortcut preserves focused view", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-package-next-summary-write-");
  try {
    await writeGateFixture(projectRoot, { status: "failed", withFullClosureBlockers: true });
    await writeText(projectRoot, "package.json", `${JSON.stringify({
      type: "module",
      scripts: {
        "submission:next-steps:next:summary:write": "node scripts/submission-next-steps.mjs --next --summary --write docs/reports/submission/next-steps-summary.json",
      },
    }, null, 2)}\n`);

    const result = await runPackageScriptRaw(projectRoot, "submission:next-steps:next:summary:write");

    assert.equal(result.code, 1);
    assert.match(result.stdout, /submission:next-steps:next:summary:write/u);

    const writtenPath = path.join(projectRoot, "docs/reports/submission/next-steps-summary.json");
    const written = await readFile(writtenPath, "utf8");
    const summary = JSON.parse(written);
    assert.equal(written, `${JSON.stringify(summary, null, 2)}\n`);
    assert.equal(summary.blockerCount, 6);
    assert.equal(summary.filteredBlockerCount, 3);
    assert.equal(summary.hiddenBlockerCount, 3);
    assert.deepEqual(summary.blockers.map((blocker) => blocker.id), ["u6", "video", "defense"]);
    assert.equal(summary.currentViewCommandsWriteCommand, "npm run submission:next-steps -- --next --commands --write docs/reports/submission/next-steps.sh");
    assert.equal(summary.nextClosureSummaryWriteCommand, "npm run submission:next-steps -- --next --summary --write docs/reports/submission/next-steps-summary.json");
    assert.equal(summary.currentViewSummaryWriteCommand, "npm run submission:next-steps -- --next --summary --write docs/reports/submission/next-steps-summary.json");
    assert.equal(summary.summaryWriteRecommendation.avoidShellRedirection, true);
    assert.doesNotMatch(written, /^> /um);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps commands can focus on a single category", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-commands-category-");
  try {
    await writeGateFixture(projectRoot, { status: "failed" });
    const result = await runNextStepsRaw(projectRoot, ["--commands", "--category", "public-repo"]);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /# status=failed blockers=2/u);
    assert.match(result.stdout, /# filtered_blockers=1 category=public-repo/u);
    assert.match(result.stdout, /# Category blocker groups\n# category public-repo: blockers=public-repo/u);
    assert.match(result.stdout, /# validate public-repo\/public-repo: npm run check:public-repo -- --repo <fresh-clone-path>/u);
    assert.doesNotMatch(result.stdout, /## video: local S7 video evidence/u);
    assert.match(result.stdout, /## public-repo: S8 public repository fresh clone/u);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps commands can focus on a single plan item", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-commands-plan-item-");
  try {
    await writeGateFixture(projectRoot, { status: "failed" });
    const result = await runNextStepsRaw(projectRoot, ["--commands", "--plan-item", "S7"]);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /# status=failed blockers=2/u);
    assert.match(result.stdout, /# filtered_blockers=1 plan-item=S7/u);
    assert.match(result.stdout, /## video: local S7 video evidence/u);
    assert.doesNotMatch(result.stdout, /## public-repo: S8 public repository fresh clone/u);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps commands can focus on a single blocker id", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-commands-blocker-");
  try {
    await writeGateFixture(projectRoot, { status: "failed" });
    const result = await runNextStepsRaw(projectRoot, ["--commands", "--blocker", "video"]);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /# filtered_blockers=1 blocker=video/u);
    assert.match(result.stdout, /## video: local S7 video evidence/u);
    assert.match(result.stdout, /^# fresh clone path required: no$/um);
    assert.doesNotMatch(result.stdout, /FRESH_CLONE_PATH/u);
    assert.doesNotMatch(result.stdout, /## public-repo: S8 public repository fresh clone/u);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps commands show unknown filter warnings", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-commands-warning-");
  try {
    await writeGateFixture(projectRoot, { status: "failed" });
    const result = await runNextStepsRaw(projectRoot, ["--commands", "--category", "bogus"]);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /# warning unknown-category: bogus; available=public-repo,video-evidence/u);
    assert.match(result.stdout, /# hidden_blockers=2/u);
    assert.match(result.stdout, /# empty_because_of_filters=true/u);
    assert.match(result.stdout, /# No blockers match category bogus\. Full submission status remains failed\./u);
    assert.match(result.stdout, /Submission blockers remain outside this filtered view; generated checklist cannot mark the full gate complete/u);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps empty focused commands still fail when executed", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-commands-empty-filter-exec-");
  try {
    await writeGateFixture(projectRoot, { status: "failed" });
    const result = await runNextStepsRaw(projectRoot, ["--commands", "--category", "bogus"]);

    assert.equal(result.code, 1);

    const commandPath = path.join(projectRoot, "empty-filter-next-steps.sh");
    await writeFile(commandPath, result.stdout);
    const executed = await runShellRaw(commandPath, { cwd: projectRoot });

    assert.equal(executed.code, 1);
    assert.match(executed.stdout, /Submission blockers remain outside this filtered view/u);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps supports --format commands and keeps forwarding gate arguments", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-format-commands-");
  try {
    await writeGateFixture(projectRoot, { status: "passed", captureArgs: true });
    const result = await runNextStepsRaw(projectRoot, [
      "--format",
      "commands",
      "--public-repo",
      "/tmp/fresh-clone",
      "--u6-manifest",
      "docs/reports/submission/custom-u6.json",
    ]);

    assert.equal(result.code, 0);
    assert.match(result.stdout, /^#!\/usr\/bin\/env bash\nset -euo pipefail\ncd '/u);
    assert.match(result.stdout, /# Submission next steps commands/u);
    assert.match(result.stdout, /# status=passed blockers=0/u);
    assert.match(result.stdout, /# action_evidence_files=0/u);
    assert.match(result.stdout, /# action_manual_inputs=0/u);
    assert.match(result.stdout, /# action_validation_commands=0/u);
    assert.match(result.stdout, /# action_scaffold_blockers=none/u);
    assert.match(result.stdout, /# action_fresh_clone_blockers=none/u);
    assert.match(result.stdout, /# action_without_prepare=none/u);
    assert.match(result.stdout, /# action_without_validation=none/u);
    assert.match(result.stdout, /# next_action_blockers=none/u);
    assert.match(result.stdout, /# next_action_evidence_files=0/u);
    assert.match(result.stdout, /# next_action_manual_inputs=0/u);
    assert.match(result.stdout, /# next_action_validation_commands=0/u);
    assert.match(result.stdout, /# next_action_without_prepare=none/u);
    assert.match(result.stdout, /# next_action_without_validation=none/u);
    assert.match(result.stdout, /# full_gate_status=passed/u);
    assert.match(result.stdout, /# can_mark_submission_complete=true/u);
    assert.match(result.stdout, /# forwarded_gate_args=--public-repo=\/tmp\/fresh-clone, --u6-manifest=docs\/reports\/submission\/custom-u6\.json/u);
    assert.match(result.stdout, /# current_view_commands_write_command=npm run submission:next-steps -- --public-repo \/tmp\/fresh-clone --u6-manifest docs\/reports\/submission\/custom-u6\.json --commands --write docs\/reports\/submission\/next-steps\.sh/u);
    assert.match(result.stdout, /No blockers remain/u);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps commands default FRESH_CLONE_PATH from forwarded public repo", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-commands-forwarded-public-repo-");
  try {
    await writeGateFixture(projectRoot, { status: "failed" });
    await writeText(projectRoot, "docs/reports/submission/video-evidence.template.json", "{}\n");
    const result = await runNextStepsRaw(projectRoot, [
      "--commands",
      "--public-repo",
      "/tmp/fresh clone",
    ]);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /# forwarded_gate_args=--public-repo=\/tmp\/fresh clone/u);
    assert.match(result.stdout, /: \$\{FRESH_CLONE_PATH:='\/tmp\/fresh clone'\}/u);
    assert.doesNotMatch(result.stdout, /validation requires FRESH_CLONE_PATH because --public-repo was not forwarded/u);
    assert.match(result.stdout, /^test -n "\$FRESH_CLONE_PATH" \|\| \{ echo 'FRESH_CLONE_PATH is required'; exit 1; \}$/um);
    assert.match(result.stdout, /^npm run check:public-repo -- --repo "\$FRESH_CLONE_PATH"$/um);
    assert.match(result.stdout, /Submission blockers remain; validation was not run/u);

    const commandPath = path.join(projectRoot, "next-steps.sh");
    await writeFile(commandPath, result.stdout);
    const binDir = path.join(projectRoot, "bin");
    await mkdir(binDir, { recursive: true });
    const npmShimPath = path.join(binDir, "npm");
    await writeFile(npmShimPath, "#!/usr/bin/env bash\necho \"mock npm $*\"\nexit 0\n");
    await chmodExecutable(npmShimPath);

    const executed = await runShellRaw(commandPath, {
      cwd: projectRoot,
      env: {
        ...process.env,
        PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
        FRESH_CLONE_PATH: "",
        SUBMISSION_NEXT_STEPS_RUN_VALIDATION: "1",
      },
    });

    assert.equal(executed.code, 1);
    assert.match(executed.stdout, /mock npm run check:public-repo -- --repo \/tmp\/fresh clone/u);
    assert.match(executed.stdout, /Submission blockers remain; generated checklist cannot mark the full gate complete/u);
    await assertFileMissing(path.join(projectRoot, "docs/reports/submission/video-evidence.json"));
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps commands keep forwarded public repo metadata single-line", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-commands-forwarded-public-repo-newline-");
  try {
    await writeGateFixture(projectRoot, { status: "failed" });
    const publicRepoPath = "/tmp/fresh clone\necho injected";
    const result = await runNextStepsRaw(projectRoot, [
      "--commands",
      "--public-repo",
      publicRepoPath,
    ]);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /# forwarded_gate_args=--public-repo=\/tmp\/fresh clone\\necho injected/u);
    assert.match(result.stdout, /# full_gate_suggested_next_command=npm run submission:next-steps -- --next --public-repo '\/tmp\/fresh clone\\necho injected' --commands/u);
    assert.match(result.stdout, /: \$\{FRESH_CLONE_PATH:='\/tmp\/fresh clone\\necho injected'\}/u);
    assert.doesNotMatch(result.stdout, /^echo injected$/um);

    const commandPath = path.join(projectRoot, "next-steps.sh");
    await writeFile(commandPath, result.stdout);
    const executed = await runShellRaw(commandPath, { cwd: projectRoot });

    assert.equal(executed.code, 1);
    assert.doesNotMatch(executed.stdout, /^injected$/um);
    assert.match(executed.stdout, /Submission blockers remain; validation was not run/u);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps markdown keeps forwarded public repo metadata single-line", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-markdown-forwarded-public-repo-newline-");
  try {
    await writeGateFixture(projectRoot, { status: "failed" });
    const publicRepoPath = "/tmp/fresh clone\necho injected";
    const result = await runNextStepsRaw(projectRoot, [
      "--markdown",
      "--public-repo",
      publicRepoPath,
    ]);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /Forwarded gate args: --public-repo=\/tmp\/fresh clone\\necho injected/u);
    assert.match(result.stdout, /Full gate suggested next command: `npm run submission:next-steps -- --next --public-repo '\/tmp\/fresh clone\\necho injected' --markdown`/u);
    assert.match(result.stdout, /Current view commands write command: `npm run submission:next-steps -- --public-repo '\/tmp\/fresh clone\\necho injected' --commands --write docs\/reports\/submission\/next-steps\.sh`/u);
    assert.doesNotMatch(result.stdout, /^echo injected$/um);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps markdown keeps focused filter metadata single-line", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-markdown-filter-newline-");
  try {
    await writeGateFixture(projectRoot, { status: "failed" });
    const result = await runNextStepsRaw(projectRoot, [
      "--markdown",
      "--category",
      "bogus\necho category",
      "--plan-item",
      "S99\necho plan",
      "--blocker",
      "missing\necho blocker",
    ]);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /Filtered blockers: 0 for blocker missing\\necho blocker and category bogus\\necho category and plan item S99\\necho plan/u);
    assert.match(result.stdout, /Unknown blocker filter missing\\necho blocker/u);
    assert.match(result.stdout, /Unknown category filter bogus\\necho category/u);
    assert.match(result.stdout, /Unknown plan item filter S99\\necho plan/u);
    assert.match(result.stdout, /Current view commands write command: `npm run submission:next-steps -- --category 'bogus\\necho category' --plan-item 'S99\\necho plan' --blocker 'missing\\necho blocker' --commands --write docs\/reports\/submission\/next-steps\.sh`/u);
    assert.doesNotMatch(result.stdout, /^echo category$/um);
    assert.doesNotMatch(result.stdout, /^echo plan$/um);
    assert.doesNotMatch(result.stdout, /^echo blocker$/um);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps commands keep focused filter metadata single-line", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-commands-filter-newline-");
  try {
    await writeGateFixture(projectRoot, { status: "failed" });
    const result = await runNextStepsRaw(projectRoot, [
      "--commands",
      "--category",
      "bogus\necho category",
      "--plan-item",
      "S99\necho plan",
      "--blocker",
      "missing\necho blocker",
    ]);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /# filtered_blockers=0 blocker=missing\\necho blocker category=bogus\\necho category plan-item=S99\\necho plan/u);
    assert.match(result.stdout, /# warning unknown-blocker: missing\\necho blocker; available=public-repo,video/u);
    assert.match(result.stdout, /# warning unknown-category: bogus\\necho category; available=public-repo,video-evidence/u);
    assert.match(result.stdout, /# warning unknown-plan-item: S99\\necho plan; available=S7,S8/u);
    assert.doesNotMatch(result.stdout, /^echo category$/um);
    assert.doesNotMatch(result.stdout, /^echo plan$/um);
    assert.doesNotMatch(result.stdout, /^echo blocker$/um);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps writes selected output to a requested file while preserving failure exit code", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-write-");
  try {
    await writeGateFixture(projectRoot, { status: "failed" });
    const result = await runNextStepsRaw(projectRoot, [
      "--markdown",
      "--write",
      "docs/reports/submission/next-steps.md",
    ]);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /^# Submission Next Steps/u);

    const written = await readFile(path.join(projectRoot, "docs/reports/submission/next-steps.md"), "utf8");
    assert.equal(written, `${result.stdout.trimEnd()}\n`);
    assert.match(written, /## video: local S7 video evidence/u);
    await assertNotExecutable(path.join(projectRoot, "docs/reports/submission/next-steps.md"));
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps refuses to write summaries over final evidence files", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-write-evidence-");
  try {
    const result = await runNextSteps(projectRoot, [
      "--write",
      "docs/reports/submission/video-evidence.json",
    ]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.blockers[0].id, "fatal");
    assert.match(result.summary.blockers[0].detail, /Refusing to write next-steps summary to final evidence file docs\/reports\/submission\/video-evidence\.json/u);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps refuses to write summaries outside the project root", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-write-outside-");
  try {
    const result = await runNextSteps(projectRoot, [
      "--write",
      "../next-steps.json",
    ]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.blockers[0].id, "fatal");
    assert.match(result.summary.blockers[0].detail, /Refusing to write next-steps summary outside project root/u);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps returns structured JSON for invalid arguments", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-invalid-");
  try {
    const result = await runNextSteps(projectRoot, ["--bogus"]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "submission-next-steps");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.blockers[0].id, "fatal");
    assert.match(result.summary.blockers[0].detail, /Usage: node scripts\/submission-next-steps\.mjs/);
    assert.equal(result.summary.completionSemantics.canMarkSubmissionComplete, false);
    assert.equal(result.summary.completionSemantics.exitCodeReflectsFullGate, true);
    assert.match(result.summary.usage, /--markdown/);
    assert.match(result.summary.usage, /--commands/);
    assert.match(result.summary.usage, /--next/);
    assertSubmissionSafety(result.summary.safety);
    assert.deepEqual(result.summary.nextSteps, [
      {
        id: "fatal",
        label: "submission next steps invocation",
        validateWith: "Usage: node scripts/submission-next-steps.mjs [--json|--summary|--markdown|--commands|--format json|summary|markdown|commands] [--next] [--write <path>] [--blocker <id>] [--category <name>] [--plan-item <id>] [--u6-manifest <path>] [--public-repo <fresh-clone-path>]",
      },
    ]);
    assert.deepEqual(result.summary.focusedNextSteps, result.summary.nextSteps);
    assert.deepEqual(result.summary.actionPlan, [
      {
        id: "fatal",
        label: "submission next steps invocation",
        validateCommand: "Usage: node scripts/submission-next-steps.mjs [--json|--summary|--markdown|--commands|--format json|summary|markdown|commands] [--next] [--write <path>] [--blocker <id>] [--category <name>] [--plan-item <id>] [--u6-manifest <path>] [--public-repo <fresh-clone-path>]",
      },
    ]);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps rejects forwarded gate flags without values", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-missing-forwarded-value-");
  try {
    const result = await runNextSteps(projectRoot, [
      "--public-repo",
      "--u6-manifest",
      "docs/reports/submission/custom-u6.json",
    ]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "submission-next-steps");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.blockers[0].id, "fatal");
    assert.match(result.summary.blockers[0].detail, /Usage: node scripts\/submission-next-steps\.mjs/);
    assert.equal(result.summary.completionSemantics.canMarkSubmissionComplete, false);
    assert.equal(result.summary.completionSemantics.exitCodeReflectsFullGate, true);
    assert.deepEqual(result.summary.checkCounts, { total: 1, passed: 0, failed: 1 });
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps rejects write flag without a path before writing", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-missing-write-value-");
  try {
    const result = await runNextSteps(projectRoot, ["--write", "--commands"]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "submission-next-steps");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.blockers[0].id, "fatal");
    assert.match(result.summary.blockers[0].detail, /Usage: node scripts\/submission-next-steps\.mjs/);
    await assertFileMissing(path.join(projectRoot, "--commands"));
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps fails clearly when the gate command emits no JSON", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-no-json-");
  try {
    await writeText(projectRoot, "scripts/check-submission-gates.mjs", "console.log('not json');\nprocess.exit(1);\n");
    const result = await runNextSteps(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "submission-next-steps");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.blockers[0].id, "fatal");
    assert.match(result.summary.blockers[0].detail, /parseable JSON summary/);
    assertSubmissionSafety(result.summary.safety);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps rejects JSON from the wrong source mode", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-wrong-source-");
  try {
    await writeText(projectRoot, "scripts/check-submission-gates.mjs", `
console.log(JSON.stringify({
  mode: "video-evidence-check",
  status: "failed",
  blockers: [{ id: "video", detail: "do not trust this as submission gates" }]
}));
process.exit(1);
`);
    const result = await runNextSteps(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "submission-next-steps");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.blockers[0].id, "fatal");
    assert.match(result.summary.blockers[0].detail, /unexpected mode: video-evidence-check/);
    assert.doesNotMatch(JSON.stringify(result.summary), /do not trust this as submission gates/);
    assertSubmissionSafety(result.summary.safety);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps rejects contradictory gate summary status", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-contradictory-source-");
  try {
    await writeText(projectRoot, "scripts/check-submission-gates.mjs", `
console.log(JSON.stringify({
  mode: "submission-gates-check",
  status: "passed",
  blockers: [{ id: "video", detail: "do not trust this blocker" }]
}));
process.exit(0);
`);
    const result = await runNextSteps(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "submission-next-steps");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.blockers[0].id, "fatal");
    assert.match(result.summary.blockers[0].detail, /reported passed with 1 blocker/);
    assert.doesNotMatch(JSON.stringify(result.summary), /do not trust this blocker/);
    assertSubmissionSafety(result.summary.safety);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps rejects unexpected gate projectRoot", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-wrong-project-root-");
  try {
    await writeText(projectRoot, "scripts/check-submission-gates.mjs", `
console.log(JSON.stringify({
  mode: "submission-gates-check",
  status: "failed",
  projectRoot: "/tmp/do-not-cd-here",
  blockers: [{ id: "video", detail: "do not trust wrong project root" }]
}));
process.exit(1);
`);
    const result = await runNextSteps(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "submission-next-steps");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.projectRoot, realpathSync(projectRoot));
    assert.equal(result.summary.blockers[0].id, "fatal");
    assert.match(result.summary.blockers[0].detail, /unexpected projectRoot/);
    assert.doesNotMatch(JSON.stringify(result.summary), /do not trust wrong project root/);
    assertSubmissionSafety(result.summary.safety);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps rejects inconsistent gateCounts", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-bad-gate-counts-");
  try {
    await writeText(projectRoot, "scripts/check-submission-gates.mjs", `
console.log(JSON.stringify({
  mode: "submission-gates-check",
  status: "failed",
  blockers: [{ id: "video", detail: "do not trust bad gateCounts" }],
  gateCounts: { total: 3, passed: 1, failed: 1 }
}));
process.exit(1);
`);
    const result = await runNextSteps(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "submission-next-steps");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.blockers[0].id, "fatal");
    assert.match(result.summary.blockers[0].detail, /inconsistent gateCounts/);
    assert.doesNotMatch(JSON.stringify(result.summary), /do not trust bad gateCounts/);
    assertSubmissionSafety(result.summary.safety);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps rejects malformed gates", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-bad-gates-");
  try {
    await writeText(projectRoot, "scripts/check-submission-gates.mjs", `
console.log(JSON.stringify({
  mode: "submission-gates-check",
  status: "failed",
  blockers: [{ id: "video", detail: "do not trust malformed gates" }],
  gates: [{ id: "video", status: "blocked", detail: "malformed gate should not leak" }]
}));
process.exit(1);
`);
    const result = await runNextSteps(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "submission-next-steps");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.blockers[0].id, "fatal");
    assert.match(result.summary.blockers[0].detail, /gate video with invalid status: blocked/);
    assert.doesNotMatch(JSON.stringify(result.summary), /do not trust malformed gates|malformed gate should not leak/);
    assertSubmissionSafety(result.summary.safety);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps rejects duplicate gate ids", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-duplicate-gate-id-");
  try {
    await writeText(projectRoot, "scripts/check-submission-gates.mjs", `
console.log(JSON.stringify({
  mode: "submission-gates-check",
  status: "failed",
  blockers: [{ id: "video", detail: "do not trust duplicate gate blocker" }],
  gates: [
    { id: "video", status: "failed", detail: "do not trust first duplicate gate" },
    { id: "video", status: "passed", detail: "do not trust second duplicate gate" }
  ],
  gateCounts: { total: 2, passed: 1, failed: 1 }
}));
process.exit(1);
`);
    const result = await runNextSteps(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "submission-next-steps");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.blockers[0].id, "fatal");
    assert.match(result.summary.blockers[0].detail, /duplicate gate id: video/);
    assert.doesNotMatch(JSON.stringify(result.summary), /do not trust duplicate gate blocker|do not trust first duplicate gate|do not trust second duplicate gate/);
    assertSubmissionSafety(result.summary.safety);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps rejects gateCounts that differ from gates", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-mismatched-gate-counts-");
  try {
    await writeText(projectRoot, "scripts/check-submission-gates.mjs", `
console.log(JSON.stringify({
  mode: "submission-gates-check",
  status: "failed",
  blockers: [{ id: "video", detail: "do not trust mismatched gates" }],
  gates: [
    { id: "archive", status: "passed" },
    { id: "video", status: "failed", detail: "mismatched gate should not leak" }
  ],
  gateCounts: { total: 2, passed: 2, failed: 0 }
}));
process.exit(1);
`);
    const result = await runNextSteps(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "submission-next-steps");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.blockers[0].id, "fatal");
    assert.match(result.summary.blockers[0].detail, /gateCounts do not match gates\[\]/);
    assert.doesNotMatch(JSON.stringify(result.summary), /do not trust mismatched gates|mismatched gate should not leak/);
    assertSubmissionSafety(result.summary.safety);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps rejects failed gates that differ from blockers", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-mismatched-failed-gates-");
  try {
    await writeText(projectRoot, "scripts/check-submission-gates.mjs", `
console.log(JSON.stringify({
  mode: "submission-gates-check",
  status: "failed",
  blockers: [{ id: "video", detail: "do not trust mismatched failed gates" }],
  gates: [
    { id: "archive", status: "passed" },
    { id: "external", status: "failed", detail: "wrong failed gate should not leak" }
  ],
  gateCounts: { total: 2, passed: 1, failed: 1 }
}));
process.exit(1);
`);
    const result = await runNextSteps(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "submission-next-steps");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.blockers[0].id, "fatal");
    assert.match(result.summary.blockers[0].detail, /failed gates do not match blockers\[\]/);
    assert.doesNotMatch(JSON.stringify(result.summary), /do not trust mismatched failed gates|wrong failed gate should not leak/);
    assertSubmissionSafety(result.summary.safety);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps rejects delegatedCheckCounts that differ from gate checks", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-mismatched-delegated-counts-");
  try {
    await writeText(projectRoot, "scripts/check-submission-gates.mjs", `
console.log(JSON.stringify({
  mode: "submission-gates-check",
  status: "failed",
  blockers: [{ id: "video", detail: "do not trust mismatched delegated counts" }],
  gates: [{
    id: "video",
    status: "failed",
    detail: "delegated check should not leak",
    summary: {
      checks: [
        { name: "video", status: "failed", detail: "video evidence missing" },
        { name: "timeline", status: "passed" }
      ]
    }
  }],
  delegatedCheckCounts: { total: 2, passed: 2, failed: 0 }
}));
process.exit(1);
`);
    const result = await runNextSteps(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "submission-next-steps");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.blockers[0].id, "fatal");
    assert.match(result.summary.blockers[0].detail, /delegatedCheckCounts do not match gates\[\]\.summary\.checks/);
    assert.doesNotMatch(JSON.stringify(result.summary), /do not trust mismatched delegated counts|delegated check should not leak|video evidence missing/);
    assertSubmissionSafety(result.summary.safety);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps rejects mismatched blockerCount", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-bad-blocker-count-");
  try {
    await writeText(projectRoot, "scripts/check-submission-gates.mjs", `
console.log(JSON.stringify({
  mode: "submission-gates-check",
  status: "failed",
  blockers: [{ id: "video", detail: "do not trust bad blockerCount" }],
  blockerCount: 2
}));
process.exit(1);
`);
    const result = await runNextSteps(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "submission-next-steps");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.blockers[0].id, "fatal");
    assert.match(result.summary.blockers[0].detail, /blockerCount=2 for 1 blocker/);
    assert.doesNotMatch(JSON.stringify(result.summary), /do not trust bad blockerCount/);
    assertSubmissionSafety(result.summary.safety);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps rejects invalid openPlanItems", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-bad-open-plan-items-");
  try {
    await writeText(projectRoot, "scripts/check-submission-gates.mjs", `
console.log(JSON.stringify({
  mode: "submission-gates-check",
  status: "failed",
  blockers: [{ id: "video", detail: "do not trust bad openPlanItems" }],
  openPlanItems: ["S7", ""]
}));
process.exit(1);
`);
    const result = await runNextSteps(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "submission-next-steps");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.blockers[0].id, "fatal");
    assert.match(result.summary.blockers[0].detail, /openPlanItems\[1\] with invalid value:/);
    assert.doesNotMatch(JSON.stringify(result.summary), /do not trust bad openPlanItems|S7/);
    assertSubmissionSafety(result.summary.safety);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps rejects openPlanItems that differ from blocker planItems", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-mismatched-open-plan-items-");
  try {
    await writeText(projectRoot, "scripts/check-submission-gates.mjs", `
console.log(JSON.stringify({
  mode: "submission-gates-check",
  status: "failed",
  blockers: [{
    id: "video",
    detail: "do not trust mismatched openPlanItems",
    planItems: ["S7"]
  }],
  openPlanItems: ["S10"]
}));
process.exit(1);
`);
    const result = await runNextSteps(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "submission-next-steps");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.blockers[0].id, "fatal");
    assert.match(result.summary.blockers[0].detail, /openPlanItems do not match blockers\[\]\.planItems/);
    assert.doesNotMatch(JSON.stringify(result.summary), /do not trust mismatched openPlanItems|S7|S10/);
    assertSubmissionSafety(result.summary.safety);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps rejects non-object blockers", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-non-object-blocker-");
  try {
    await writeText(projectRoot, "scripts/check-submission-gates.mjs", `
console.log(JSON.stringify({
  mode: "submission-gates-check",
  status: "failed",
  blockers: ["do not trust this blocker"]
}));
process.exit(1);
`);
    const result = await runNextSteps(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "submission-next-steps");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.blockers[0].id, "fatal");
    assert.match(result.summary.blockers[0].detail, /non-object blocker at index 0/);
    assert.doesNotMatch(JSON.stringify(result.summary), /do not trust this blocker/);
    assertSubmissionSafety(result.summary.safety);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps rejects blockers without a non-empty id", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-invalid-blocker-id-");
  try {
    await writeText(projectRoot, "scripts/check-submission-gates.mjs", `
console.log(JSON.stringify({
  mode: "submission-gates-check",
  status: "failed",
  blockers: [{ id: "", detail: "do not trust missing id blocker" }]
}));
process.exit(1);
`);
    const result = await runNextSteps(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "submission-next-steps");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.blockers[0].id, "fatal");
    assert.match(result.summary.blockers[0].detail, /blocker with invalid id:/);
    assert.doesNotMatch(JSON.stringify(result.summary), /do not trust missing id blocker/);
    assertSubmissionSafety(result.summary.safety);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps rejects duplicate blocker ids", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-duplicate-blocker-id-");
  try {
    await writeText(projectRoot, "scripts/check-submission-gates.mjs", `
console.log(JSON.stringify({
  mode: "submission-gates-check",
  status: "failed",
  blockers: [
    {
      id: "video",
      detail: "do not trust first duplicate blocker",
      nextStep: { validateWith: "npm run check:video-evidence -- --file docs/reports/submission/video-evidence.json" }
    },
    {
      id: "video",
      detail: "do not trust second duplicate blocker",
      nextStep: { validateWith: "echo do-not-run-duplicate-blocker" }
    }
  ]
}));
process.exit(1);
`);
    const result = await runNextSteps(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "submission-next-steps");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.blockers[0].id, "fatal");
    assert.match(result.summary.blockers[0].detail, /duplicate blocker id: video/);
    assert.doesNotMatch(JSON.stringify(result.summary), /do not trust first duplicate blocker|do not trust second duplicate blocker|do-not-run-duplicate-blocker|check:video-evidence/);
    assertSubmissionSafety(result.summary.safety);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps rejects blockers with invalid metadata fields", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-invalid-blocker-metadata-");
  try {
    await writeText(projectRoot, "scripts/check-submission-gates.mjs", `
console.log(JSON.stringify({
  mode: "submission-gates-check",
  status: "failed",
  blockers: [{
    id: "video",
    label: "",
    detail: "do not trust invalid blocker metadata"
  }]
}));
process.exit(1);
`);
    const result = await runNextSteps(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "submission-next-steps");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.blockers[0].id, "fatal");
    assert.match(result.summary.blockers[0].detail, /blocker video\.label with invalid value:/);
    assert.doesNotMatch(JSON.stringify(result.summary), /do not trust invalid blocker metadata/);
    assertSubmissionSafety(result.summary.safety);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps rejects blockers with invalid planItems", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-invalid-plan-items-");
  try {
    await writeText(projectRoot, "scripts/check-submission-gates.mjs", `
console.log(JSON.stringify({
  mode: "submission-gates-check",
  status: "failed",
  blockers: [{
    id: "video",
    detail: "do not trust invalid planItems",
    planItems: ["S7", ""]
  }]
}));
process.exit(1);
`);
    const result = await runNextSteps(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "submission-next-steps");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.blockers[0].id, "fatal");
    assert.match(result.summary.blockers[0].detail, /blocker video\.planItems\[1\] with invalid value:/);
    assert.doesNotMatch(JSON.stringify(result.summary), /do not trust invalid planItems|S7/);
    assertSubmissionSafety(result.summary.safety);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps rejects blockers with malformed failed details", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-invalid-failed-details-");
  try {
    await writeText(projectRoot, "scripts/check-submission-gates.mjs", `
console.log(JSON.stringify({
  mode: "submission-gates-check",
  status: "failed",
  blockers: [{
    id: "video",
    detail: "do not trust malformed details",
    details: [{
      name: "video",
      detail: "video evidence missing",
      evidence: ["safe evidence", ""]
    }]
  }]
}));
process.exit(1);
`);
    const result = await runNextSteps(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "submission-next-steps");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.blockers[0].id, "fatal");
    assert.match(result.summary.blockers[0].detail, /blocker video\.details\[0\]\.evidence\[1\] with invalid value:/);
    assert.doesNotMatch(JSON.stringify(result.summary), /do not trust malformed details|video evidence missing|safe evidence/);
    assertSubmissionSafety(result.summary.safety);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps rejects blockers with malformed categories", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-malformed-categories-");
  try {
    await writeText(projectRoot, "scripts/check-submission-gates.mjs", `
console.log(JSON.stringify({
  mode: "submission-gates-check",
  status: "failed",
  blockers: [{ id: "video", detail: "do not trust malformed categories", categories: [] }]
}));
process.exit(1);
`);
    const result = await runNextSteps(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "submission-next-steps");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.blockers[0].id, "fatal");
    assert.match(result.summary.blockers[0].detail, /blocker video with invalid categories/);
    assert.doesNotMatch(JSON.stringify(result.summary), /do not trust malformed categories/);
    assertSubmissionSafety(result.summary.safety);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps rejects blockers with invalid category counts", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-invalid-category-counts-");
  try {
    await writeText(projectRoot, "scripts/check-submission-gates.mjs", `
console.log(JSON.stringify({
  mode: "submission-gates-check",
  status: "failed",
  blockers: [{
    id: "video",
    detail: "do not trust invalid category counts",
    categories: { "video-evidence": { total: 1, failed: 2 } }
  }]
}));
process.exit(1);
`);
    const result = await runNextSteps(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "submission-next-steps");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.blockers[0].id, "fatal");
    assert.match(result.summary.blockers[0].detail, /category video-evidence failed=2 above total=1/);
    assert.doesNotMatch(JSON.stringify(result.summary), /do not trust invalid category counts/);
    assertSubmissionSafety(result.summary.safety);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps rejects malformed top-level categoryCounts", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-malformed-top-category-counts-");
  try {
    await writeText(projectRoot, "scripts/check-submission-gates.mjs", `
console.log(JSON.stringify({
  mode: "submission-gates-check",
  status: "failed",
  categoryCounts: { "video-evidence": { total: 1, failed: "1" } },
  blockers: [{
    id: "video",
    detail: "do not trust malformed top-level categoryCounts",
    categories: { "video-evidence": { total: 1, failed: 1 } }
  }]
}));
process.exit(1);
`);
    const result = await runNextSteps(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "submission-next-steps");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.blockers[0].id, "fatal");
    assert.match(result.summary.blockers[0].detail, /categoryCounts\.video-evidence\.failed with invalid value:/);
    assert.doesNotMatch(JSON.stringify(result.summary), /do not trust malformed top-level categoryCounts/);
    assertSubmissionSafety(result.summary.safety);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps rejects top-level categoryCounts that differ from blockers", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-mismatched-top-category-counts-");
  try {
    await writeText(projectRoot, "scripts/check-submission-gates.mjs", `
console.log(JSON.stringify({
  mode: "submission-gates-check",
  status: "failed",
  categoryCounts: { "video-evidence": { total: 2, failed: 1 } },
  blockers: [{
    id: "video",
    detail: "do not trust mismatched top-level categoryCounts",
    categories: { "video-evidence": { total: 1, failed: 1 } }
  }]
}));
process.exit(1);
`);
    const result = await runNextSteps(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "submission-next-steps");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.blockers[0].id, "fatal");
    assert.match(result.summary.blockers[0].detail, /categoryCounts\.video-evidence does not match blocker categories/);
    assert.doesNotMatch(JSON.stringify(result.summary), /do not trust mismatched top-level categoryCounts/);
    assertSubmissionSafety(result.summary.safety);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps rejects blockers with malformed nextStep", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-malformed-blocker-next-step-");
  try {
    await writeText(projectRoot, "scripts/check-submission-gates.mjs", `
console.log(JSON.stringify({
  mode: "submission-gates-check",
  status: "failed",
  blockers: [{
    id: "video",
    detail: "do not trust malformed blocker nextStep",
    nextStep: ["do not trust this blocker nextStep"]
  }]
}));
process.exit(1);
`);
    const result = await runNextSteps(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "submission-next-steps");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.blockers[0].id, "fatal");
    assert.match(result.summary.blockers[0].detail, /blocker video nextStep with invalid value/);
    assert.doesNotMatch(JSON.stringify(result.summary), /do not trust malformed blocker nextStep|do not trust this blocker nextStep/);
    assertSubmissionSafety(result.summary.safety);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps rejects blockers with invalid nextStep fields", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-invalid-blocker-next-step-field-");
  try {
    await writeText(projectRoot, "scripts/check-submission-gates.mjs", `
console.log(JSON.stringify({
  mode: "submission-gates-check",
  status: "failed",
  blockers: [{
    id: "video",
    detail: "do not trust invalid blocker nextStep",
    nextStep: {
      validateWith: ""
    }
  }]
}));
process.exit(1);
`);
    const result = await runNextSteps(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "submission-next-steps");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.blockers[0].id, "fatal");
    assert.match(result.summary.blockers[0].detail, /blocker video nextStep\.validateWith with invalid value:/);
    assert.doesNotMatch(JSON.stringify(result.summary), /do not trust invalid blocker nextStep/);
    assertSubmissionSafety(result.summary.safety);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps rejects blockers with malformed categoryNextSteps", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-malformed-category-next-steps-");
  try {
    await writeText(projectRoot, "scripts/check-submission-gates.mjs", `
console.log(JSON.stringify({
  mode: "submission-gates-check",
  status: "failed",
  blockers: [{
    id: "pre-submission",
    detail: "do not trust malformed categoryNextSteps",
    categories: { "public-repo": { total: 1, failed: 1 } },
    categoryNextSteps: []
  }]
}));
process.exit(1);
`);
    const result = await runNextSteps(projectRoot, ["--category", "public-repo"]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "submission-next-steps");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.blockers[0].id, "fatal");
    assert.match(result.summary.blockers[0].detail, /blocker pre-submission with invalid categoryNextSteps/);
    assert.doesNotMatch(JSON.stringify(result.summary), /do not trust malformed categoryNextSteps/);
    assertSubmissionSafety(result.summary.safety);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps rejects categoryNextSteps without matching categories", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-unmatched-category-next-step-");
  try {
    await writeText(projectRoot, "scripts/check-submission-gates.mjs", `
console.log(JSON.stringify({
  mode: "submission-gates-check",
  status: "failed",
  blockers: [{
    id: "pre-submission",
    detail: "do not trust unmatched categoryNextSteps",
    categories: { "git-tracking": { total: 1, failed: 1 } },
    categoryNextSteps: {
      "public-repo": {
        validateWith: "echo do-not-run-unmatched-category-next-step"
      }
    }
  }]
}));
process.exit(1);
`);
    const result = await runNextSteps(projectRoot, ["--category", "public-repo"]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "submission-next-steps");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.blockers[0].id, "fatal");
    assert.match(result.summary.blockers[0].detail, /categoryNextSteps\.public-repo with no matching category/);
    assert.doesNotMatch(JSON.stringify(result.summary), /do not trust unmatched categoryNextSteps|do-not-run-unmatched-category-next-step/);
    assertSubmissionSafety(result.summary.safety);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps rejects blockers with invalid categoryNextSteps fields", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-invalid-category-next-step-field-");
  try {
    await writeText(projectRoot, "scripts/check-submission-gates.mjs", `
console.log(JSON.stringify({
  mode: "submission-gates-check",
  status: "failed",
  blockers: [{
    id: "pre-submission",
    detail: "do not trust invalid categoryNextSteps field",
    categories: { "public-repo": { total: 1, failed: 1 } },
    categoryNextSteps: {
      "public-repo": {
        provide: ""
      }
    }
  }]
}));
process.exit(1);
`);
    const result = await runNextSteps(projectRoot, ["--category", "public-repo"]);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "submission-next-steps");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.blockers[0].id, "fatal");
    assert.match(result.summary.blockers[0].detail, /blocker pre-submission categoryNextSteps\.public-repo\.provide with invalid value:/);
    assert.doesNotMatch(JSON.stringify(result.summary), /do not trust invalid categoryNextSteps field/);
    assertSubmissionSafety(result.summary.safety);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps rejects malformed nextSteps entries", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-malformed-next-steps-");
  try {
    await writeText(projectRoot, "scripts/check-submission-gates.mjs", `
console.log(JSON.stringify({
  mode: "submission-gates-check",
  status: "failed",
  blockers: [{ id: "video", detail: "video evidence missing" }],
  nextSteps: ["do not trust this next step"]
}));
process.exit(1);
`);
    const result = await runNextSteps(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "submission-next-steps");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.blockers[0].id, "fatal");
    assert.match(result.summary.blockers[0].detail, /non-object nextSteps entry at index 0/);
    assert.doesNotMatch(JSON.stringify(result.summary), /do not trust this next step|video evidence missing/);
    assertSubmissionSafety(result.summary.safety);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps rejects nextSteps for unknown blockers", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-unknown-next-step-");
  try {
    await writeText(projectRoot, "scripts/check-submission-gates.mjs", `
console.log(JSON.stringify({
  mode: "submission-gates-check",
  status: "failed",
  blockers: [{ id: "video", detail: "do not trust unknown top nextStep" }],
  nextSteps: [{
    id: "external",
    label: "Unrelated external evidence",
    validateWith: "echo do-not-run-unknown-next-step"
  }]
}));
process.exit(1);
`);
    const result = await runNextSteps(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "submission-next-steps");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.blockers[0].id, "fatal");
    assert.match(result.summary.blockers[0].detail, /nextSteps entry for unknown blocker external/);
    assert.doesNotMatch(JSON.stringify(result.summary), /do not trust unknown top nextStep|do-not-run-unknown-next-step/);
    assertSubmissionSafety(result.summary.safety);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps rejects duplicate top-level nextSteps", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-duplicate-next-step-");
  try {
    await writeText(projectRoot, "scripts/check-submission-gates.mjs", `
console.log(JSON.stringify({
  mode: "submission-gates-check",
  status: "failed",
  blockers: [{ id: "video", detail: "do not trust duplicate top nextSteps" }],
  nextSteps: [
    {
      id: "video",
      label: "Video evidence",
      validateWith: "npm run check:video-evidence -- --file docs/reports/submission/video-evidence.json"
    },
    {
      id: "video",
      label: "Duplicate video evidence",
      validateWith: "echo do-not-run-duplicate-next-step"
    }
  ]
}));
process.exit(1);
`);
    const result = await runNextSteps(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "submission-next-steps");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.blockers[0].id, "fatal");
    assert.match(result.summary.blockers[0].detail, /duplicate nextSteps entry for blocker video/);
    assert.doesNotMatch(JSON.stringify(result.summary), /do not trust duplicate top nextSteps|do-not-run-duplicate-next-step/);
    assertSubmissionSafety(result.summary.safety);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps rejects top-level nextSteps that differ from blocker nextStep", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-mismatched-next-step-");
  try {
    await writeText(projectRoot, "scripts/check-submission-gates.mjs", `
console.log(JSON.stringify({
  mode: "submission-gates-check",
  status: "failed",
  blockers: [{
    id: "video",
    detail: "do not trust mismatched blocker nextStep",
    nextStep: {
      validateWith: "npm run check:video-evidence -- --file docs/reports/submission/video-evidence.json"
    }
  }],
  nextSteps: [{
    id: "video",
    label: "Video evidence",
    validateWith: "echo do-not-run-mismatched-next-step"
  }]
}));
process.exit(1);
`);
    const result = await runNextSteps(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "submission-next-steps");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.blockers[0].id, "fatal");
    assert.match(result.summary.blockers[0].detail, /nextSteps\.video\.validateWith does not match blocker video nextStep/);
    assert.doesNotMatch(JSON.stringify(result.summary), /do not trust mismatched blocker nextStep|do-not-run-mismatched-next-step|check:video-evidence/);
    assertSubmissionSafety(result.summary.safety);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("submission next steps rejects nextSteps with invalid command fields", async () => {
  const projectRoot = await makeProjectRoot("submission-next-steps-invalid-next-step-command-");
  try {
    await writeText(projectRoot, "scripts/check-submission-gates.mjs", `
console.log(JSON.stringify({
  mode: "submission-gates-check",
  status: "failed",
  blockers: [{ id: "video", detail: "video evidence missing" }],
  nextSteps: [{ id: "video", label: "Video evidence", validateWith: "" }]
}));
process.exit(1);
`);
    const result = await runNextSteps(projectRoot);

    assert.equal(result.code, 1);
    assert.equal(result.summary.mode, "submission-next-steps");
    assert.equal(result.summary.status, "failed");
    assert.equal(result.summary.blockers[0].id, "fatal");
    assert.match(result.summary.blockers[0].detail, /nextSteps\.video\.validateWith with invalid value:/);
    assert.doesNotMatch(JSON.stringify(result.summary), /video evidence missing/);
    assertSubmissionSafety(result.summary.safety);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

function assertSubmissionSafety(safety) {
  assert.deepEqual(safety, {
    createsEvidenceByDefault: false,
    validatesByDefault: false,
    defaultBlockedExitCode: 1,
    placeholderOptInEnv: "SUBMISSION_NEXT_STEPS_PREPARE_PLACEHOLDERS=1",
    validationOptInEnv: "SUBMISSION_NEXT_STEPS_RUN_VALIDATION=1",
    note: "Generated commands print TODOs by default; they do not create final evidence or run validation unless explicitly opted in.",
  });
}

function assertOutputOrder(output, earlier, later) {
  const earlierIndex = output.indexOf(earlier);
  const laterIndex = output.indexOf(later);
  assert.notEqual(earlierIndex, -1, `missing earlier marker: ${earlier}`);
  assert.notEqual(laterIndex, -1, `missing later marker: ${later}`);
  assert.ok(earlierIndex < laterIndex, `expected ${earlier} before ${later}`);
}

async function assertExecutable(filePath) {
  const mode = (await stat(filePath)).mode;
  assert.notEqual(mode & 0o100, 0, `expected owner execute bit on ${filePath}`);
}

async function assertNotExecutable(filePath) {
  const mode = (await stat(filePath)).mode;
  assert.equal(mode & 0o111, 0, `expected no execute bits on ${filePath}`);
}

async function assertFileMissing(filePath) {
  try {
    await access(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  assert.fail(`expected file to be missing: ${filePath}`);
}

async function makeProjectRoot(prefix) {
  const projectRoot = await mkdtemp(path.join(tmpdir(), prefix));
  await mkdir(path.join(projectRoot, "scripts"), { recursive: true });
  await copyFile(SCRIPT_PATH, path.join(projectRoot, "scripts/submission-next-steps.mjs"));
  await copyFile(JSON_GATE_HELPER_PATH, path.join(projectRoot, "scripts/json-gate-summary.mjs"));
  await copyFile(WRITE_GUARD_PATH, path.join(projectRoot, "scripts/submission-write-guard.mjs"));
  return projectRoot;
}

function expectedValidationSafety(mayRequireFreshClonePath) {
  return {
    optInRequired: true,
    optInEnv: "SUBMISSION_NEXT_STEPS_RUN_VALIDATION=1",
    mayRequireFreshClonePath,
  };
}

function expectedCompactCopySafety() {
  return {
    optInRequired: true,
    optInEnv: "SUBMISSION_NEXT_STEPS_PREPARE_PLACEHOLDERS=1",
    createsFinalEvidence: false,
    note: "Copies a template placeholder only; fill real evidence before validation.",
  };
}

function expectedCompactViewSafety({
  filtersActive,
  hiddenBlockerCount,
  emptyBecauseOfFilters,
  viewStartsAfterFullGate,
  skippedClosureStepCount,
  skippedClosureSteps,
}) {
  return stripExpectedEmpty({
    filtersActive,
    hiddenBlockerCount,
    emptyBecauseOfFilters,
    viewStartsAfterFullGate,
    skippedClosureStepCount,
    skippedClosureSteps,
    fullGateStatus: "failed",
    exitCodeReflectsFullGate: true,
    filtersChangeCompletion: false,
    note: "Only an unblocked full submission gate can mark the project complete; filtered views and focused validation do not change completion status.",
  });
}

function stripExpectedEmpty(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function expectedCompletionSemantics({
  status,
  blockerCount,
  viewBlockerCount,
  viewFiltered,
  hiddenBlockerCount,
  canMarkSubmissionComplete,
}) {
  return {
    fullGateStatus: status,
    fullGateBlockerCount: blockerCount,
    viewBlockerCount,
    viewFiltered,
    hiddenBlockerCount,
    filtersChangeCompletion: false,
    exitCodeReflectsFullGate: true,
    canMarkSubmissionComplete,
    note: canMarkSubmissionComplete
      ? "Full submission gate is passed with zero blockers."
      : "Only an unblocked full submission gate can mark the project complete; filtered views and focused validation do not change completion status.",
  };
}

function validationSafetyById(items, property) {
  return Object.fromEntries(items.map((item) => [item.id, item[property]]));
}

function validationSafetyByNestedBlockerId(groups) {
  return Object.fromEntries(groups.flatMap((group) => (
    group.blockers.map((blocker) => [blocker.id, blocker.validationSafety])
  )));
}

function parseJsonFromNpmOutput(stdout) {
  const jsonStart = stdout.indexOf("{");
  assert.notEqual(jsonStart, -1, "expected npm output to include JSON");
  return JSON.parse(stdout.slice(jsonStart));
}

async function writeGateFixture(projectRoot, { status, captureArgs = false, projectRootOverride, withMultiCategoryBlocker = false, withFullClosureBlockers = false, withVerifyBlocker = false }) {
  const gateSummary = status === "passed" ? passedGateSummary(projectRoot) : failedGateSummary(projectRoot, { withMultiCategoryBlocker, withFullClosureBlockers, withVerifyBlocker });
  if (projectRootOverride !== undefined) gateSummary.projectRoot = projectRootOverride;
  const assertArgs = captureArgs
    ? `
if (!process.argv.includes("--json")) throw new Error("missing --json");
if (!process.argv.includes("--public-repo")) throw new Error("missing --public-repo");
if (!process.argv.includes("/tmp/fresh-clone")) throw new Error("missing public repo path");
if (!process.argv.includes("--u6-manifest")) throw new Error("missing --u6-manifest");
if (!process.argv.includes("docs/reports/submission/custom-u6.json")) throw new Error("missing U6 manifest path");
`
    : "";
  await writeText(projectRoot, "scripts/check-submission-gates.mjs", `
${assertArgs}
console.log(JSON.stringify(${JSON.stringify(gateSummary)}, null, 2));
process.exit(${status === "passed" ? 0 : 1});
`);
}

function passedGateSummary(projectRoot) {
  return {
    mode: "submission-gates-check",
    status: "passed",
    projectRoot,
    gateCounts: { total: 2, passed: 2, failed: 0 },
    delegatedCheckCounts: { total: 2, passed: 2, failed: 0 },
    blockerCount: 0,
    openPlanItems: [],
    blockers: [],
    nextSteps: [],
  };
}

function failedGateSummary(projectRoot, { withMultiCategoryBlocker = false, withFullClosureBlockers = false, withVerifyBlocker = false } = {}) {
  if (withFullClosureBlockers) return fullClosureGateSummary(projectRoot);
  const blockers = [
    {
      id: "video",
      label: "local S7 video evidence",
      planItems: ["S7"],
      detail: "video-evidence.json is missing",
      categories: { "video-evidence": { total: 1, failed: 1 } },
      details: [{ name: "video", detail: "video-evidence.json is missing" }],
      requiredEvidence: "Real local video evidence.",
      nextStep: {
        copyFrom: "docs/reports/submission/video-evidence.template.json",
        writeTo: "docs/reports/submission/video-evidence.json",
        validateWith: "npm run check:video-evidence -- --file docs/reports/submission/video-evidence.json",
      },
    },
    {
      id: "public-repo",
      label: "S8 public repository fresh clone",
      planItems: ["S8"],
      detail: "requires --public-repo <fresh-clone-path>",
      categories: { "public-repo": { total: 1, failed: 1 } },
      requiredEvidence: "Fresh clone path for the published AI system repository.",
      nextStep: {
        provide: "--public-repo <fresh-clone-path> or PUBLIC_REPO_CLONE_PATH",
        validateWith: "npm run check:public-repo -- --repo <fresh-clone-path>",
      },
    },
  ];
  if (withMultiCategoryBlocker) {
    blockers.push({
      id: "pre-submission",
      label: "S9 release-day pre-submission gate",
      planItems: ["S9", "S10"],
      detail: "git-tracking and public-repo failures",
      categories: {
        "git-tracking": { total: 1, failed: 1 },
        "public-repo": { total: 1, failed: 1 },
      },
      categoryNextSteps: {
        "git-tracking": {
          validateWith: "git status --short",
        },
        "public-repo": {
          provide: "--public-repo <fresh-clone-path> or PUBLIC_REPO_CLONE_PATH",
          validateWith: "npm run check:public-repo -- --repo <fresh-clone-path>",
        },
      },
      details: [
        {
          name: "git-tracking",
          detail: "public release paths are not all tracked by git",
          evidence: [
            "?? scripts/untracked-release-helper.mjs",
            "?? docs/reports/runs/run-2026-05-26T01-12-39-433Z/",
            "?? docs/reports/runs/run-2026-05-26T01-16-10-565Z/",
            "?? docs/reports/runs/run-2026-05-26T01-20-16-608Z/",
            "?? docs/reports/runs/run-2026-05-26T01-25-03-129Z/",
            "?? docs/reports/runs/run-2026-05-26T01-28-45-226Z/",
          ],
        },
        { name: "public-repo", detail: "public repository fresh clone path is missing" },
      ],
      requiredEvidence: "Release-day pre-submission check with PUBLIC_REPO_CLONE_PATH and all external evidence completed.",
      nextStep: {
        provide: "PUBLIC_REPO_CLONE_PATH=<fresh-clone-path>",
        validateWith: "PUBLIC_REPO_CLONE_PATH=<fresh-clone-path> bash scripts/pre-submission-check.sh",
      },
    });
  }
  if (withVerifyBlocker) {
    blockers.push({
      id: "pre-submission",
      label: "S9 release-day pre-submission gate",
      planItems: ["S9", "S10"],
      detail: "npm run verify failed",
      categories: { verify: { total: 1, failed: 1 } },
      categoryNextSteps: {
        verify: {
          validateWith: "npm run verify",
        },
      },
      details: [{ name: "verify", detail: "npm run verify failed" }],
      requiredEvidence: "Release-day pre-submission check with PUBLIC_REPO_CLONE_PATH and all external evidence completed.",
      nextStep: {
        provide: "PUBLIC_REPO_CLONE_PATH=<fresh-clone-path>",
        validateWith: "PUBLIC_REPO_CLONE_PATH=<fresh-clone-path> bash scripts/pre-submission-check.sh",
      },
    });
  }
  return {
    mode: "submission-gates-check",
    status: "failed",
    projectRoot,
    gateCounts: { total: 2, passed: 1, failed: 1 },
    delegatedCheckCounts: { total: 3, passed: 1, failed: 2 },
    blockerCount: blockers.length,
    openPlanItems: openPlanItemsFromBlockers(blockers),
    blockers,
    nextSteps: [
      {
        id: "video",
        label: "local S7 video evidence",
        copyFrom: "docs/reports/submission/video-evidence.template.json",
        writeTo: "docs/reports/submission/video-evidence.json",
        validateWith: "npm run check:video-evidence -- --file docs/reports/submission/video-evidence.json",
      },
      {
        id: "public-repo",
        label: "S8 public repository fresh clone",
        provide: "--public-repo <fresh-clone-path> or PUBLIC_REPO_CLONE_PATH",
        validateWith: "npm run check:public-repo -- --repo <fresh-clone-path>",
      },
    ],
  };
}

function openPlanItemsFromBlockers(blockers) {
  return [...new Set(blockers.flatMap((blocker) => blocker.planItems ?? []))];
}

function fullClosureGateSummary(projectRoot) {
  const blockersById = {
    external: {
      id: "external",
      label: "S6/S8/S9/S10 external submission evidence",
      planItems: ["S6", "S8", "S9", "S10"],
      detail: "external evidence is missing",
      categories: { external: { total: 1, failed: 1 } },
      requiredEvidence: "Real external submission evidence.",
      nextStep: {
        copyFrom: "docs/reports/submission/external-submission-evidence.template.json",
        writeTo: "docs/reports/submission/external-submission-evidence.json",
        validateWith: "npm run check:external-submission -- --file docs/reports/submission/external-submission-evidence.json --public-repo <fresh-clone-path>",
      },
    },
    "pre-submission": {
      id: "pre-submission",
      label: "S9 release-day pre-submission gate",
      planItems: ["S9", "S10"],
      detail: "pre-submission gate is still failing",
      categories: { "git-tracking": { total: 1, failed: 1 } },
      requiredEvidence: "Release-day pre-submission check.",
      nextStep: {
        provide: "PUBLIC_REPO_CLONE_PATH=<fresh-clone-path>",
        validateWith: "PUBLIC_REPO_CLONE_PATH=<fresh-clone-path> bash scripts/pre-submission-check.sh",
      },
    },
    video: {
      id: "video",
      label: "local S7 video evidence",
      planItems: ["S7"],
      detail: "video-evidence.json is missing",
      categories: { video: { total: 1, failed: 1 } },
      requiredEvidence: "Real local video evidence.",
      nextStep: {
        copyFrom: "docs/reports/submission/video-evidence.template.json",
        writeTo: "docs/reports/submission/video-evidence.json",
        validateWith: "npm run check:video-evidence -- --file docs/reports/submission/video-evidence.json",
      },
    },
    "public-repo": {
      id: "public-repo",
      label: "S8 public repository fresh clone",
      planItems: ["S8"],
      detail: "requires --public-repo <fresh-clone-path>",
      categories: { "public-repo": { total: 1, failed: 1 } },
      requiredEvidence: "Fresh clone path for the published AI system repository.",
      nextStep: {
        provide: "--public-repo <fresh-clone-path> or PUBLIC_REPO_CLONE_PATH",
        validateWith: "npm run check:public-repo -- --repo <fresh-clone-path>",
      },
    },
    defense: {
      id: "defense",
      label: "S10 Q&A rehearsal evidence",
      planItems: ["S10"],
      detail: "defense evidence is missing",
      categories: { defense: { total: 1, failed: 1 } },
      requiredEvidence: "Real Q&A rehearsal evidence.",
      nextStep: {
        copyFrom: "docs/reports/submission/defense-rehearsal-evidence.template.json",
        writeTo: "docs/reports/submission/defense-rehearsal-evidence.json",
        validateWith: "npm run check:defense-rehearsal -- --file docs/reports/submission/defense-rehearsal-evidence.json",
      },
    },
    u6: {
      id: "u6",
      label: "U6 timed rehearsal manifest",
      planItems: ["U6"],
      detail: "u6 manifest is missing",
      categories: { u6: { total: 1, failed: 1 } },
      requiredEvidence: "Real timed U6 rehearsal manifest.",
      nextStep: {
        copyFrom: "docs/reports/submission/u6-rehearsal-manifest.template.json",
        writeTo: "docs/reports/submission/u6-rehearsal-manifest.json",
        validateWith: "npm run check:u6 -- --manifest docs/reports/submission/u6-rehearsal-manifest.json",
      },
    },
  };
  const order = ["external", "pre-submission", "video", "public-repo", "defense", "u6"];
  const blockers = order.map((id) => blockersById[id]);
  return {
    mode: "submission-gates-check",
    status: "failed",
    projectRoot,
    gateCounts: { total: 6, passed: 0, failed: 6 },
    delegatedCheckCounts: { total: 6, passed: 0, failed: 6 },
    blockerCount: blockers.length,
    openPlanItems: ["U6", "S6", "S7", "S8", "S9", "S10"],
    blockers,
    nextSteps: blockers.map((blocker) => ({
      id: blocker.id,
      label: blocker.label,
      ...blocker.nextStep,
    })),
  };
}

async function writeText(projectRoot, relativePath, text) {
  await mkdir(path.dirname(path.join(projectRoot, relativePath)), { recursive: true });
  await writeFile(path.join(projectRoot, relativePath), text);
}

async function chmodExecutable(filePath) {
  await chmod(filePath, 0o755);
}

async function runNextSteps(projectRoot, args = [], options) {
  const result = await runNextStepsRaw(projectRoot, args, options);
  return {
    code: result.code,
    summary: JSON.parse(result.stdout),
    stderr: result.stderr,
  };
}

async function runNextStepsRaw(projectRoot, args = [], { useProjectRootEnv = true } = {}) {
  const env = { ...process.env };
  if (useProjectRootEnv) env.SUBMISSION_GATES_PROJECT_ROOT = projectRoot;
  else delete env.SUBMISSION_GATES_PROJECT_ROOT;
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [
      path.join(projectRoot, "scripts/submission-next-steps.mjs"),
      ...args,
    ], {
      cwd: projectRoot,
      env,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return {
      code: error.code,
      stdout: error.stdout,
      stderr: error.stderr,
    };
  }
}

async function runShellRaw(scriptPath, options = {}) {
  try {
    const { stdout, stderr } = await execFileAsync("bash", [scriptPath], options);
    return { code: 0, stdout, stderr };
  } catch (error) {
    return {
      code: error.code,
      stdout: error.stdout,
      stderr: error.stderr,
    };
  }
}

async function runPackageScriptRaw(projectRoot, scriptName) {
  try {
    const { stdout, stderr } = await execFileAsync("npm", ["run", scriptName], {
      cwd: projectRoot,
      env: { ...process.env, SUBMISSION_GATES_PROJECT_ROOT: projectRoot },
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return {
      code: error.code,
      stdout: error.stdout,
      stderr: error.stderr,
    };
  }
}
