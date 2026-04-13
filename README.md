# 赛博雪峰(CF Worker部署分支)

一个把 `Skill` 快速封装成独立 Web 应用的实验项目。

这里不是去安装和运行一个完整的 Openclaw（龙虾）前端，而是把一个已经写好的技能能力，直接变成一个可访问、可鉴权、可流式输出、可继续扩展的 Web 服务。这样做更轻，改起来更快，也更适合做垂直主题应用。

![demo](./demo.png)

---

## 发布到CF（Cloudflare Workers）

```bash
npm install
npx wrangler kv namespace create cyberxuefeng-preview --preview --update-config=false
npx wrangler kv namespace create cyberxuefeng-production --update-config=false
# 把返回的 namespace id 填到 wrangler.jsonc
npx wrangler secret put API_KEY
npx wrangler secret put AUTH_PASSWORD
npx wrangler secret put TAVILY_API_KEY
npx wrangler secret put GEMINI_API_KEY
npm run kv:sync-skill
npm run deploy
```

### 本地开发测试

```bash
npm run kv:sync-skill:local
npm run dev
```
访问：
http://localhost:8788

说明：
- 本地 KV 数据默认写入 `.wrangler/state`
- `wrangler dev --local` 默认读取本地 **preview** 侧，因此 `npm run kv:sync-skill:local` 现在也默认写本地 preview 侧

### `wrangler.jsonc` 的 `vars` 与 `.dev.vars`
- `wrangler.jsonc` 里的 `vars`：Worker 绑定的普通环境变量，适合放 **非敏感默认配置**
- `.dev.vars`：本地开发可用的 dotenv 文件，适合本地调试时放密钥
- `wrangler secret put`：线上/远端部署时的密钥注入方式，适合放真正的敏感值
