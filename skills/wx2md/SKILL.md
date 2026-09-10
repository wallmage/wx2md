---
name: wx2md
description: 把微信公众号文章链接（mp.weixin.qq.com/s/...）导出成本地 Markdown 文件。用户给出公众号文章链接并要求「保存 / 导出 / 转成 / 存成 MD、Markdown、笔记、本地文档」时使用；也适用于批量导出多篇。
---

# 微信公众号文章 → 本地 Markdown

本机已安装的命令行工具，只做这一件事：链接进，`.md` 文件出。

## 调用

macOS / Linux：

```bash
"$HOME/.wx2md/wx2md" "<文章链接>" -n "<短标题>" --json
```

Windows（PowerShell）：

```powershell
& "$env:USERPROFILE\.wx2md\wx2md.cmd" "<文章链接>" -n "<短标题>" --json
```

首次使用前，先跑一次本仓库的 `scripts/install.sh`（Windows 用 `scripts/install.ps1`）。

参数：

| 参数 | 说明 |
| --- | --- |
| `-n, --name <短标题>` | 文件名用的短标题，先概括再传，见下 |
| `-o, --out <路径>` | 输出目录；以 `.md` 结尾时按文件处理（配合单个链接）。默认文档目录的「公众号文章」 |
| `-w, --image-width <宽度>` | 图片最大宽度 px，默认 `677`（公众号正文列宽）；`full` 表示与文字同宽 |
| `--force` | 覆盖已存在的同名文件 |
| `--print` | 把内容输出到标准输出，跳过写文件 |
| `--json` | 结构化结果：`title / account / author / published / state / path / characters` |

## 短标题

文件名 = 当天日期 + 短标题，如 `20260910-ChatGPT+WorkBuddy 做 PPT 技巧.md`。

导出前先读懂文章，用不超过 15 个字概括核心，砍掉「一篇文章讲清楚 / 一文读懂 / 全网最全 / 建议收藏 / 深度好文」这类口水话，只留必备关键字：

- `一篇文章讲清楚当下用ChatGPT和WorkBuddy做ppt的4种好用的方法` → `ChatGPT+WorkBuddy 做 PPT 技巧`
- 原文标题本身就短就别动它。带上 `-n` 效果明显好于让工具自动截断。

## 其他

- 多个链接可以一次传入，共用一个输出目录。
- 默认存到用户文档目录的「公众号文章」文件夹（Mac：`~/Documents/公众号文章`，Windows：`C:\Users\<用户名>\Documents\公众号文章`）。
- 默认跳过同名文件；用户要求覆盖时加 `--force`。

## 安装完成后，跟用户说这句

先在用户机器上取到真实的用户目录（Mac 跑 `echo $HOME`，Windows 跑 `echo $env:USERPROFILE`），拼出 `…/Documents/公众号文章`，照下面原话说：

> 装好了。你复制粘贴微信链接给我，我会帮你导出干净的 MD 文件，默认存放在：
> `/Users/例子/Documents/公众号文章`
>
> 这里是我们自动存放的位置，如果你想放到其他地方，现在就可以告诉我，我可以给你更改默认的导出路径。

规矩：给绝对路径，不留占位符，`例子` 换成真实用户名；用户在 Mac 就只给 Mac 路径、在 Windows 就只给 Windows 路径，另一套删掉；末尾提一句对话里输入 `/wx2md` 也能触发。


## 输出格式

YAML 头信息（title、account、author、published、source）+ 正文 Markdown，图片保留远程地址并按公众号列宽约束宽度。

## 失败怎么处理

- `WECHAT_CHALLENGE`：微信要求验证。请用户在浏览器打开链接完成验证后重试。
- `CONTENT_MISSING`：页面没有返回正文（链接失效或纯 JS 渲染页面）。如实告知用户。
- `EXISTS`：文件已存在。确认后用 `--force` 重跑。
- `state: partial`：付费文章，拿到的是试读部分，回复时说明。
- 退出码非 0 表示有链接失败；`--json` 里每条结果带 `error` 和 `code`。
