# Plan

```json
{
  "summary": "在 Profile 页面用户信息区域展示本地估算的注册天数提示。",
  "requirement_id": "REQ-U6-PROFILE_ACCOUNT_AGE",
  "skill_id": "profile-account-age",
  "skill_version": "1.0.0",
  "target_files": [
    "frontend/src/routes/Profile/Profile.jsx",
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
    "startedAt": "2026-06-02T09:18:00+08:00",
    "endedAt": "2026-06-02T09:29:10+08:00"
  },
  "risks": [
    "录屏文件需由人工保留；本地 checker 只校验证据文件存在性"
  ]
}
```
