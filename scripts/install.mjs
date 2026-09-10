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
if (major < 20 || (major === 20 && minor < 3)) {
  log(`需要 Node 20.3 以上，当前 ${process.versions.node}。请改用 scripts/install.sh 或 scripts/install.ps1 安装。`);
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

const force = process.argv.includes("--force");
if (force || !has(join(app, "node_modules", "turndown")) || !has(join(app, "node_modules", "linkedom"))) {
  const args = ["install", "--omit=dev", "--no-audit", "--no-fund"];
  log("安装依赖（linkedom、turndown）…");
  let ok = runNpm(args);
  if (!ok) {
    log("默认源失败，换国内镜像重试…");
    ok = runNpm([...args, "--registry=https://registry.npmmirror.com"]);
  }
  if (!ok) {
    log("依赖安装失败，多半是网络问题。请重跑一次安装脚本。");
    process.exit(1);
  }
} else {
  log("依赖已存在，跳过");
}

const shLauncher = `#!/bin/sh\nDIR=$(cd "$(dirname "$0")" && pwd)\nNODE="$DIR/runtime/node/bin/node"\n[ -x "$NODE" ] || NODE="$DIR/runtime/node/node.exe"\n[ -x "$NODE" ] || NODE=node\nexec "$NODE" "$DIR/app/src/cli.mjs" "$@"\n`;
const cmdLauncher = `@echo off\r\nsetlocal\r\nset NODE=%~dp0runtime\\node\\node.exe\r\nif not exist "%NODE%" set NODE=node\r\n"%NODE%" "%~dp0app\\src\\cli.mjs" %*\r\n`;
const shPath = join(home, "wx2md");
const cmdPath = join(home, "wx2md.cmd");
await writeFile(shPath, shLauncher, "utf8");
await chmod(shPath, 0o755);
await writeFile(cmdPath, cmdLauncher, "utf8");

log(`启动器：${shPath}`);
log(`启动器：${cmdPath}`);
log(`技能文件：${join(repo, "skills", "wx2md", "SKILL.md")}`);
log("");
log("用法：");
log(`  macOS/Linux  "${shPath}" "<公众号链接>"`);
log(`  Windows      "%USERPROFILE%\\.wx2md\\wx2md.cmd" "<公众号链接>"`);
log("安装完成。");
