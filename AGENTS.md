# AGENTS.md

本仓库是命令行工具 `wx2md`：把微信公众号文章链接导出成本地 Markdown 文件。

用户说「帮我安装这个仓库」时：**读 `README.md` 里「给 AI 智能体：帮我安装这个仓库」一节，照着执行完，不要向用户提问。**

要点（完整命令见 README）：

- 装：macOS / Linux → `bash scripts/install.sh`；Windows → `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install.ps1`。缺 Node 会自己下载便携版，缺依赖会自己装。
- 注册 `/` 命令：把 `skills/wx2md/SKILL.md` 复制到**本工具自己**的 skill 目录。
- 装完调用：macOS / Linux 用 `~/.wx2md/wx2md`，Windows 用 `%USERPROFILE%\.wx2md\wx2md.cmd`，参数是 `<链接>` 和 `-o <输出目录>`。
- 从用户那里只需要拿到链接；输出目录默认用用户的文档目录（如 `~/Documents/公众号文章`），不要反问。

