export function buildRequirement(input) {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Requirement input is required");
  }

  if (/草稿|draft/i.test(trimmed)) {
    return draftRequirement(trimmed);
  }

  if (/评论点赞|comment\s*like|评论.*like/i.test(trimmed)) {
    return commentLikeRequirement(trimmed);
  }

  if (/封面图|cover image|封面/i.test(trimmed)) {
    return coverImageRequirement(trimmed);
  }

  if (/字数|word count|详情页/i.test(trimmed)) {
    return wordCountRequirement(trimmed);
  }

  if (/popular tags|标签|前\s*5|top\s*5/i.test(trimmed)) {
    return popularTagsRequirement(trimmed);
  }

  if (/文章列表|article list|阅读量|reads?|read count|展示字段/i.test(trimmed)) {
    return readCountRequirement(trimmed);
  }

  throw new Error(`Rules mode cannot classify requirement: ${trimmed}`);
}

function readCountRequirement(trimmed) {
  return {
    id: "REQ-L1-ARTICLE-READS",
    source_input: trimmed,
    goal: "文章列表卡片展示阅读量",
    scope: {
      include: [
        "文章列表",
        "阅读量",
        "前端展示字段",
        "Conduit frontend article preview",
      ],
      exclude: ["后端 schema", "数据库迁移", "真实阅读量统计"],
    },
    assumptions: [
      "P0 使用前端确定性假数据展示阅读量",
      "阅读量展示在 ArticlePreview 卡片的 Read more 附近",
    ],
    clarifications: [
      "阅读量来源按 P0 题面使用前端假数据",
      "本次不修改后端和数据库",
    ],
    acceptance: [
      "文章列表每张卡片显示 eye icon 和 reads 数字",
      "变更落在真实 Conduit frontend 路径",
      "运行 Conduit 真实测试脚本并记录结果",
    ],
    level: "L1",
  };
}

function draftRequirement(trimmed) {
  return {
    id: "REQ-L2-ARTICLE-DRAFT",
    source_input: trimmed,
    goal: "文章列表与 API 展示草稿状态",
    scope: {
      include: ["文章列表", "草稿", "draft", "frontend", "backend API"],
      exclude: ["复杂工作流", "邮件通知"],
    },
    assumptions: [
      "草稿字段默认 false，列表与 API 一致",
    ],
    clarifications: [
      "草稿状态在列表卡片与 Article API 响应中同时可见",
    ],
    acceptance: [
      "文章列表卡片展示 Draft 标记",
      "Article 模型与 API 返回 draft 字段",
      "diff 同时包含 frontend 与 backend 路径",
    ],
    level: "L2",
  };
}

function commentLikeRequirement(trimmed) {
  return {
    id: "REQ-L2-COMMENT-LIKE",
    source_input: trimmed,
    goal: "为评论增加点赞计数 (likeCount) 跨栈实现",
    scope: {
      include: [
        "Comment 模型 likeCount 字段",
        "评论点赞 controller + route",
        "CommentList 点赞按钮",
        "comment like",
      ],
      exclude: ["匿名点赞限频", "点赞撤销", "评论列表分页"],
    },
    assumptions: [
      "likeCount 字段默认 0",
      "POST /api/articles/:slug/comments/:commentId/like 接口幂等递增",
      "前端按钮不做去重，只触发 POST 并显示返回值",
    ],
    clarifications: [
      "前后端字段命名统一使用 likeCount",
      "评论组件 CommentList.jsx 增加点赞按钮 + 计数展示",
    ],
    acceptance: [
      "Comment 模型含 likeCount: DataTypes.INTEGER",
      "controllers/comments.js 含 likeComment 处理器",
      "routes/articles/comments.js 含 POST /:slug/comments/:commentId/like",
      "CommentList.jsx 含 comment-like-button 与 comment-like-count",
    ],
    level: "L2",
  };
}

function coverImageRequirement(trimmed) {
  return {
    id: "REQ-L2-ARTICLE-COVER-IMAGE",
    source_input: trimmed,
    goal: "为 Article 模型新增 coverImage 字段并自动同步前端类型/服务/Mock",
    scope: {
      include: [
        "Article 模型",
        "coverImage 字段",
        "封面图",
        "cover image",
        "frontend types",
        "frontend services",
        "frontend mocks",
      ],
      exclude: ["图片上传服务", "CDN", "缩略图生成"],
    },
    assumptions: [
      "新增字段类型为 STRING（存放图片 URL）",
      "前端 TS 类型 / fetch service / mock 三件套由 schemaDriver 推断并自动生成",
    ],
    clarifications: [
      "schemaDriver 推断目标文件，Skill 文件不手写 targetPaths",
      "cover image 字段在前端 mock 用占位字符串",
    ],
    acceptance: [
      "diff 同时包含 backend/models/Article.js 与 frontend/src/types/Article.ts 等多路径",
      "Skill 文件 articleCoverImage.js 不声明 targetPaths",
      "plan.md 标注 target_files_source=schema-driven",
    ],
    level: "L2",
  };
}

function popularTagsRequirement(trimmed) {
  return {
    id: "REQ-L1-POPULAR-TAGS-TOP-FIVE",
    source_input: trimmed,
    goal: "Popular Tags 前 5 个打标",
    scope: {
      include: ["Popular Tags", "标签", "前 5", "Conduit frontend sidebar"],
      exclude: ["后端 schema", "数据库迁移"],
    },
    assumptions: [
      "仅展示前 5 个标签并高亮",
      "不改后端 API",
    ],
    clarifications: [
      "标签数量限制为 5 个",
      "通过 CSS 类区分 top 5 标签",
    ],
    acceptance: [
      "Popular Tags 区域最多展示 5 个标签",
      "top 5 标签有视觉高亮",
      "变更落在 Conduit frontend 路径",
    ],
    level: "L1",
  };
}

function wordCountRequirement(trimmed) {
  return {
    id: "REQ-L1-ARTICLE-WORD-COUNT",
    source_input: trimmed,
    goal: "文章详情页展示正文字数统计",
    scope: {
      include: ["文章详情", "字数统计", "Article.body"],
      exclude: ["后端 schema", "数据库迁移"],
    },
    assumptions: [
      "字数基于 Article.body 前端计算",
    ],
    clarifications: [
      "仅在详情页展示字数，不改动后端",
    ],
    acceptance: [
      "文章详情页显示 words 计数",
      "变更落在 Conduit frontend 路径",
    ],
    level: "L1",
  };
}
