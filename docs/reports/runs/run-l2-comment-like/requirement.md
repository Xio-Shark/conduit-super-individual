# Requirement

```json
{
  "id": "REQ-L2-COMMENT-LIKE",
  "source_input": "在评论加点赞计数 comment like",
  "goal": "为评论增加点赞计数 (likeCount) 跨栈实现",
  "scope": {
    "include": [
      "Comment 模型 likeCount 字段",
      "评论点赞 controller + route",
      "CommentList 点赞按钮",
      "comment like"
    ],
    "exclude": [
      "匿名点赞限频",
      "点赞撤销",
      "评论列表分页"
    ]
  },
  "assumptions": [
    "likeCount 字段默认 0",
    "POST /api/articles/:slug/comments/:commentId/like 接口幂等递增",
    "前端按钮不做去重，只触发 POST 并显示返回值"
  ],
  "clarifications": [
    "前后端字段命名统一使用 likeCount",
    "评论组件 CommentList.jsx 增加点赞按钮 + 计数展示"
  ],
  "acceptance": [
    "Comment 模型含 likeCount: DataTypes.INTEGER",
    "controllers/comments.js 含 likeComment 处理器",
    "routes/articles/comments.js 含 POST /:slug/comments/:commentId/like",
    "CommentList.jsx 含 comment-like-button 与 comment-like-count"
  ],
  "level": "L2"
}
```
