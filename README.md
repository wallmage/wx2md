# wx2md

把微信公众号文章链接导出成本地 Markdown 文档。链接进，`.md` 文件出。

配图按公众号正文列宽收敛，宽屏上也和文字等宽。

## 安装

复制下面这段，粘贴到 WorkBuddy、Codex、Claude Code 等智能体工作台，发送：

```
帮我安装这个仓库：https://github.com/wallmage/wx2md
```

## 使用

把公众号文章链接发给它，说一句「存成 MD」，文件就存到你电脑上（默认在文档目录的「公众号文章」文件夹里）。

对话里输入 `/wx2md` 也能直接触发。

---

# 以下是给 AI Agent（智能体）读的

用户把本仓库发给你时，照下面做完，全程自动：

1. **装**：macOS / Linux 跑 `bash scripts/install.sh`，Windows 跑 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install.ps1`。脚本准备 Node 20.19+ 并同步 npm 依赖；npm 默认源失败会换国内镜像重试。
2. **注册 `/` 命令**：把 `skills/wx2md/SKILL.md` 复制到本工具自己的 skill 目录——Claude Code 用 `~/.claude/skills/wx2md/`，WorkBuddy 用 `~/.workbuddy/skills/wx2md/`，其他工具放进它自家的位置，找不到就跳过这步。
3. **验证**：跑 `~/.wx2md/wx2md --help`（Windows 用 `%USERPROFILE%\.wx2md\wx2md.cmd --help`），能打出帮助即可用。
4. **告诉用户**（先取到用户真实用户目录：Mac 跑 `echo $HOME`，Windows 跑 `echo $env:USERPROFILE`，拼出 `…/Documents/公众号文章`，照下面原话说）：
   > 装好了。你复制粘贴微信链接给我，我会帮你导出干净的 MD 文件，默认存放在：
   > `/Users/例子/Documents/公众号文章`
   >
   > 这里是我们自动存放的位置，如果你想放到其他地方，现在就可以告诉我，我可以给你更改默认的导出路径。

   规矩：给绝对路径，不留占位符，`例子` 换成真实用户名；用户在 Mac 就只给 Mac 路径、在 Windows 就只给 Windows 路径，另一套删掉；末尾提一句对话里输入 `/wx2md` 也能触发。

## 调用

工具固定在下面这个位置，与工作台无关：

| 系统 | 命令 |
| --- | --- |
| macOS / Linux | `"$HOME/.wx2md/wx2md" "<链接>" -n "<短标题>" --json` |
| Windows | `"%USERPROFILE%\.wx2md\wx2md.cmd" "<链接>" -n "<短标题>" --json` |

**文件名**：默认存到用户文档目录的「公众号文章」文件夹，文件名 = 当天日期 + 短标题，如 `20260910-ChatGPT+WorkBuddy 做 PPT 技巧.md`。

**短标题怎么起**（`-n`）：先读懂文章讲什么，用不超过 15 个字概括核心，砍掉「一篇文章讲清楚 / 一文读懂 / 全网最全 / 建议收藏 / 深度好文」这类口水话。

- 例子：`一篇文章讲清楚当下用ChatGPT和WorkBuddy做ppt的4种好用的方法` → `ChatGPT+WorkBuddy 做 PPT 技巧`
- 不带 `-n` 时按原文标题自动压缩，效果不如自己概括，尽量带上。

参数：`-w <宽度|full>` 图片最大宽度（默认 677px，公众号正文列宽），`--force` 覆盖同名文件，`--print` 只输出内容不写文件，`--json` 结构化结果，`-o <路径>` 指定别处输出。

多个链接可一次传入；`-n` 仅用于单篇，需要逐篇起名时分别调用。同一批次的文件名冲突会报 `PATH_CONFLICT`，即使带 `--force` 也不会相互覆盖。

`--print --json` 返回包含 `document` 正文的 JSON，不写文件。`characters` 为正文非空白字符数，不含图片地址和 Markdown 标记；参数错误也返回 JSON。

## 失败怎么处理

- 微信要求验证：请用户在浏览器打开链接完成验证后重试。
- 页面没返回正文（链接失效或纯 JS 渲染）：如实告知用户。
- 付费文章（`state: partial`）：只有试读部分，回复时说明。
- 文件已存在：确认后用 `--force` 重跑。
