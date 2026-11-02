# 工具登记簿：唯一库存与交接标准

线上：`https://xconnect-factory-ui.onrender.com/registry/`

## 这一版是什么

一个静态、可审计、可复现的工具登记簿，不是 MCP 服务器本身。

- 96 个入库技能：13 个 Craft + 83 个底层工具。
- 1 个补充运行资产：Qwen3-TTS。它尚未有独立 SKILL.md，不能混进入库技能计数。
- 63 个行业分类 / 504 份 SKILL.md 正文的市场需求样本。
- 58 条上下游关系：区分文档衔接与格式推断，未跑通的不写“已跑通”。
- RunPod 工具的真实部署与验证范围，机器已关机。

## 单一数据源

`site/data/registry.json` 是给程序读取的完整登记表；`registry.js` 是同一数据的浏览器加载版本。二者由同一个构建脚本生成，**不要手工只改其中一个**。

构建输入固定在仓库内：

- `build/registry-sources/inventory.json`：从 craft-skills main 的 96 个 SKILL.md 提取的库存和交接关系。
- `build/registry-sources/market_industry_tools.json`：Skill Market 原始抽样数据。
- `build/build_registry.py`：合并部署证据、能力候选、行业需求，输出前端数据。

```bash
python3 build/build_registry.py
python3 build/verify_registry.py
# 在 Minis 环境可运行真实浏览器验收
python3 build/browser_verify.py
```

## 新增、扩容、部署的规则

1. **先查 `registry.json`**：同职责工具已有，不直接新增。
2. **入库不等于安装**：SKILL.md 是说明书，部署是某个执行环境里的实例，验收是小样证据，MCP 接通是第四件事。
3. **同一技能可有多个部署位置**：RunPod、PC、手机都写在 `deployments`，不得为同一技能另起一行冒充新工具。
4. **补充资产单独标 `asset`**：例如 Qwen3-TTS；有同职责候选时必须比选。
5. **交接写清格式和证据**：上游 output 必须能被下游 input 消费。推断兼容就写 `inferred`，真实跑通后才改 `verified`。
6. **需求不是安装命令**：市场提及为 0 不等于无用；需求高也不等于马上部署。先评估用户任务。
7. **不在登记簿存密钥、内网凭据、JWT 或私有素材**。
8. **部署后回写验收证据**：日期、位置、实测小样、通过范围；未测中文配音就不能写“中文配音可用”。

## 当前真实边界

- 本页没有把所有底层工具变成 MCP 工具；83 个 base 多数仍是 CLI / Python 能力。
- 13 个 Craft 的 MCP 声明来自源 SKILL.md；PC 部署是历史记录，本轮没有重连复验。
- RunPod 的 9 项“运行已验证”包括 6 个 CLI 版本/可执行检查和 3 个 GPU 小样；不是完整案例 D 验收。
- 市场总盘约 350 万是用户口径。页面需求数字仅来自 63 分类、504 份正文；不是调用量、不代表全行业份额。
- 旧 `xconnect-factory.onrender.com` 当前 404；本版使用正式在线服务 `xconnect-factory-ui.onrender.com`。
