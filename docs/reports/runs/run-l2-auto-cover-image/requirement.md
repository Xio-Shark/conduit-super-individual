# Requirement

```json
{
  "id": "REQ-L2-ARTICLE-COVER-IMAGE",
  "source_input": "为文章加封面图字段",
  "goal": "为 Article 模型新增 coverImage 字段并自动同步前端类型/服务/Mock",
  "scope": {
    "include": [
      "Article 模型",
      "coverImage 字段",
      "封面图",
      "cover image",
      "frontend types",
      "frontend services",
      "frontend mocks"
    ],
    "exclude": [
      "图片上传服务",
      "CDN",
      "缩略图生成"
    ]
  },
  "assumptions": [
    "新增字段类型为 STRING（存放图片 URL）",
    "前端 TS 类型 / fetch service / mock 三件套由 schemaDriver 推断并自动生成"
  ],
  "clarifications": [
    "schemaDriver 推断目标文件，Skill 文件不手写 targetPaths",
    "cover image 字段在前端 mock 用占位字符串"
  ],
  "acceptance": [
    "diff 同时包含 backend/models/Article.js 与 frontend/src/types/Article.ts 等多路径",
    "Skill 文件 articleCoverImage.js 不声明 targetPaths",
    "plan.md 标注 target_files_source=schema-driven"
  ],
  "level": "L2"
}
```
