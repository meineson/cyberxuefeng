# 开发进度文档

## 项目名称

**赛博雪峰** - 基于 AgentSkills 的智能对话服务

---

## 2026-04-09 Phase 1 ✅ 完成

### 完成内容

| 功能 | 文件 | 说明 |
|------|------|------|
| 技能加载器 | `zhangxuefeng/skill.js` | 解析 SKILL.md 的 YAML frontmatter |
| LangChain Agent | `zhangxuefeng/agent.js` | 使用 ChatOpenAI，system prompt = SKILL.md |
| API 路由 | `zhangxuefeng/routes.js` | `/api/chat`, `/api/skill/info`, `/api/chat/reset` |
| Express 服务 | `server.js` | 主服务，静态文件 + API |
| Web 前端 | `public/index.html` | 聊天界面，localStorage 存历史 |
| npm 脚本 | `package.json` | `npm run zhangxuefeng` |

---

## 2026-04-09 Phase 2 ✅ 完成

### 完成内容

| 功能 | 文件 | 说明 |
|------|------|------|
| 密码认证 | `zhangxuefeng/auth.js` | `/api/auth/verify`, `/api/auth/status` |
| 前端认证界面 | `public/index.html` | 密码输入遮罩，localStorage 存认证状态 |
| 技能路径配置 | `.env`, `skill.js` | `SKILL_PATH` 环境变量，支持多技能切换 |
| 实现计划文档 | `docs/IMPLEMENTATION_PLAN.md` | 项目概述和阶段规划 |
| API 接口规范 | `docs/API_SPEC.md` | 完整接口文档 |

### 新增 .env 配置

```env
AUTH_PASSWORD=zhangxuefeng2026
SKILL_PATH=/Users/mac/.agents/skills/zhangxuefeng-perspective
```

---

## 2026-04-09 Phase 3 ✅ 完成

### 完成内容

| 功能 | 文件 | 说明 |
|------|------|------|
| 认证测试 | `tests/auth.test.js` | 4 个测试用例，全部通过 |
| API 测试 | `tests/api.test.js` | 6 个测试用例，全部通过 |
| 接口规范文档 | `docs/API_SPEC.md` | 完整 API 文档 |

### 测试结果

```
🧪 认证接口测试
  ✅ GET /api/auth/status
  ✅ POST /api/auth/verify (正确密码)
  ✅ POST /api/auth/verify (错误密码)
  ✅ POST /api/auth/verify (缺少密码)

🧪 API 接口测试
  ✅ GET /health
  ✅ GET /api/skill/info
  ✅ POST /api/chat (正常请求)
  ✅ POST /api/chat (缺少消息)
  ✅ POST /api/chat/reset
  ✅ POST /api/chat (带历史)
```

---

## 2026-04-09 Phase 4 ✅ 完成

### 完成内容

| 功能 | 文件 | 说明 |
|------|------|------|
| 输入长度限制 | `zhangxuefeng/limit.js` | 限制输入 ≤ 300 字 |
| 频率限制 | `zhangxuefeng/limit.js` | 每用户/IP 每分钟 ≤ 5 次请求 |
| 限流状态接口 | `zhangxuefeng/limit.js` | `/api/limit/status` |

### 限流配置

```
MAX_MESSAGE_LENGTH = 300
RATE_LIMIT_WINDOW = 60s (1分钟)
RATE_LIMIT_MAX = 5
```

限流存储使用内存，适合单实例部署。生产环境建议替换为 Redis。

---

## 2026-04-09 配置修正 ✅ 完成

### 完成内容

| 功能 | 文件 | 说明 |
|------|------|------|
| 模型环境变量统一 | `server.js`, `zhangxuefeng/agent.js` | 统一使用 `OPENAI_MODEL`，修复启动提示与实际模型不一致 |
| 环境示例同步 | `.env`, `.env.sample` | 将模型配置键从 `MODEL` 更新为 `OPENAI_MODEL` |
| 文档同步 | `docs/API_SPEC.md` | 更新环境变量说明 |

---

## 2026-04-09 技能文件按需读取 ✅ 完成

### 完成内容

| 功能 | 文件 | 说明 |
|------|------|------|
| 技能文件读取工具 | `zhangxuefeng/tools/skill-file-reader.js` | 新增 `read_skill_file`，支持按相对路径读取技能目录内文件 |
| 工具统一注册 | `zhangxuefeng/tools/index.js`, `zhangxuefeng/agent.js` | `read_skill_file` 与 `web_search` 统一管理、统一返回 |
| 技能目录约束 | `zhangxuefeng/skill.js` | 只允许读取 `SKILL_PATH` 对应技能目录下的文件，阻止越界访问 |
| 接口文档同步 | `docs/API_SPEC.md` | 更新 `/api/skill/info` 返回示例 |

---

## 2026-04-09 技能目录浏览 ✅ 完成

### 完成内容

| 功能 | 文件 | 说明 |
|------|------|------|
| 目录浏览工具 | `zhangxuefeng/tools/skill-file-list.js` | 新增 `list_skill_files`，用于列出技能目录下真实文件名 |
| 技能加载增强 | `zhangxuefeng/skill.js` | 新增 `listSkillFiles()`，并在 prompt 中要求先列目录再读文件 |
| 工具统一注册 | `zhangxuefeng/tools/index.js` | 将 `list_skill_files` 纳入统一工具管理 |

---

## 2026-04-09 前端工具展示 ✅ 完成

### 完成内容

