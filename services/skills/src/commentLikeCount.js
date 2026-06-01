import {
  applyCommentLikeCountImpl,
  COMMENT_LIKE_TARGETS,
} from "./commentLikeCountApply.js";
import { DEFAULT_VALIDATION } from "./skillHelpers.js";

export const commentLikeCountSkill = Object.freeze({
  id: "comment-like-count",
  version: "1.0.0",
  intent: "为评论增加点赞计数 (likeCount) 跨栈实现",
  planSummary: "Comment 模型加 likeCount + likeComment 控制器 + POST /:slug/comments/:commentId/like 路由 + CommentList 点赞按钮（落点完全脱离文章列表）。",
  appliesWhen: ["评论点赞", "评论 like", "comment like", "comment_like"],
  targetPaths: COMMENT_LIKE_TARGETS,
  validation: DEFAULT_VALIDATION,
});

export function applyCommentLikeCount(sandbox) {
  return applyCommentLikeCountImpl(sandbox);
}
