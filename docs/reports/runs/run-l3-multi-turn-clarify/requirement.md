# Requirement

```json
{
  "id": "REQ-ARTICLE-001",
  "source_input": "优化一下文章页面，加点小信息让用户停留更久",
  "goal": "在文章详情页正文末尾添加字数统计展示，以提升用户停留时间。",
  "scope": {
    "include": [
      "在文章详情页前端添加字数统计展示",
      "使用前端假数据基于Article.body长度估算字数"
    ],
    "exclude": [
      "后端修改",
      "数据库修改",
      "API新增"
    ]
  },
  "assumptions": [
    "前端使用假数据，无需后端支持",
    "本次不进行用户停留时间埋点"
  ],
  "clarifications": [
    "优化方面：在文章详情页正文末尾加字数统计",
    "信息内容：展示『字数：X』，样式沿用现有UI",
    "数据来源：前端基于Article.body字符串长度估算",
    "目标：仅显示字数，不进行停留时间测量",
    "约束：严格前端-only，无后端变更"
  ],
  "acceptance": [
    "字数统计正确显示在文章正文末尾",
    "样式与现有word count UI一致",
    "前端基于Article.body估算字数，数据准确"
  ],
  "level": "L1"
}
```
