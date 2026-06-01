import { applySchemaDrivenChange } from "./schemaDrivenSkill.js";
import { DEFAULT_VALIDATION } from "./skillHelpers.js";

const SCHEMA_CHANGE = Object.freeze({
  model: "Article",
  field: "coverImage",
  type: "STRING",
  op: "add",
});

export const articleCoverImageSkill = Object.freeze({
  id: "article-cover-image",
  version: "1.0.0",
  intent: "为文章模型新增 coverImage 字段并自动同步前端类型/服务/Mock",
  planSummary: "schemaDriver 推断目标文件，frontendGenerators 生成跨栈三件套；Skill 不手写 targetPaths。",
  appliesWhen: ["封面图", "cover image", "封面"],
  schemaChange: SCHEMA_CHANGE,
  validation: DEFAULT_VALIDATION,
});

export function applyArticleCoverImage(sandbox) {
  return applySchemaDrivenChange(sandbox, SCHEMA_CHANGE);
}
