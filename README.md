# X-Connect Factory · 右转，进厂

www.x-connect.ai 首页有两个门：左边 Chat（小助手），右边 Code（交付工厂）。
**这个仓库就是右门之后的那一页**：一句话进来，一条产线开工，三尺寸出去。

## 部署（Render static_site）

```bash
export RUNPOD_KEY=rpa_…        # 只给构建用，不进 git（.gitignore 已排）
bash build/run.sh                # 一条链跑通，21 项验收全过
gh repo create xuliangwang1993-ops/xconnect-factory --private --source=. --push
# Render 上建 static_site，publishPath=site，然后真部署
```

线上：https://xconnect-factory.onrender.com（右门 `.entry.code` 换成 `?from=code` 即可接上）。

```
www.x-connect.ai  ──右门 Code──▶  factory/  ──▶  runs/<id>/  ──▶  可交付
                                   ↑
                          AOI M00–M11 能力表 + 小助手配方匹配
```

## 页面里有什么

| 区域 | 内容 | 数据从哪来 |
|---|---|---|
| 左栏 · 产线 | 8 个工位，状态点 = 真实 QA | `runs/v3-20261023-130640/*/handoff.json` |
| 左栏 · AOI 能力 | M00–M11 模块表，标注接到哪些工位 | `aoi-m11-preview` 的模块表快照 |
| 左栏 · 配方 | R01 已实测，R02–R04 是骨架 | 仓库 `pipeline/` 与 `dumpling-*.json` |
| 中栏 · FLOW | 卡片上的线是**上一站的产物**，鼠标点开看 sha256 | 每站 handoff 的 inputs/outputs |
| 中栏 · 交接账本 | 16/17 闭合，1 张未入账（照实留着） | 逐条比对上游 outputs 的 sha256 |
| 右栏 · 小助手 | 一句话 → 配方打分 + 命中词 + 证据 | 本地规则匹配，不调用模型 |
| 右栏 · 皮肤 | 4 套，3 套 AUTHENTIC（有 sha256 出处） | ImageMagick 实抽 + 两份线上 CSS 令牌 |
| 右栏 · 运行 | run 元数据、封面、QA、构建链 | `manifest.json` / `qa.json` / `build.js` |

## Authentic skin

皮肤不是调色盘，是**可溯源的表皮**。规则只有一条：

> 有 `source.sha256` 的才发 `AUTHENTIC`；从设计规范抄来的只能标 `SPEC`；浏览器现取的是 `LOCAL`。

- `Crystal X`：从门户的 `crystal-x.jpg` 实抽 8 色（`magick -colors 8`），grain 也裁自同一张图。
- `AoI Film`：直接读 `aoi-m11-preview` 的 `--aoi-*` 令牌。
- `Workbench Amber`：直接读 `xconnect-factory.onrender.com/styles.css` 的 `--bg/--surface/--accent`。
- `X-Connect Default`：应用的设计令牌（`smart_skin_palettes.dart`），没有文件哈希 → `SPEC`。
- 面板底部可以传一张自己的图：浏览器端 k-means 取 5 色、派生表面层级、算对比度，标 `LOCAL`，刷新不保留。

换肤用**整块替换 `<style>`**，不是逐个 `setProperty`——WebKit 对自定义属性改动的失效不彻底，实测换肤后 `var()` 的消费方会留上一套的颜色。

## 能力树（跟产线同一屏，切一下）

```
AoI（树干）
├─ A 底座   M00
├─ B 执行   M01 M02 M03 M04 M05 M08
├─ C 扩展   M06 M07 M09 M10
└─ D 总装   M11
      叶 = 本页接到这根枝的 8 个工位
      果 = 挂在 M07 下的 4 条配方（R01 实心=已实测，R02–R04 虚线=骨架）
```

模块的 `summary / wave / risk / 能力叶 / 依据` 不是手写的：从 M11 前端的 bundle 里把注册表抽出来（`build/refs/m11-modules.json`），
每个模块带 5–7 片真实能力叶（如 M04 的「受控命令执行器 / fixture 明确标记 / 独立回读」）与 `spec/…md:行号` 的证据。
悬停任一节点会亮出它到树根的那条路径；点模块，下面换成它的能力叶与三条可问的话。

