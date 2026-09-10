import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../", import.meta.url));
async function temporary(t) {
  const directory = await mkdtemp(join(tmpdir(), "wx2md-install-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test("reinstall repairs a missing dependency and produces a working launcher", async (t) => {
  const home = await temporary(t);
  await mkdir(join(home, "app"));
  await cp(join(repo, "node_modules"), join(home, "app/node_modules"), { recursive: true });
  await rm(join(home, "app/node_modules/turndown-plugin-gfm"), { recursive: true });
  // Package the already installed dependency locally; the test starts with an empty cache.
  const fixture = join(home, "fixture");
  await mkdir(fixture);
  for (const dir of ["scripts", "src"]) await cp(join(repo, dir), join(fixture, dir), { recursive: true });
  const env = { ...process.env, WX2MD_HOME: home, npm_config_offline: "true", npm_config_cache: join(home, "empty-cache") };
  const packArgs = ["pack", join(repo, "node_modules/turndown-plugin-gfm"), "--ignore-scripts", "--json", "--pack-destination", home];
  const pack = process.env.npm_execpath
    ? spawnSync(process.execPath, [process.env.npm_execpath, ...packArgs], { env, encoding: "utf8" })
    : spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", process.platform === "win32" ? packArgs.map((arg) => `"${arg}"`) : packArgs, { env, encoding: "utf8", shell: process.platform === "win32" });
  assert.equal(pack.status, 0, pack.stderr);
  const manifest = JSON.parse(await readFile(join(repo, "package.json"), "utf8"));
  manifest.dependencies["turndown-plugin-gfm"] = `file:${join(home, JSON.parse(pack.stdout)[0].filename)}`;
  await writeFile(join(fixture, "package.json"), JSON.stringify(manifest));
  const install = spawnSync(process.execPath, [join(fixture, "scripts/install.mjs")], { env, encoding: "utf8" });
  assert.equal(install.status, 0, install.stdout + install.stderr);
  const launcher = join(home, process.platform === "win32" ? "wx2md.cmd" : "wx2md");
  const help = () => spawnSync(launcher, ["--help"], { encoding: "utf8", shell: process.platform === "win32" });
  assert.equal(help().status, 0);
  assert.match(help().stdout, /wx2md/);
  if (process.platform === "win32") {
    // A fixture CLI records the exact arguments forwarded by the real generated launchers.
    await writeFile(join(home, "app/src/cli.mjs"), 'console.log(JSON.stringify(process.argv.slice(2)))');
    const forwarded = ['https://mp.weixin.qq.com/s?__biz=abc&mid=123&idx=1&sn=def&name=中文 空格', '-n', '标题 空格 & = 值', '--json'];
    const runtime = join(home, 'runtime/node');
    await mkdir(runtime, { recursive: true });
    await cp(process.execPath, join(runtime, 'node.exe'));
    for (const shell of ['powershell', 'pwsh']) {
      const version = spawnSync(shell, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'], { encoding: 'utf8' });
      await t.test(`${shell} ${version.stdout?.trim()} forwards complete URLs and spaces`, { skip: version.status !== 0 }, async () => {
        const harness = join(home, 'forward.ps1');
        const launcher = join(home, 'wx2md.ps1');
        const env = { ...process.env, WX2MD_TEST_ARGS: JSON.stringify(forwarded), WX2MD_TEST_LAUNCHER: launcher, WX2MD_TEST_SHELL: shell };
        for (const command of ['& $env:WX2MD_TEST_LAUNCHER @forwarded', '& $env:WX2MD_TEST_SHELL -NoProfile -ExecutionPolicy Bypass -File $env:WX2MD_TEST_LAUNCHER @forwarded', '$env:PATH = [Environment]::SystemDirectory\n& $env:WX2MD_TEST_LAUNCHER @forwarded']) {
          await writeFile(harness, `\uFEFF$ErrorActionPreference = 'Stop'\n$forwarded = @(ConvertFrom-Json $env:WX2MD_TEST_ARGS)\n${command}\nexit $LASTEXITCODE\n`);
          const result = spawnSync(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', harness], { env, encoding: 'utf8' });
          assert.equal(result.status, 0, result.stdout + result.stderr);
          assert.deepEqual(JSON.parse(result.stdout), forwarded);
        }
      });
    }
    const bash = join(process.env.ProgramFiles, 'Git/bin/bash.exe');
    await t.test('Git Bash uses portable Windows Node without system Node', { skip: !existsSync(bash) }, async () => {
      const result = spawnSync(bash, ['--noprofile', '--norc', '-c', 'PATH=/usr/bin:/bin\nexec "$1" "$2" -n "$3" --json', 'wx2md-test', join(home, 'wx2md').replaceAll('\\', '/'), forwarded[0], forwarded[2]], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), forwarded);
    });
  }
  if (process.platform !== "win32") {
    const runtime = join(home, "runtime/node/bin");
    await mkdir(runtime, { recursive: true });
    await writeFile(join(runtime, "node"), "#!/bin/sh\nexit 41\n", { mode: 0o755 });
    assert.equal(help().status, 0, "a broken portable runtime must not hide working system Node");
    const bin = join(home, "bin");
    await mkdir(bin);
    await writeFile(join(bin, "node"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
    const noSystem = { ...process.env, PATH: `${bin}:/usr/bin:/bin` };
    const unavailable = spawnSync(launcher, ["--help"], { env: noSystem, encoding: "utf8" });
    assert.equal(unavailable.status, 1);
    assert.match(unavailable.stderr, /Node 20.19/);
    await writeFile(join(runtime, "node"), `#!/bin/sh\nexec '${process.execPath.replaceAll("'", "'\\''")}' "$@"\n`);
    await chmod(join(runtime, "node"), 0o755);
    const portableHelp = spawnSync(launcher, ["--help"], { env: noSystem, encoding: "utf8" });
    assert.equal(portableHelp.status, 0, portableHelp.stderr);
    assert.match(portableHelp.stdout, /wx2md/);
  }

});

const portable = '#!/bin/sh\n[ "$1" = "-e" ] || echo BOOTSTRAP_READY\n';
async function bootstrap(t, { existing = false, downloadFails = false, usable = true, switchFails = false, newUsable = true } = {}) {
  const home = await temporary(t);
  const bin = join(home, "bin");
  await mkdir(bin);
  await writeFile(join(bin, "node"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  const runtime = join(home, ".wx2md/runtime/node/bin/node");
  if (existing) {
    await mkdir(join(home, ".wx2md/runtime/node/bin"), { recursive: true });
    await writeFile(runtime, usable ? portable : "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  }
  const bundle = join(home, "node-v22.23.2-darwin-arm64/bin");
  await mkdir(bundle, { recursive: true });
  await writeFile(join(bundle, "node"), newUsable ? portable : "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  assert.equal(spawnSync("tar", ["-czf", join(home, "node.tar.gz"), "-C", home, "node-v22.23.2-darwin-arm64"]).status, 0);
  await writeFile(join(bin, "uname"), '#!/bin/sh\nif [ "$1" = "-s" ]; then echo Darwin; else echo arm64; fi\n', { mode: 0o755 });
  await writeFile(join(bin, "curl"), `#!/bin/sh\nfor arg do target="$arg"; done\ncase "$target" in\n */index.json) echo '[{"version":"v22.23.2"}]';;\n *) ${downloadFails ? "exit 22" : 'exec /bin/cat "$HOME/node.tar.gz"'};;\nesac\n`, { mode: 0o755 });
  if (switchFails) await writeFile(join(bin, "mv"), '#!/bin/sh\ncase "$1" in */node-v*) touch "$HOME/move-injected"; exit 42;; esac\nexec /bin/mv "$@"\n', { mode: 0o755 });
  const result = spawnSync("/bin/bash", [join(repo, "scripts/install.sh")], {
    env: { ...process.env, HOME: home, WX2MD_HOME: join(home, ".wx2md"), PATH: `${bin}:/usr/bin:/bin`, LC_ALL: "en_US.UTF-8" }, encoding: "utf8",
  });
  if (switchFails) assert.ok(existsSync(join(home, "move-injected")), "test harness did not intercept mv");
  return { result, runtime };
}

test("fresh bootstrap works in a UTF-8 shell without system Node", { skip: process.platform === "win32" }, async (t) => {
  const { result } = await bootstrap(t);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /BOOTSTRAP_READY/);
});

test("reinstall reuses a working portable Node even if downloads fail", { skip: process.platform === "win32" }, async (t) => {
  const { result, runtime } = await bootstrap(t, { existing: true, downloadFails: true });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(await readFile(runtime, "utf8"), portable);
});

test("failed runtime replacement preserves the previous runtime", { skip: process.platform === "win32" }, async (t) => {
  const { result, runtime } = await bootstrap(t, { existing: true, usable: false, downloadFails: true });
  assert.notEqual(result.status, 0);
  assert.equal(await readFile(runtime, "utf8"), "#!/bin/sh\nexit 1\n");
});

for (const failure of ["switchFails", "newUsable"]) {
  test(`runtime survives ${failure === "switchFails" ? "a failed move" : "an invalid download"}`, { skip: process.platform === "win32" }, async (t) => {
    const { result, runtime } = await bootstrap(t, { existing: true, usable: false, [failure]: failure === "switchFails" });
    assert.notEqual(result.status, 0);
    assert.equal(await readFile(runtime, "utf8"), "#!/bin/sh\nexit 1\n");
  });
}
