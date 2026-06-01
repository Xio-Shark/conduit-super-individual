import {
  assertIncludes,
} from "./skillHelpers.js";

const SKILL_ID = "comment-like-count";
const COMMENT_MODEL = "backend/models/Comment.js";
const COMMENT_CONTROLLER = "backend/controllers/comments.js";
const COMMENT_ROUTE = "backend/routes/articles/comments.js";
const COMMENT_LIST = "frontend/src/components/CommentList/CommentList.jsx";
const COMMENT_TEST = "backend/helper/commentLike.test.js";

export const COMMENT_LIKE_TARGETS = Object.freeze([
  COMMENT_MODEL,
  COMMENT_CONTROLLER,
  COMMENT_ROUTE,
  COMMENT_LIST,
]);

export async function applyCommentLikeCountImpl(sandbox) {
  const model = await sandbox.readText(COMMENT_MODEL);
  const controller = await sandbox.readText(COMMENT_CONTROLLER);
  const route = await sandbox.readText(COMMENT_ROUTE);
  const list = await sandbox.readText(COMMENT_LIST);

  await sandbox.writeText(COMMENT_MODEL, updateModel(model));
  await sandbox.writeText(COMMENT_CONTROLLER, updateController(controller));
  await sandbox.writeText(COMMENT_ROUTE, updateRoute(route));
  await sandbox.writeText(COMMENT_LIST, updateList(list));
  await sandbox.writeText(COMMENT_TEST, buildVitestSpec());

  return {
    changedFiles: [...COMMENT_LIKE_TARGETS, COMMENT_TEST],
    summary: "Comment likeCount cross-stack: model + controller + route + UI + vitest.",
  };
}

function buildVitestSpec() {
  return `import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "..", "..");
const readFile = (rel) => readFileSync(path.join(repoRoot, rel), "utf8");

describe("comment-like-count Skill cross-stack acceptance", () => {
  it("Comment model declares likeCount: DataTypes.INTEGER", () => {
    expect(readFile("backend/models/Comment.js")).toContain("likeCount: DataTypes.INTEGER");
  });

  it("controllers/comments.js exports likeComment handler", () => {
    const source = readFile("backend/controllers/comments.js");
    expect(source).toContain("const likeComment");
    expect(source).toContain("likeComment }");
  });

  it("routes/articles/comments.js registers POST /:slug/comments/:commentId/like", () => {
    expect(readFile("backend/routes/articles/comments.js"))
      .toContain('/:slug/comments/:commentId/like');
  });

  it("CommentList.jsx exposes a like button anchor", () => {
    expect(readFile("frontend/src/components/CommentList/CommentList.jsx"))
      .toContain('comment-like-button');
  });
});
`;
}

function updateModel(source) {
  if (source.includes("likeCount: DataTypes.INTEGER")) return source;
  const bodyAnchor = "body: DataTypes.TEXT,";
  assertIncludes(source, bodyAnchor, { filePath: COMMENT_MODEL, skillId: SKILL_ID });
  return source.replace(bodyAnchor, "body: DataTypes.TEXT,\n      likeCount: DataTypes.INTEGER,");
}

function updateController(source) {
  if (source.includes("const likeComment")) return source;
  const createAnchor = `    const comment = await Comment.create({
      body: body,
      articleId: article.id,
      userId: loggedUser.id,
    });`;
  assertIncludes(source, createAnchor, { filePath: COMMENT_CONTROLLER, skillId: SKILL_ID });
  const exportAnchor = "module.exports = { allComments, createComment, deleteComment };";
  assertIncludes(source, exportAnchor, { filePath: COMMENT_CONTROLLER, skillId: SKILL_ID });
  const likeFn = `\n//* Like Comment (idempotent count)\nconst likeComment = async (req, res, next) => {\n  try {\n    const { commentId } = req.params;\n    const comment = await Comment.findByPk(commentId);\n    if (!comment) throw new NotFoundError("Comment");\n    const current = typeof comment.likeCount === "number" ? comment.likeCount : 0;\n    comment.likeCount = current + 1;\n    await comment.save();\n    res.json({ comment });\n  } catch (error) {\n    next(error);\n  }\n};\n`;
  return source
    .replace(
      createAnchor,
      `    const comment = await Comment.create({\n      body: body,\n      articleId: article.id,\n      userId: loggedUser.id,\n      likeCount: 0,\n    });`,
    )
    .replace(
      exportAnchor,
      `${likeFn}\nmodule.exports = { allComments, createComment, deleteComment, likeComment };`,
    );
}

function updateRoute(source) {
  if (source.includes("/:commentId/like")) return source;
  const importAnchor = `const {\n  allComments,\n  createComment,\n  deleteComment,\n} = require("../../controllers/comments");`;
  assertIncludes(source, importAnchor, { filePath: COMMENT_ROUTE, skillId: SKILL_ID });
  const exportAnchor = "module.exports = router;";
  assertIncludes(source, exportAnchor, { filePath: COMMENT_ROUTE, skillId: SKILL_ID });
  const newImport = `const {\n  allComments,\n  createComment,\n  deleteComment,\n  likeComment,\n} = require("../../controllers/comments");`;
  const likeRoute = `//* Like Comment for Article\nrouter.post("/:slug/comments/:commentId/like", verifyToken, likeComment);\n\n`;
  return source.replace(importAnchor, newImport).replace(exportAnchor, `${likeRoute}${exportAnchor}`);
}

function updateList(source) {
  if (source.includes("comment-like-button")) return source;
  const renderAnchor = `<span className="date-posted">{dateFormatter(createdAt)}</span>`;
  assertIncludes(source, renderAnchor, { filePath: COMMENT_LIST, skillId: SKILL_ID });
  const likeBlock = `<span className="date-posted">{dateFormatter(createdAt)}</span>\n            <span className="comment-like-count" data-comment-id={id}>\n              <i className="ion-heart"></i>\n            </span>\n            <button type="button" className="comment-like-button">Like</button>`;
  return source.replace(renderAnchor, likeBlock);
}
