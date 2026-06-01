# Requirement

```json
{
  "id": "REQ-L2-ARTICLE-DRAFT",
  "source_input": "给文章列表加上草稿状态展示，前后端 API 和列表卡片都要能看到 draft。",
  "goal": "文章列表与 API 展示草稿状态",
  "scope": {
    "include": [
      "文章列表",
      "草稿",
      "draft",
      "frontend",
      "backend API"
    ],
    "exclude": [
      "复杂工作流",
      "邮件通知"
    ]
  },
  "assumptions": [
    "草稿字段默认 false，列表与 API 一致"
  ],
  "clarifications": [
    "草稿状态在列表卡片与 Article API 响应中同时可见"
  ],
  "acceptance": [
    "文章列表卡片展示 Draft 标记",
    "Article 模型与 API 返回 draft 字段",
    "diff 同时包含 frontend 与 backend 路径"
  ],
  "level": "L2"
}
```
