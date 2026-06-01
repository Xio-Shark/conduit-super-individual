# Plan

```json
{
  "summary": "Comment 模型加 likeCount + likeComment 控制器 + POST /:slug/comments/:commentId/like 路由 + CommentList 点赞按钮（落点完全脱离文章列表）。",
  "requirement_id": "REQ-L2-COMMENT-LIKE",
  "skill_id": "comment-like-count",
  "skill_version": "1.0.0",
  "impacted_modules": [
    "frontend",
    "backend"
  ],
  "impact_matrix": {
    "level": "L2",
    "modules": [
      "frontend",
      "backend"
    ],
    "frontend_paths": [
      "frontend/src/components/CommentList/CommentList.jsx"
    ],
    "backend_paths": [
      "backend/models/Comment.js",
      "backend/controllers/comments.js",
      "backend/routes/articles/comments.js"
    ],
    "cross_stack": true
  },
  "history_references": [
    {
      "run_id": "run-2026-05-21T06-24-30-577Z",
      "goal": "Add read count display to the article list in the Conduit frontend using fake data without backend modifications.",
      "skill_id": "article-list-display-field",
      "score": 0.278,
      "summary": "在 Conduit 文章列表卡片增加确定性阅读量展示。",
      "match_type": "both",
      "similarity_score": 0.257
    },
    {
      "run_id": "run-2026-05-21T05-57-20-736Z",
      "goal": "优化 Conduit 前端文章列表的视觉展示，增加数据指标显示，保持最小代码改动",
      "skill_id": "article-list-display-field",
      "score": 0.167,
      "summary": "在 Conduit 文章列表卡片增加确定性阅读量展示。",
      "match_type": "both",
      "similarity_score": 0.229
    },
    {
      "run_id": "run-2026-05-21T06-21-56-710Z",
      "goal": "Popular Tags 前 5 个打标",
      "skill_id": "popular-tags-top-five",
      "score": 0.167,
      "summary": "在 Conduit 文章列表卡片增加确定性阅读量展示。",
      "match_type": "both",
      "similarity_score": 0.189
    }
  ],
  "target_files": [
    "backend/models/Comment.js",
    "backend/controllers/comments.js",
    "backend/routes/articles/comments.js",
    "frontend/src/components/CommentList/CommentList.jsx"
  ],
  "target_files_source": "skill-targets",
  "schema_resolution": null,
  "sandbox_index": {
    "fileCount": 130,
    "frontendFiles": 97,
    "backendFiles": 33,
    "targets": [
      {
        "path": "backend/models/Comment.js",
        "exists": true,
        "exports": [],
        "imports": []
      },
      {
        "path": "backend/controllers/comments.js",
        "exists": true,
        "exports": [],
        "imports": []
      },
      {
        "path": "backend/routes/articles/comments.js",
        "exists": true,
        "exports": [],
        "imports": []
      },
      {
        "path": "frontend/src/components/CommentList/CommentList.jsx",
        "exists": true,
        "exports": [],
        "imports": [
          "react",
          "react-router-dom",
          "../../context/AuthContext",
          "../../helpers/dateFormatter",
          "../../services/deleteComment",
          "../../services/getComments",
          "./CommentAuthor"
        ]
      }
    ]
  },
  "risks": [
    "Conduit 根仓没有 lint script 时由实现仓库 ESLint 检查本次改动文件",
    "L2 跨栈改动须保持 API 字段与前端展示一致"
  ],
  "validation_commands": [
    "npm run lint:sandbox",
    "npm test"
  ],
  "plan_mode": "rules",
  "source": "rules-driven",
  "ai_call": null
}
```
