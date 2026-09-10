#!/usr/bin/env node
// 用法：wx2md <文章链接...> [-o <文件或目录>] [--force] [--print] [--json]
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { ArticleError, COLUMN_WIDTH, fetchArticle, fileName, shortTitle } from "./article.mjs";

/** 默认输出目录：用户的文档目录下「公众号文章」。 */
const DEFAULT_DIR = join(homedir(), "Documents", "公众号文章");

const HELP = `wx2md — 把微信公众号文章导出为本地 Markdown

用法
  wx2md <链接...> [-o <文件或目录>]

参数
  -o, --out <路径>       输出文件（单个链接，需以 .md 结尾）或输出目录（默认文档目录下的「公众号文章」）
  -n, --name <短标题>    单篇文件名用的短标题（默认按原文标题压缩）
  -w, --image-width <宽度>  图片最大宽度，单位 px，默认 ${COLUMN_WIDTH}（公众号正文列宽）
                        写 full 表示图片和文字同宽（跟随窗口）
      --force            覆盖已存在的文件
      --print            把 Markdown 打到标准输出，不写文件
      --json             以 JSON 输出结果；配合 --print 时正文放入 document 字段
  -h, --help             显示帮助
`;

function parseArgv(argv) {
  const options = {
    urls: [],
    out: undefined,
    name: undefined,
    imageWidth: COLUMN_WIDTH,
    force: false,
    print: false,
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") options.help = true;
    else if (["-o", "--out", "-n", "--name", "-w", "--image-width"].includes(arg)) {
      const value = argv[++i];
      if (!value?.trim() || value.startsWith("-")) throw new ArticleError("USAGE", `${arg} 需要一个参数值`);
      if (arg === "-o" || arg === "--out") options.out = value;
      else if (arg === "-n" || arg === "--name") options.name = value;
      else options.imageWidth = imageWidthOf(value);
    }
    else if (arg === "--force") options.force = true;
    else if (arg === "--print" || arg === "--stdout") options.print = true;
    else if (arg === "--json") options.json = true;
    else if (arg.startsWith("-")) throw new ArticleError("USAGE", `未知参数：${arg}`);
    else options.urls.push(arg);
  }
  return options;
}

function imageWidthOf(value) {
  if (value === undefined) throw new ArticleError("USAGE", "--image-width 需要一个宽度值");
  if (/^(full|100%)$/i.test(value)) return "full";
  const pixels = Number(value);
  if (!Number.isFinite(pixels) || pixels < 80) throw new ArticleError("USAGE", "--image-width 需要不小于 80 的数字，或 full");
  return Math.round(pixels);
}

/** --out 以 .md 结尾时当作文件路径，否则当作目录。 */
const isOutputFile = (out) => [".md", ".markdown"].includes(extname(out).toLowerCase());
function targetPath(options, article) {
  if (options.out && isOutputFile(options.out)) {
    return resolve(options.out);
  }
  const directory = resolve(options.out ?? DEFAULT_DIR);
  return resolve(directory, fileName(options.name || shortTitle(article.title)));
}

async function save(path, content, force) {
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(path, content, { encoding: "utf8", flag: force ? "w" : "wx" });
  } catch (cause) {
    if (cause.code === "EEXIST") throw new ArticleError("EXISTS", `文件已存在：${path}（加 --force 覆盖）`);
    throw cause;
  }
  return path;
}

async function run(argv) {
  const options = parseArgv(argv);
  if (options.help || options.urls.length === 0) {
    if (!options.help && options.json) throw new ArticleError("USAGE", "需要至少一个文章链接");
    process.stdout.write(HELP);
    return options.help ? 0 : 1;
  }
  if (options.out && options.urls.length > 1 && isOutputFile(options.out)) {
    throw new ArticleError("USAGE", "多个链接时 --out 只能是目录");
  }
  if (options.name && options.urls.length > 1) throw new ArticleError("USAGE", "--name 只支持单个链接；批量时请分别调用");

  const results = [];
  const saved = new Set();
  let failed = 0;
  for (const input of options.urls) {
    try {
      const article = await fetchArticle(input, { imageWidth: options.imageWidth });
      const path = options.print ? undefined : targetPath(options, article);
      if (path) {
        let key = process.platform === "darwin" ? path.normalize("NFC") : path;
        if (process.platform === "darwin" || process.platform === "win32") key = key.toLowerCase();
        if (saved.has(key)) throw new ArticleError("PATH_CONFLICT", `本批次已有文章使用此路径：${path}；请用不同短标题分别导出`);
        await save(path, article.document, options.force);
        saved.add(key);
      }
      if (options.print && !options.json) process.stdout.write(article.document);
      results.push({
        source: article.url,
        title: article.title,
        account: article.account,
        author: article.author,
        published: article.published,
        state: article.state,
        path,
        characters: article.characters,
        ...(options.print && options.json ? { document: article.document } : {}),
      });
    } catch (cause) {
      failed += 1;
      const error = cause instanceof Error ? cause : new Error(String(cause));
      results.push({ source: String(input), error: error.message, code: error.code ?? "UNKNOWN" });
      if (!options.json) process.stderr.write(`失败 ${input}：${error.message}\n`);
    }
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify(results.length === 1 ? results[0] : results, null, 2)}\n`);
  } else if (!options.print) {
    for (const result of results) {
      if (result.error) continue;
      process.stdout.write(`${result.path}  (${result.title} — ${result.account})\n`);
    }
  }
  return failed === 0 ? 0 : 1;
}

run(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (cause) => {
    if (process.argv.slice(2).includes("--json")) {
      process.stdout.write(`${JSON.stringify({ error: cause.message, code: cause.code ?? "UNKNOWN" })}\n`);
    } else {
      process.stderr.write(`${cause.message}\n`);
    }
    process.exit(1);
  },
);
