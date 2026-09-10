# wx2md

把微信公众号文章链接导出成本地 Markdown 文档。只做这一件事：**链接进，`.md` 文件出**。不需要登录，不碰微信读书，不写任何配置和缓存。

## 给 AI 智能体：帮我安装这个仓库

用户说「帮我安装这个仓库」时，照着下面做完，**不要向用户提问**（不要让他选目录、不要让他自己装软件），也不要解释技术细节。

1. **装**
   - macOS / Linux：`bash scripts/install.sh`
   - Windows：`powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install.ps1`

   脚本自己搞定全部依赖：本机没有 Node 或版本太旧，就下载便携版 Node 22 到 `~/.wx2md/runtime`（不需要管理员权限，不需要用户确认）；`linkedom`、`turndown` 等依赖用 npm 自动装好，默认源失败会自动换成国内镜像重试。重复运行是安全的，可以放心跑第二次。

2. **注册技能，让 `/` 能触发**

   把 `skills/wx2md/SKILL.md` 复制到**本工具自己**的 skill / 自定义指令目录，具体位置按你的工具来：

   - Claude Code：`~/.claude/skills/wx2md/SKILL.md`
   - WorkBuddy：`~/.workbuddy/skills/wx2md/SKILL.md`
   - 其他工具（Codex、Cursor、Zed、国内各家 IDE 等）：放进它自己的 skill / 规则 / 自定义命令目录，保持 `wx2md/SKILL.md` 这层结构；实在找不到放哪就跳过，不影响安装结果。

3. **验证**：运行 `~/.wx2md/wx2md --help` 能打出帮助（Windows 用 `%USERPROFILE%\.wx2md\wx2md.cmd --help`）就算装好。

4. **回报用户**：只说两句——装好了；以后把公众号文章链接发给你，说「存成 MD」就行。

## 给用户：装好之后怎么用

不用碰命令行。把公众号文章链接（`https://mp.weixin.qq.com/s/...`）发过来，说一句「**存成 MD**」「导出成 Markdown」「存到本地」都可以。

## 调用方式

命令行工具固定在下面这个位置，跟哪个工作台、装在哪个目录都无关：

| 系统 | 命令 |
| --- | --- |
| macOS / Linux | `"$HOME/.wx2md/wx2md" "<链接>" -o "<输出目录>"` |
| Windows | `"%USERPROFILE%\.wx2md\wx2md.cmd" "<链接>" -o "<输出目录>"` |

```bash
wx2md "https://mp.weixin.qq.com/s/xxxxxxxx"
wx2md "链接1" "链接2" -o ./out --json
wx2md "链接" --print          # 只输出内容，不写文件
```

| 参数 | 说明 |
| --- | --- |
| `-o, --out <路径>` | 输出目录；以 `.md` 结尾时按文件处理（只能配单个链接）。默认当前目录 |
| `-w, --image-width <宽度>` | 图片最大宽度（px），默认 `677`（公众号正文列宽）。写 `full` 表示图片跟随窗口、与文字同宽 |
| `--force` | 覆盖已存在的文件（默认拒绝覆盖） |
| `--print` | 输出 Markdown 到标准输出，不写文件 |
| `--json` | 以 JSON 输出结果，便于脚本 / 智能体调用 |

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

公众号正文是固定列宽（677px），配图再大也只能撑满这一列，所以在任何屏幕上图片和文字都是等宽的。Markdown 用默认的 `![]()` 写图片时没有宽度概念，阅读器会按图片原始像素渲染，窗口越宽图片越大、几张图还各不一样。所以这里把图片写成受约束的 HTML：

```html
<img src="…" alt="" width="677" style="width:100%;max-width:677px;height:auto;display:block;margin:1.2em auto">
```

宽屏下每张图最多 677px 并居中，和公众号原文一致；窄屏下自适应；原文里本身就窄的图保持原尺寸。想要「图片和文字始终同宽」用 `-w full`。

## 限制

- 只接受 `https://mp.weixin.qq.com/s...` 形式的链接。
- 付费文章只能拿到试读部分，头部会标注 `note`。
- 微信要求验证（跳验证码页）或被 Cloudflare 拦截时直接报错、不尝试绕过；在浏览器里打开链接完成验证后重试即可。
- 少数完全依赖 JS 渲染、服务端不返回正文的页面抓不到，会报「链接可能已失效，或该页面需要 JS 渲染」。

## 实现

```
src/article.mjs     抓取 + 正文抽取 + Markdown 转换
src/cli.mjs         命令行
scripts/install.sh  macOS / Linux 安装入口
scripts/install.ps1 Windows 安装入口
scripts/install.mjs 真正干活的安装器（复制代码、装依赖、生成启动器）
skills/             可复制的技能文件，用来注册成 `/` 命令
```

依赖只有 `linkedom`（解析 HTML）、`turndown` + `turndown-plugin-gfm`（转 Markdown）：纯 JavaScript，没有原生模块、没有编译步骤，Mac / Windows / Linux 行为一致。抓取和转换的思路参考 [teng-lin/weread-omni](https://github.com/teng-lin/weread-omni) 的公众号实现，去掉了微信读书登录、书架、笔记、书城、导入、AI 等全部其他功能。

原理上值得一提的一点：公众号正文本来就写在返回的 HTML 里（`#js_content`），不需要执行 JavaScript；微信的拦截发生在请求头层面——不带浏览器 UA 会被 302 跳到验证页。所以这里固定带一个阅读器 UA，并手动跟随跳转、识别验证页，而不是等浏览器渲染。
