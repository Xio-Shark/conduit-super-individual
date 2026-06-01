# Requirement

```json
{
  "id": "REQ-L1-ARTICLE-READS",
  "source_input": "给文章列表加阅读量展示，前端假数据即可，不改后端。",
  "goal": "文章列表卡片展示阅读量",
  "scope": {
    "include": [
      "文章列表",
      "阅读量",
      "前端展示字段"
    ],
    "exclude": [
      "后端schema变更",
      "数据库迁移操作"
    ]
  },
  "assumptions": [
    "P0阶段使用前端硬编码假数据填充阅读量"
  ],
  "clarifications": [
    "完全不改动后端相关逻辑与接口定义"
  ],
  "acceptance": [
    "文章列表每张卡片正常展示阅读量字段",
    "所有代码变更仅作用于Conduit前端项目路径下"
  ],
  "level": "L1"
}
```
