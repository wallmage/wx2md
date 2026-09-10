import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../src/cli.mjs", import.meta.url));
const urls = ["https://mp.weixin.qq.com/s/first", "https://mp.weixin.qq.com/s/second"];
const mock = `globalThis.fetch = async (url) => new Response('<html><head><title>'+ (JSON.parse(process.env.TEST_TITLES || '{}')[new URL(url).pathname] ?? (process.env.TEST_SAME_TITLE ? '同名文章' : new URL(url).pathname)) +'</title></head><body><div id="js_content">'+(process.env.TEST_LONG ? '汉'.repeat(30000)+Array.from({length:80}, (_,i)=>'<img data-src="https://example.com/'+i+'/'+'a'.repeat(160)+'.jpg">').join('') : '正文'.repeat(120))+'</div></body></html>');`;
function run(args, env = {}) {
  return spawnSync(process.execPath, ["--import", `data:text/javascript,${encodeURIComponent(mock)}`, cli, ...args], { encoding: "utf8", env: { ...process.env, ...env } });
}
async function output(t) {
  const directory = await mkdtemp(join(tmpdir(), "wx2md-cli-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test("print plus json returns one JSON document without writing files", () => {
  const result = run([urls[0], "--print", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const data = JSON.parse(result.stdout);
  assert.match(data.document, /^---\ntitle:/);
  assert.equal(data.characters, 240);
  assert.equal(data.path, undefined);
});

test("usage failures remain JSON, including missing option values", () => {
  for (const args of [["--json"], ["--json", "--unknown"], [urls[0], "--json", "-o"], [urls[0], "--json", "-n"], [urls[0], "-o", "--json"], [urls[0], "-n", "--json"], [urls[0], "--json", "-w"], [urls[0], "--json", "-n", ""]]) {
    const result = run(args);
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout).code, "USAGE", JSON.stringify(args));
    assert.equal(result.stderr, "");
  }
});

test("single output file creates its parent directories", async (t) => {
  const path = join(await output(t), "new", "article.md");
  const result = run([urls[0], "-o", path, "--json"]);
  assert.equal(result.status, 0, result.stdout);
  assert.match(await readFile(path, "utf8"), /source: https:\/\/mp.weixin.qq.com\/s\/first/);
});

test("batch accepts dotted directories and rejects an explicit file", async (t) => {
  const directory = join(await output(t), "2026.09");
  assert.equal(run([...urls, "-o", directory, "--json"]).status, 0);
  assert.equal((await readdir(directory)).length, 2);
  const result = run([...urls, "-o", join(directory, "one.md"), "--json"]);
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).code, "USAGE");
});

test("one short name cannot silently overwrite an entire batch", async (t) => {
  const directory = await output(t);
  const result = run([...urls, "-n", "同名", "--force", "-o", directory, "--json"]);
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).code, "USAGE");
  assert.deepEqual(await readdir(directory), []);
});

test("force never overwrites a successful article from the same batch", async (t) => {
  const directory = await output(t);
  const result = run([...urls, "--force", "-o", directory, "--json"], { TEST_SAME_TITLE: "1" });
  assert.equal(result.status, 1);
  const [first, second] = JSON.parse(result.stdout);
  assert.equal(second.code, "PATH_CONFLICT");
  assert.match(await readFile(first.path, "utf8"), /source: https:\/\/mp.weixin.qq.com\/s\/first/);
});

test("existing files are preserved unless force is explicit", async (t) => {
  const path = join(await output(t), "article.md");
  assert.equal(run([urls[0], "-o", path]).status, 0);
  assert.equal(JSON.parse(run([urls[1], "-o", path, "--json"]).stdout).code, "EXISTS");
  assert.match(await readFile(path, "utf8"), /\/s\/first/);
  assert.equal(run([urls[1], "-o", path, "--force"]).status, 0);
  assert.match(await readFile(path, "utf8"), /\/s\/second/);
});

test("macOS equivalent Unicode filenames cannot overwrite within a batch", { skip: process.platform !== "darwin" }, async (t) => {
  const directory = await output(t);
  const result = run([...urls, "--force", "-o", directory, "--json"], {
    TEST_TITLES: JSON.stringify({ "/s/first": "Café", "/s/second": "Cafe\u0301" }),
  });
  assert.equal(result.status, 1);
  const [first, second] = JSON.parse(result.stdout);
  assert.equal(second.code, "PATH_CONFLICT");
  assert.match(await readFile(first.path, "utf8"), /source: https:\/\/mp.weixin.qq.com\/s\/first/);
});

test("30000 Han characters plus 80 images survive stdout pipes and file export", async (t) => {
  const path = join(await output(t), "long.md");
  const env = { TEST_LONG: "1" };
  assert.equal(run([urls[0], "-o", path, "--json"], env).status, 0);
  const expected = await readFile(path, "utf8");
  assert.equal((expected.match(/汉/g) || []).length, 30000);
  assert.equal((expected.match(/<img /g) || []).length, 80);
  for (const flags of [["--print"], ["--print", "--json"]]) {
    const result = run([urls[0], ...flags], env);
    assert.equal(result.status, 0, result.stderr);
    const document = flags.includes("--json") ? JSON.parse(result.stdout).document : result.stdout;
    assert.equal(Buffer.byteLength(document), Buffer.byteLength(expected));
    assert.equal(document, expected);
  }
});
