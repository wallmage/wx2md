import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  const install = spawnSync(process.execPath, [join(repo, "scripts/install.mjs")], {
    env: { ...process.env, WX2MD_HOME: home, npm_config_offline: "true" }, encoding: "utf8",
  });
  assert.equal(install.status, 0, install.stdout + install.stderr);
  const help = spawnSync(process.execPath, [join(home, "app/src/cli.mjs"), "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /wx2md/);
});

const portable = '#!/bin/sh\n[ "$1" = "-e" ] || echo BOOTSTRAP_READY\n';
async function bootstrap(t, { existing = false, downloadFails = false, usable = true } = {}) {
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
  await writeFile(join(bundle, "node"), portable, { mode: 0o755 });
  assert.equal(spawnSync("tar", ["-czf", join(home, "node.tar.gz"), "-C", home, "node-v22.23.2-darwin-arm64"]).status, 0);
  await writeFile(join(bin, "uname"), '#!/bin/sh\nif [ "$1" = "-s" ]; then echo Darwin; else echo arm64; fi\n', { mode: 0o755 });
  await writeFile(join(bin, "curl"), `#!/bin/sh\nfor arg do target="$arg"; done\ncase "$target" in\n */index.json) echo '[{"version":"v22.23.2"}]';;\n *) ${downloadFails ? "exit 22" : 'exec /bin/cat "$HOME/node.tar.gz"'};;\nesac\n`, { mode: 0o755 });
  const result = spawnSync("/bin/bash", [join(repo, "scripts/install.sh")], {
    env: { ...process.env, HOME: home, WX2MD_HOME: join(home, ".wx2md"), PATH: `${bin}:/usr/bin:/bin`, LC_ALL: "en_US.UTF-8" }, encoding: "utf8",
  });
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
