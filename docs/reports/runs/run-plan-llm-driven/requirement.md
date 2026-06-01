# Requirement

```json
{
  "id": "REQ-L1-ARTICLE-READS",
  "source_input": "给文章列表加阅读量展示，前端假数据即可，不改后端",
  "goal": "文章列表卡片展示阅读量",
  "scope": {
    "include": [
      "文章列表",
      "阅读量",
      "前端展示字段",
      "Conduit frontend article preview"
    ],
    "exclude": [
      "后端 schema",
      "数据库迁移",
      "真实阅读量统计"
    ]
  },
  "assumptions": [
    "P0 使用前端确定性假数据展示阅读量",
    "阅读量展示在 ArticlePreview 卡片的 Read more 附近"
  ],
  "clarifications": [
    "阅读量来源按 P0 题面使用前端假数据",
    "本次不修改后端和数据库"
  ],
  "acceptance": [
    "文章列表每张卡片显示 eye icon 和 reads 数字",
    "变更落在真实 Conduit frontend 路径",
    "运行 Conduit 真实测试脚本并记录结果"
  ],
  "level": "L1"
}
```
