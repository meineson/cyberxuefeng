# 赛博雪峰 (Cyber Xuefeng)

一个把 `Skill` 快速封装成独立 Web 应用的实验项目。

这里不是去安装和运行一个完整的 Openclaw（龙虾）前端，而是把一个已经写好的技能能力，直接变成一个可访问、可鉴权、可流式输出、可继续扩展的 Web 服务。这样做更轻，改起来更快，也更适合做垂直主题应用。

![demo](./demo.png)

---

## 技术说明：怎样快速把一个 Skill 封成 Web 应用

核心思路很简单：不要先做“大而全”的 Agent 平台，先把一个 skill 跑通。

### 1. 直接复用 `SKILL.md`

这个项目不是重新发明一套 prompt 系统，而是直接读取现成的 `SKILL.md`，把里面的规则、角色、工作流和边界条件作为 system prompt 注入模型。

### 2. 用最薄的一层后端包起来

后端只做几件事：加载 skill、创建 agent、注册工具、暴露 API 接口、处理鉴权、限流和流式输出。重点是“先把 skill 变成一个能用的服务”。

### 3. 工具按应用需要最小化接入

本项目目前集成了最实用的三类工具：`list_skill_files`、`read_skill_file` 和 `web_search`。这足以支撑绝大多数垂直领域的需求。

### 4. 前端也保持轻量

前端只保留必要能力：登录验证、对话输入、SSE 流式输出、Markdown 渲染和技能信息展示。方便后续快速复用到其他 skill 项目。

---

## 项目初心：纪念张雪峰，赛博永生

这个项目更像是一种纪念，也是一种延续。张雪峰老师之所以被记住，是因为他替普通家庭把很多难听但重要的话提前说了出来：**选择比努力更重要**。

“赛博雪峰”致力于保留这套面向普通人的人生判断框架：
- 消除信息差。
- 在教育、专业、城市选择上提供现实的建议。
- 站在普通人一边，说真话，少走弯路。

**记念张雪峰，也希望他继续以另一种形式，给年轻人和家长当人生指南。**

---

## 当前项目特点

- 基于 `SKILL.md` 直接构建角色能力。
- 支持按需读取技能目录下的补充资料。
- 支持 Web 搜索（Gemini / Tavily）获取时效数据。
- 支持密码验证、限流保护、流式输出。
- **双运行环境支持**：支持传统 Node.js 服务及 Cloudflare Workers 边缘部署。

---

## 部署说明

### 方案 A：传统 Node.js (Express) 部署
适合在 VPS、物理服务器或本地环境运行。

```bash
npm install
cp .env.sample .env # 修改 .env 填写 API_KEY, AUTH_PASSWORD 等
npm run zhangxuefeng
```
访问：`http://localhost:80`

### 方案 B：Cloudflare Workers (Edge) 部署
适合大规模并发和无服务器运维。

#### 1. 准备 KV 命名空间
```bash
npx wrangler kv namespace create cyberxuefeng-preview --preview --update-config=false
npx wrangler kv namespace create cyberxuefeng-production --update-config=false
# 将返回的 id 填写到 wrangler.jsonc
```

#### 2. 同步技能资料到 KV
```bash
# 同步到生产环境
npm run kv:sync-skill
# 同步到本地模拟测试环境
npm run kv:sync-skill:local
```

#### 3. 配置密钥与部署
```bash
# 注入敏感密钥
npx wrangler secret put API_KEY
npx wrangler secret put AUTH_PASSWORD
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put TAVILY_API_KEY

# 线上部署
npm run deploy

# 本地开发测试 (访问 http://localhost:8788)
npm run dev
```

---

## 适合继续扩展的方向

- 把更多 skill 复用成独立 Web 应用。
- 做多 skill 切换，而不是单 skill 页面。
- 增加服务端会话和多用户隔离。
- 增强 Markdown 渲染和前端展示。
