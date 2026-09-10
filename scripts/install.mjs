// 无交互安装：把工具装到 ~/.wx2md，缺什么装什么，全程不提问。
import { spawnSync } from "node:child_process";
import { chmod, cp, mkdir, writeFile } from "node:fs/promises";
import { accessSync, constants } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const home = process.env.WX2MD_HOME || join(homedir(), ".wx2md");
const app = join(home, "app");
const log = (line) => process.stdout.write(`${line}\n`);
const has = (path) => {
  try {
    accessSync(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 20 || (major === 20 && minor < 19)) {
  log(`需要 Node 20.19 以上，当前 ${process.versions.node}。请改用 scripts/install.sh 或 scripts/install.ps1 安装。`);
  process.exit(1);
}

await mkdir(app, { recursive: true });
await cp(join(repo, "src"), join(app, "src"), { recursive: true, force: true });
for (const file of ["package.json", "package-lock.json", "README.md"]) {
  if (has(join(repo, file))) await cp(join(repo, file), join(app, file), { force: true });
}
log(`代码就位：${app}`);

/** 优先用当前 Node 自带的 npm-cli.js，找不到再退回 PATH 上的 npm。 */
function npmCli() {
  const bin = dirname(process.execPath);
  return [
    join(bin, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
    join(bin, "node_modules", "npm", "bin", "npm-cli.js"),
  ].find(has);
}

function runNpm(args) {
  const cli = npmCli();
  const [command, argv] = cli ? [process.execPath, [cli, ...args]] : ["npm", args];
  return spawnSync(command, argv, { cwd: app, stdio: "inherit" }).status === 0;
}

const args = ["install", "--omit=dev", "--no-audit", "--no-fund"];
log("同步依赖…");
let ok = runNpm(args);
if (!ok) {
  log("默认源失败，换国内镜像重试…");
  ok = runNpm([...args, "--registry=https://registry.npmmirror.com"]);
}
if (!ok) {
  log("依赖安装失败，多半是网络问题。请重跑一次安装脚本。");
  process.exit(1);
}

const check = 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>20||(a===20&&b>=19)?0:1)';
const shLauncher = `#!/bin/sh
DIR=$(cd "$(dirname "$0")" && pwd)
CHECK='${check}'
for NODE in node "$DIR/runtime/node/bin/node"${process.platform === "win32" ? ' "$DIR/runtime/node/node.exe"' : ""}; do
  if "$NODE" -e "$CHECK" >/dev/null 2>&1; then
    exec "$NODE" "$DIR/app/src/cli.mjs" "$@"
  fi
done
echo "需要可用的 Node 20.19+，请重新运行安装脚本。" >&2
exit 1
`;
const cmdLauncher = [
  "@echo off", "setlocal", "set NODE=node",
  `node -e "${check.replaceAll('"', "'")}" >nul 2>&1`,
  "if not errorlevel 1 goto run",
  'set "NODE=%~dp0runtime\\node\\node.exe"',
  `"%NODE%" -e "${check.replaceAll('"', "'")}" >nul 2>&1`,
  "if not errorlevel 1 goto run",
  "echo Node 20.19+ is required. Please run the installer again. 1>&2", "exit /b 1",
  ":run", '"%NODE%" "%~dp0app\\src\\cli.mjs" %*', "exit /b %errorlevel%", "",
].join("\r\n");
const psLauncher = `\uFEFF$ErrorActionPreference = 'Stop'
$Check = '${check.replace('split(".")', 'split(/[.]/)')}'
foreach ($Node in @('node', (Join-Path $PSScriptRoot 'runtime\\node\\node.exe'))) {
  try {
    & $Node -e $Check *> $null
    if ($LASTEXITCODE -ne 0) { continue }
  } catch { continue }
  & $Node (Join-Path $PSScriptRoot 'app\\src\\cli.mjs') @args
  exit $LASTEXITCODE
}
[Console]::Error.WriteLine('Node 20.19+ is required. Please run the installer again.')
exit 1
`;
const shPath = join(home, "wx2md");
const cmdPath = join(home, "wx2md.cmd");
const psPath = join(home, "wx2md.ps1");
await writeFile(shPath, shLauncher, "utf8");
await chmod(shPath, 0o755);
await writeFile(cmdPath, cmdLauncher, "utf8");
await writeFile(psPath, psLauncher, "utf8");

log(`启动器：${shPath}`);
log(`启动器：${cmdPath}`);
log(`启动器：${psPath}`);
log(`技能文件：${join(repo, "skills", "wx2md", "SKILL.md")}`);
log("");
log("用法：");
log(`  macOS/Linux  "${shPath}" "<公众号链接>"`);
log(`  Windows      "%USERPROFILE%\\.wx2md\\wx2md.cmd" "<公众号链接>"`);
log("安装完成。");
