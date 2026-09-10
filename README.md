# wx2md

把微信公众号文章链接导出成本地 Markdown 文档。**链接进，`.md` 文件出。**

## 给 AI 智能体

用户把这个仓库发给你时，照下面做完即可，全程自动：

1. **装**：macOS / Linux 跑 `bash scripts/install.sh`，Windows 跑 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install.ps1`。缺的东西脚本会自己补齐（Node 运行时、npm 依赖都在内，默认源失败会自动换国内镜像重试），重复运行同样安全。
2. **注册 `/` 命令**：把 `skills/wx2md/SKILL.md` 复制到本工具自己的 skill 目录——Claude Code 用 `~/.claude/skills/wx2md/`，WorkBuddy 用 `~/.workbuddy/skills/wx2md/`，其他工具放进它自家的位置，找不到就跳过这一步。
3. **验证**：跑 `~/.wx2md/wx2md --help`（Windows 用 `%USERPROFILE%\.wx2md\wx2md.cmd --help`），能打出帮助即可用。
4. **告诉用户**：可以用了，以后把公众号链接发过来，说一句「存成 MD」。

## 怎么用

把公众号文章链接（`https://mp.weixin.qq.com/s/...`）发过来，说一句「存成 MD」就行；也可以在对话里输入 `/wx2md` 触发。

## 调用方式

工具固定在下面这个位置，跟工作台、安装位置无关：

| 系统 | 命令 |
| --- | --- |
| macOS / Linux | `"$HOME/.wx2md/wx2md" "<链接>" -o "<输出目录>"` |
| Windows | `"%USERPROFILE%\.wx2md\wx2md.cmd" "<链接>" -o "<输出目录>"` |

```bash
wx2md "https://mp.weixin.qq.com/s/xxxxxxxx"
wx2md "链接1" "链接2" -o ./out --json
wx2md "链接" --print
```

| 参数 | 说明 |
| --- | --- |
| `-o, --out <路径>` | 输出目录；以 `.md` 结尾时按文件处理（配合单个链接）。默认当前目录 |
| `-w, --image-width <宽度>` | 图片最大宽度（px），默认 `677`（公众号正文列宽）。写 `full` 表示图片与文字同宽 |
| `--force` | 覆盖已存在的文件（默认跳过） |
| `--print` | 输出 Markdown 到标准输出 |
| `--json` | 输出结构化结果，便于脚本 / 智能体调用 |

## 输出

文件名取文章标题（去掉路径非法字符，最多 100 字），内容为 YAML 头信息 + 正文：

```markdown
---
title: "文章标题"
account: "公众号名称"
author: "作者"
published: "2024-11-07 23:01:59 +08:00"
source: https://mp.weixin.qq.com/s/xxxxxxxx
---

正文……
```

### 图片宽度

公众号正文是固定列宽（677px），配图再大也只会撑满这一列，所以在任何屏幕上图片和文字都是等宽的。Markdown 的 `![]()` 没有宽度概念，阅读器按图片原始像素渲染，窗口越宽图片越大、几张图还各不一样。所以这里把图片写成受约束的 HTML：

```html
<img src="…" alt="" width="677" style="width:100%;max-width:677px;height:auto;display:block;margin:1.2em auto">
```

宽屏下每张图最多 677px 并居中，和公众号原文一致；窄屏下自适应；原文里本身就窄的图保持原尺寸。想要「图片和文字始终同宽」用 `-w full`。

## 限制

- 接受 `https://mp.weixin.qq.com/s...` 形式的链接。
- 付费文章拿到的是试读部分，头部会标注 `note`。
- 微信要求验证或被 Cloudflare 拦截时直接报错；在浏览器里打开链接完成验证后重试即可。
- 极少数需要 JS 渲染的页面会明确报错，并附上原因。

## 实现

```
src/article.mjs     抓取 + 正文抽取 + Markdown 转换
src/cli.mjs         命令行
scripts/install.sh  macOS / Linux 入口
scripts/install.ps1 Windows 入口
scripts/install.mjs 安装器：复制代码、装依赖、生成启动器
skills/             可复制的技能文件，用来注册成 `/` 命令
```

依赖只有 `linkedom`、`turndown`、`turndown-plugin-gfm` 三个纯 JavaScript 包，Mac / Windows / Linux 行为一致。

抓取走的是普通的 HTTP 请求：带浏览器 UA 拿回整页 HTML，正文就在 `#js_content` 里，再用 Turndown 转成 Markdown。思路参考 [teng-lin/weread-omni](https://github.com/teng-lin/weread-omni) 的公众号实现。