## 一条产线，八个工位

| # | 工位 | 工具（取自 handoff） | 产物 → 下一站 |
|---|---|---|---|
| 00 | 需求解析 | jq, python-re | `brief.json` |
| 01 | 素材入库 | curl, ffprobe, crawl4ai | `facts.json` / `media_manifest.json` / `licenses.json` |
| 02 | 脚本分镜 | python-docx, reportlab, jq | `script.json` / `menu.json` / `storyboard.pdf` |
| 03 | 画面与混音 | ffmpeg, opencv, sox, pyscenedetect | `clips/*.mp4` / `mix.wav` |
| 04 | 字幕 | argos-translate, whisper | `zh.srt` / `en.srt` |
| 05 | 三尺寸导出 | ffmpeg+libass, imagemagick, libvips | `promo_{9x16,1x1,16x9}.mp4` |
| 06 | 验收 | ffprobe, opencv | `reports/trace.json` 等 |
| 07 | 知识包 | python stdlib | `店铺事实.md` / `menu.md` / QA 桩 |

这条链的规矩是仓库自带的：每站产出 `handoff.json`（输入输出 sha256 + 工具版本 + 退出码）、`qa.json`（阈值与实测）、`scorecard.json`。
**Schema 不合规就非 0 退出**，验收不过不许进下一站。

## 这一页自己也是走链生成的

```
01_extract  ImageMagick 取色  →  palette.json
02_tokens   Python 组皮肤     →  skins.json（含对比度实测）
03_compile  jq/Python 编数据  →  stations/tools/aoi/recipes + bundle.js
04_render   盖版本号          →  index.html（不吃缓存）
05_verify   11 项检查         →  qa.json + build.js
```

`bash build/run.sh` 一键重跑。05 的检查里，**硬失败会让整条链非 0 退出**：

1. 交接缺口只有已知一处 2. 8 站退出码全 0 3. 站数 = 8 4. 皮肤正文对比度 ≥ 4.5
5. AUTHENTIC 都能溯源 6. 站上工具都在 88 个工具表里 7. 声明的 schema 都在仓库里
8. 页面引用的本地文件都在 9. 数据包五块齐 10. 无外链字体/CDN 11. 构建链四步都有交接书

## 跑起来

```bash
python3 -m http.server 8080 -d site      # 或直接开 site/index.html
# 手机预览：minis://workspace/xc-factory/site/index.html?from=code
```

依赖：`imagemagick` `jq` `python3`。不依赖任何 CDN，字体走系统栈，断网也能开。

## 接到门户右门

线上右门现在是一个 `.entry.code` 按钮。最省事的接法（不用改 `portal.js`）：

```html
<script>
document.addEventListener('click', function (e) {
  var door = e.target.closest('.entry.code');
  if (!door) return;
  e.preventDefault(); e.stopImmediatePropagation();
  location.href = 'https://xconnect-factory.pages.dev/?from=code';
}, true);   // capture：抢在 portal.js 的路由之前
</script>
```

`?from=code` 会让中栏从右侧滑入 0.5s，呼应"右转"。

## 需要被看见的三个缺口

1. **`06_qa/qa.json` 没登记进 06_qa 的 handoff.outputs**，但被 07_kb 当输入用 → 账本 16/17，界面标黄。这是产线自己的账，不替它抹平。
2. **01_ingest QA 不过**：客户实拍素材 0 / ≥1，全链用占位样片跑通，成片带「样片 · 占位素材 · 未授权」水印，**不可交付**。
3. **AOI `/api/v1/*` 现在 404**：M11 预览用 MSW 在前端模拟，后端未上线。界面用模块表快照，并明确写"不假装在线"。

## 文件

```
site/            index.html · factory.css · factory.js · data/{bundle,build,qa}.js · assets/
build/           01_extract.sh → 05_verify.py（每站 handoff.json）
build/refs/      m11.css · workbench.css（皮肤令牌的实测源）
craft-skills/    上游仓库（pipeline + 83 个 base 工具 + runs/v3-…）
```
