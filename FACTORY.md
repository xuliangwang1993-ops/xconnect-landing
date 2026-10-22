# X-connect 工厂运行结构（搭台你唱戏 + Workbench + AoI）

一个 Node 服务（`npm start` → `workbench/server-voice.mjs`）对外提供全部功能块：

| 路由 | 功能块 | 代码位置 |
|---|---|---|
| `/` | 搭台：门面 / 委托入口（原 stage-preview 页面） | `index.html` `styles.css` `app.js` `icon.svg` `brand-x.png`（经 `factory/factory.mjs` 改写资源路径到 `/stage/`） |
| `/stage/*` | 门面静态资源（白名单） | `factory/factory.mjs` |
| `/workbench` | 唱戏：卡片工作台 PWA（登录、模型、聊天、卡片整理/审阅/批准、字幕收件箱、设置） | `workbench/public/*`、`workbench/workbench.mjs` |
| `/api/*` | 工作台 API（会话、卡片、对话、任务、tier、inbox、voice-token） | `workbench/workbench.mjs` |
| `/voice` | 实时语音 WebSocket（豆包） | `workbench/server-voice.mjs`、`workbench/voice-auth.mjs` |
| `/bridge/*` | PC 执行桥 claim/complete | `workbench/server-voice.mjs` |
| `/slack/*` | Slack 入口 → 卡片 | `workbench/integrations/*`、`workbench/slack-app-manifest.yaml` |
| `/aoi` | AoI 能力看板（卡片 → CapabilitySnapshot，fixture，只读，不出现 verified） | `factory/aoi/index.html`、`factory/aoi/aoi-snapshot.js` |
| `/factory.json` | 功能块清单（机器可读） | `factory/factory.mjs` |

运行：`npm install && cp workbench/.env.example .env`（填值，绝不提交）→ `set -a; . ./.env; set +a; npm start`。
测试：`npm test`（factory + workbench 共 19 个）。
