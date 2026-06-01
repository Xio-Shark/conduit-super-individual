# Requirement

```json
{
  "id": "REQ-U6-ARTICLE_FAVORITE_FILTER_TOGGLE",
  "source_input": "给文章列表加收藏状态筛选开关，favorite filter，只做前端本地过滤",
  "goal": "文章卡片收藏状态筛选开关",
  "scope": {
    "include": [
      "frontend/src/components/ArticlesPreview/ArticlesPreview.jsx",
      "frontend/src/styles.css"
    ],
    "exclude": [
      "Orchestrator 主干",
      "Agent 主干",
      "API 主干"
    ]
  },
  "assumptions": [
    "U6 计时演练只新增 Skill 层能力并作用到 sandbox-repo"
  ],
  "clarifications": [
    "本题用于答辩前本地计时演练，不作为外部公开视频证据"
  ],
  "acceptance": [
    "新增 Skill 文件已注册",
    "sandbox-repo 产生非空 diff",
    "本地验证通过",
    "计时不超过 15 分钟"
  ],
  "level": "U6"
}
```
