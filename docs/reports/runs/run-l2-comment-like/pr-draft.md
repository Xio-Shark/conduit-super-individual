# PR Draft: 为评论增加点赞计数 (likeCount) 跨栈实现

## Requirement
在评论加点赞计数 comment like

## Plan
Comment 模型加 likeCount + likeComment 控制器 + POST /:slug/comments/:commentId/like 路由 + CommentList 点赞按钮（落点完全脱离文章列表）。

## Files Changed
- backend/controllers/comments.js
- backend/helper/commentLike.test.js
- backend/models/Comment.js
- backend/routes/articles/comments.js
- frontend/src/components/CommentList/CommentList.jsx

## Verification
- npm run lint:sandbox: exit 0
- npm run test: exit 0

## Risks
- Conduit 根仓没有 lint script 时由实现仓库 ESLint 检查本次改动文件
- L2 跨栈改动须保持 API 字段与前端展示一致

## Rollback
Revert the generated patch or discard the branch before submitting PR.

## Diff Summary
diff --git a/backend/controllers/comments.js b/backend/controllers/comments.js
diff --git a/backend/helper/commentLike.test.js b/backend/helper/commentLike.test.js
diff --git a/backend/models/Comment.js b/backend/models/Comment.js
diff --git a/backend/routes/articles/comments.js b/backend/routes/articles/comments.js
diff --git a/frontend/src/components/CommentList/CommentList.jsx b/frontend/src/components/CommentList/CommentList.jsx
