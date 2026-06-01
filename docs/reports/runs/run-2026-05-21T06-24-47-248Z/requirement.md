# Requirement

```json
{
  "id": "REQ-L1-POPULAR-TAGS-TOP-FIVE",
  "source_input": "Popular Tags 前 5 个打标，纯前端",
  "goal": "Popular Tags 前 5 个打标",
  "scope": {
    "include": [
      "Popular Tags",
      "标签",
      "前 5",
      "Conduit frontend sidebar"
    ],
    "exclude": [
      "后端 schema",
      "数据库迁移"
    ]
  },
  "assumptions": [
    "仅展示前 5 个标签并高亮",
    "不改后端 API"
  ],
  "clarifications": [
    "标签数量限制为 5 个",
    "通过 CSS 类区分 top 5 标签"
  ],
  "acceptance": [
    "Popular Tags 区域最多展示 5 个标签",
    "top 5 标签有视觉高亮",
    "变更落在 Conduit frontend 路径"
  ],
  "level": "L1"
}
```
