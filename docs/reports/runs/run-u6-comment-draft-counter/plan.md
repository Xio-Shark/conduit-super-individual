# Plan

```json
{
  "summary": "在 CommentEditor 中展示评论草稿剩余字数，不修改后端。",
  "requirement_id": "REQ-U6-COMMENT_DRAFT_COUNTER",
  "skill_id": "comment-draft-counter",
  "skill_version": "1.0.0",
  "target_files": [
    "frontend/src/components/CommentEditor/CommentEditor.jsx",
    "frontend/src/styles.css"
  ],
  "target_files_source": "u6-skill-targets",
  "validation_commands": [
    "npm run lint:sandbox",
    "npm test"
  ],
  "plan_mode": "rules",
  "source": "u6-manual-rehearsal",
  "rehearsal_window": {
    "startedAt": "2026-06-02T09:00:00+08:00",
    "endedAt": "2026-06-02T09:11:20+08:00"
  },
  "risks": [
    "录屏文件需由人工保留；本地 checker 只校验证据文件存在性"
  ]
}
```
