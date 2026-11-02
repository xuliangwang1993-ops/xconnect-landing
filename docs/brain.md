# 总脑（BRAIN）：诸葛亮式的第三方观察者

小助手会说话，但拿主意的是它背后那个冷静的总脑。总脑不聊天、不带情绪，只看对话里的规律：
客户要什么、该怎么回、下一步该派什么活。

## 一句话链路

```
客户说话 → 小助手先把话交给总脑（≤3 秒）
        → 总脑：回复建议 / 任务 / 追问 / 需求
        → 小助手用自己的豆包音色把结论说出来
        → 需求进 brain_needs，确认后一键转 work_nodes
```

总脑**超时就退**：3 秒没回，小助手照常用自己的回复，绝不把对话卡在这一步
（之前的 30 秒超时会让界面卡死）。连续两次超时会熔断 90 秒，期间不再等模型。

## 接口（全部要登录会话，与 `/api/chat` 同一套 cookie）

| 方法 | 路径 | 作用 |
|---|---|---|
| POST | `/api/brain/turn` | 收一轮对话：`{sessionId, role, text, at, assistantId}` → `brain_turns` |
| POST | `/api/brain/ask` | 先问总脑：`{sessionId, turns[], assistantId, lang}` → `{ok, reply, tasks, questions, needs, reason, latencyMs}` |
| POST | `/api/brain/proactive` | 停顿回看：`{sessionId, turns[], lastLookAt}` → `{question, basis}`；频率上限 + 同题冷却 |
| GET | `/api/brain/needs` | 需求列表（按置信度倒序） |
| PATCH | `/api/brain/needs/:id` | 改状态 `open/confirmed/dismissed`，可同时提置信度 |
| POST | `/api/brain/needs/:id/convert` | 需求 → `work_nodes` ticket（stage=idea），已转过返回 409 |
| POST | `/api/brain/tasks` | 任务 → `work_nodes` ticket |
| GET/PUT | `/api/brain/settings` | 主动模式开关（默认开） |
| GET | `/api/brain/health` | 自检：只报"缺什么"，不吐任何密钥 |

## 数据表（`workbench/migrations/20261102_brain.sql`）

- `brain_turns` 对话流水（session_id, role, text, assistant_id, at）
- `brain_needs` 需求（need, evidence jsonb, confidence, fingerprint, status；`unique(session_id, fingerprint)` 去重）
- `brain_replies` 记账（kind=turn/proactive, used=brain/fallback, latency_ms, reason）
- `brain_settings` 开关

RLS：`brain_needs` / `brain_settings` 允许 anon 只读；`brain_turns` / `brain_replies` 只有 service_role 能读写。

## 环境变量

| 名字 | 说明 |
|---|---|
| `BRAIN_MODEL_API_BASE` | OpenAI 兼容端点，如 `https://api.x-connect.ai/v1` |
| `BRAIN_MODEL_API_KEY` | 端点密钥（不落盘、不打印） |
| `BRAIN_MODEL` | 默认 `kimi-k3` |
| `BRAIN_TIMEOUT_MS` | 每轮等总脑的上限，默认 `3000` |
| `BRAIN_PROACTIVE_TIMEOUT_MS` | 主动回看的上限，默认 `9000` |

两个密钥都没配时，接口返回 `configured:false`，前端直接用小助手的回复，不报错、不卡。

## 生成内容示例

```json
{
  "reply_suggestion": "我先按 53 004 085 616 把 Rolex Pty Ltd 的抬头记下：样片您先看，尾款确认后再付，对吗？",
  "tasks": [{"title": "核对 ABN 53 004 085 616", "detail": "客户给的是 Rolex Pty Ltd，先在 ABR 查名称是否一致", "priority": "high"}],
  "follow_up_questions": [{"question": "我把刚才说的整理了一下：您下周五要交 3 条片，是先看样片再付尾款，对吗？", "basis": "客户：我们下周想把 3 条短视频做出来"}],
  "needs": [{"need": "开票（可开 ABN 发票）", "evidence": "你好，我们下周想把 3 条短视频做出来，能开票吗", "confidence": 0.9}]
}
```

## 测试

- `factory/test/brain-prompt.test.mjs`：JSON 契约（坏输入、代码块、别名、截断、夹取）
- `factory/test/brain-timeout.test.mjs`：超时退回 / 熔断 / 未配置 / 非 JSON / 主动模式冷却
- `factory/test/brain-e2e.test.mjs`：一段真实对话 → 追问 + 需求 → 去重 → 一键转 `work_nodes`
