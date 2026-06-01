# Requirement

```json
{
  "id": "REQ-L1-ARTICLE-WORD-COUNT",
  "source_input": "在文章详情页根据 Article.body 做字数统计展示。",
  "goal": "文章详情页展示正文字数统计",
  "scope": {
    "include": [
      "文章详情",
      "字数统计",
      "Article.body"
    ],
    "exclude": [
      "后端 schema",
      "数据库迁移"
    ]
  },
  "assumptions": [
    "字数基于 Article.body 前端计算"
  ],
  "clarifications": [
    "仅在详情页展示字数，不改动后端"
  ],
  "acceptance": [
    "文章详情页显示 words 计数",
    "变更落在 Conduit frontend 路径"
  ],
  "level": "L1"
}
```
