---
name: wx2md
description: 把微信公众号文章链接（mp.weixin.qq.com/s/...）导出成本地 Markdown 文件。用户给出公众号文章链接并要求「保存 / 导出 / 转成 / 存成 MD、Markdown、笔记、本地文档」时使用；也适用于批量导出多篇。
---

# 微信公众号文章 → 本地 Markdown

本机已安装的命令行工具，只做这一件事：链接进，`.md` 文件出。

## 调用

macOS / Linux：

```bash
"$HOME/.wx2md/wx2md" "<文章链接>" -o "$HOME/Documents/公众号文章" --json
```

Windows（PowerShell）：

```powershell
& "$env:USERPROFILE\.wx2md\wx2md.cmd" "<文章链接>" -o "$env:USERPROFILE\Documents\公众号文章" --json
```

首次使用前，先跑一次本仓库的 `scripts/install.sh`（Windows 用 `scripts/install.ps1`）。

参数：

| 参数 | 说明 |
| --- | --- |
| `-o, --out <路径>` | 输出目录；以 `.md` 结尾时按文件处理（配合单个链接）。默认文档目录的「公众号文章」 |
| `-w, --image-width <宽度>` | 图片最大宽度 px，默认 `677`（公众号正文列宽）；`full` 表示与文字同宽 |
| `--force` | 覆盖已存在的同名文件 |
| `--print` | 把内容输出到标准输出，跳过写文件 |
| `--json` | 结构化结果：`title / account / author / published / state / path / characters` |

- 多个链接可以一次传入，共用一个输出目录。
- 默认存到用户文档目录的「公众号文章」文件夹（Mac：`~/Documents/公众号文章`，Windows：`C:\Users\<用户名>\Documents\公众号文章`）。
- 默认跳过同名文件；用户要求覆盖时加 `--force`。

## 输出格式

YAML 头信息（title、account、author、published、source）+ 正文 Markdown，图片保留远程地址并按公众号列宽约束宽度。

## 失败怎么处理

- `WECHAT_CHALLENGE`：微信要求验证。请用户在浏览器打开链接完成验证后重试。
- `CONTENT_MISSING`：页面没有返回正文（链接失效或纯 JS 渲染页面）。如实告知用户。
- `EXISTS`：文件已存在。确认后用 `--force` 重跑。
- `state: partial`：付费文章，拿到的是试读部分，回复时说明。
- 退出码非 0 表示有链接失败；`--json` 里每条结果带 `error` 和 `code`。