| 功能 | 文件 | 说明 |
|------|------|------|
| 技能卡片扩展 | `public/index.html` | 展示模型、搜索方式、可用工具列表 |
| 工具说明提示 | `public/index.html` | 对 `read_skill_file`、`web_search` 的用途做前端说明 |

---

## 2026-04-09 前端流式增量渲染 ✅ 完成

### 完成内容

| 功能 | 文件 | 说明 |
|------|------|------|
| 历史消息一次性渲染 | `public/index.html` | 初始化时仅重绘历史消息，不在每个 chunk 时全量刷新 |
| 当前回复增量更新 | `public/index.html` | 流式输出只更新当前 AI 气泡节点，避免页面闪烁 |
| 加载态收口 | `public/index.html` | typing indicator 与最终回复复用同一气泡生命周期 |
| 生成中状态延续 | `public/index.html` | 首段文本出现后仍保留“继续生成中”提示，直到收到 `done` 事件 |

---

## 2026-04-09 时效性问题强制搜索 ✅ 完成

### 完成内容

| 功能 | 文件 | 说明 |
|------|------|------|
| 时效性问题识别 | `zhangxuefeng/agent.js` | 对“最新/今年/分数线/就业率/排名/政策”等问题命中强制搜索条件 |
| 本轮强制搜索提示 | `zhangxuefeng/agent.js` | 命中后在系统消息中要求优先调用 `web_search`，禁止直接凭旧记忆回答 |
| 决策日志 | `zhangxuefeng/agent.js` | 增加 `[agent-decision]` 日志，打印强制搜索命中情况 |

---

## 2026-04-09 前端 CDN 本地化 ✅ 完成

### 完成内容

| 功能 | 文件 | 说明 |
|------|------|------|
| 本地样式缓存 | `scripts/build-tailwind-css.mjs`, `public/css/tailwind.generated.css` | 用本地 Tailwind 编译产物替换页面对 `cdn.tailwindcss.com` 的依赖 |
| 本地 Markdown 解析 | `public/vendor/mini-markdown.js` | 用本地轻量解析脚本替换 `marked` CDN |
| 页面引用切换 | `public/index.html` | 所有前端外链 CDN 改为本地资源引用 |

---

## 2026-04-09 后端前置搜索 ✅ 完成

### 完成内容

| 功能 | 文件 | 说明 |
|------|------|------|
| 搜索工具函数导出 | `zhangxuefeng/tools/websearch.js` | 导出 `geminiSearch()` 供后端直接调用 |
| 前置搜索编排 | `zhangxuefeng/agent.js` | 命中时效性问题时，后端先执行 `web_search`，再把结果注入本轮上下文 |
| 决策日志补充 | `zhangxuefeng/agent.js` | 增加“开始执行前置 web_search / 前置 web_search 完成”日志 |
| Gemini 搜索配置统一 | `.env`, `.env.sample`, `zhangxuefeng/tools/websearch.js` | 搜索密钥统一使用 `GEMINI_API_KEY`，并切换到 `openclaw` 风格的 `google_search` 工具参数 |

---

## 2026-04-10 搜索功能调整 ✅ 完成

### 完成内容

| 功能 | 文件 | 说明 |
|------|------|------|
| 取消前置强制搜索 | `zhangxuefeng/agent.js` | 移除“命中关键词后后端先调 web_search”的编排，恢复由 Agent 在推理中自主调用工具 |
| 搜索模型切换能力 | `zhangxuefeng/tools/websearch.js` | 新增 `GEMINI_MODEL` 手工切换；未配置时自动在 `gemini-2.5-flash-lite`、`gemini-2.5-flash`、`gemini-3-flash-preview` 间回退 |
| 环境变量示例补充 | `.env.sample` | 增加 `GEMINI_MODEL` 可选配置说明 |

---

## 代码复制

已将全部相关代码复制到 `/Users/mac/AIagent/cyberxuefeng/`，结构：

```
/Users/mac/AIagent/cyberxuefeng/
├── server.js
├── zhangxuefeng/
│   ├── skill.js
│   ├── agent.js
│   ├── routes.js
│   ├── auth.js
│   └── limit.js          <- 新增限流
├── public/
│   └── index.html
├── docs/
│   ├── IMPLEMENTATION_PLAN.md
│   ├── API_SPEC.md
│   └── PROGRESS.md
├── tests/
│   ├── auth.test.js
│   └── api.test.js
└── package.json
```

---

## 待完成 Phase 5 (可选)

| 任务 | 状态 | 说明 |
|------|------|------|
| WebSearch 工具 | 📋 | Agent 自动搜索就业数据 |
| 多技能切换前端 | 📋 | 下拉选择不同技能 |
| 技能热重载 | 📋 | 修改 SKILL.md 后自动生效 |
| Redis 限流存储 | 📋 | 多实例部署支持 |

---

## 测试命令

```bash
# 运行测试
node tests/auth.test.js
node tests/api.test.js

# 认证测试
curl -X POST http://localhost:80/api/auth/verify \
  -H 'Content-Type: application/json' \
  -d '{"password":"zhangxuefeng2026"}'

# 对话测试
curl -X POST http://localhost:80/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"我家孩子想学新闻学，靠谱吗？"}'

# 查看限流状态
curl http://localhost:80/api/limit/status
```

---

## Git 提交历史

```
a55f622 feat: 张雪峰视角 Web 服务 - 技能加载、认证、API、前端、测试
a0b9084 docs: 更新开发进度文档 - Phase 1-3 全部完成
a1b2c3d feat: 新增限流措施 - 输入长度限制 300字，每分钟 5次请求
```
