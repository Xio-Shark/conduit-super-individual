import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import path from "node:path";

const TEAM_INFO_PATH = "docs/reports/submission/team-info.md";
const PENDING_PATTERN = /待填|待部署|待录制|待发布|待人工|TODO|TBD|placeholder/i;
const URL_PATTERN = /https?:\/\/[^\s|)]+/i;

const SUBMISSION_ITEMS = Object.freeze([
  { id: "demo", label: "在线 Demo 链接", path: TEAM_INFO_PATH, statusFrom: (content) => externalLinkStatus(content, "在线 Demo") },
  { id: "video", label: "3-8 分钟演示视频", path: TEAM_INFO_PATH, statusFrom: (content) => externalLinkStatus(content, "演示视频") },
  { id: "repository", label: "公开源代码仓库链接", path: TEAM_INFO_PATH, statusFrom: (content) => externalLinkStatus(content, "AI 系统主仓") },
  { id: "team_info", label: "团队信息与分工", path: TEAM_INFO_PATH, statusFrom: teamInfoStatus },
  { id: "readme", label: "README / 运行说明", path: "README.md" },
  { id: "architecture", label: "系统架构说明", path: "docs/reports/submission/architecture.md" },
  { id: "ai_usage", label: "AI 使用说明", path: "docs/reports/submission/ai-usage.md" },
  { id: "engineering_notes", label: "工程难点说明", path: "docs/reports/submission/engineering-notes.md" },
  { id: "checklist", label: "提交清单", path: "docs/reports/submission/checklist.md", statusFrom: checklistStatus },
]);

export function buildSubmissionItems(projectRoot) {
  return SUBMISSION_ITEMS.map((item) => {
    if (!item.path) return { ...item };

    const absolutePath = path.join(projectRoot, item.path);
    return {
      id: item.id,
      label: item.label,
      path: item.path,
      status: submissionFileStatus(absolutePath, item.statusFrom),
    };
  });
}

function submissionFileStatus(absolutePath, statusFrom) {
  if (!existsSync(absolutePath)) return "missing";
  const content = readFileSync(absolutePath, "utf8");
  if (!content.trim()) return "invalid";
  return statusFrom ? statusFrom(content) : "generated";
}

function externalLinkStatus(content, label) {
  const row = findTableRow(content, label);
  if (!row) return "missing";
  return isReadyExternalLink(row) ? "provided_unverified" : "pending_human";
}

function teamInfoStatus(content) {
  const requiredTextRows = ["团队名称", "成员名单"];
  const requiredLinkRows = ["在线 Demo", "演示视频", "AI 系统主仓"];
  if (requiredTextRows.some((label) => !isReadyTextRow(content, label))) return "pending_human";
  if (requiredLinkRows.some((label) => externalLinkStatus(content, label) !== "provided_unverified")) return "pending_human";
  return "generated";
}

function checklistStatus(content) {
  return /\[ \]/.test(content) || PENDING_PATTERN.test(content) ? "pending_human" : "generated";
}

function isReadyTextRow(content, label) {
  const row = findTableRow(content, label);
  const value = row?.split("|").at(2)?.trim();
  return Boolean(value && !PENDING_PATTERN.test(row));
}

function isReadyExternalLink(row) {
  return !PENDING_PATTERN.test(row) && URL_PATTERN.test(row);
}

function findTableRow(content, label) {
  return content
    .split("\n")
    .find((line) => line.startsWith("|") && line.includes(label));
}
