# Requirement

```json
{
  "id": "REQ-U6-COMMENT_DRAFT_COUNTER",
  "source_input": "给评论输入框加 280 字数倒计数，comment draft counter，只改前端",
  "goal": "评论输入框字数倒计数",
  "scope": {
    "include": [
      "frontend/src/components/CommentEditor/CommentEditor.jsx",
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
