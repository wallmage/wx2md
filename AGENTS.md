# AGENTS.md

本仓库是命令行工具 `wx2md`：把微信公众号文章链接导出成本地 Markdown 文件。

用户把这个仓库发给你时，读 `README.md` 里「给 AI 智能体」一节，照做即可，全程自动。

- 装：macOS / Linux → `bash scripts/install.sh`；Windows → `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install.ps1`。缺的东西脚本会自己补齐。
- 注册 `/` 命令：把 `skills/wx2md/SKILL.md` 复制到本工具自己的 skill 目录。
- 装完调用：macOS / Linux 用 `~/.wx2md/wx2md`，Windows 用 `%USERPROFILE%\.wx2md\wx2md.cmd`，参数是 `<链接>` 和 `-o <输出目录>`。
- 输出目录默认用用户的文档目录（如 `~/Documents/公众号文章`）。
