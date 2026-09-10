// 微信公众号文章 -> Markdown
// 抓取与转换规则参考 teng-lin/weread-omni 的 public-accounts 实现，去掉微信读书依赖后独立运行。
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

const USER_AGENT = "WeRead/2.1.2 WRBrand/Onyx wr_eink"; // 微信读书墨水屏 UA，公众号页面按普通网页返回
const TIMEOUT_MS = 20_000;
const MAX_BYTES = 10 * 1024 * 1024;
const MIN_CHARS = 200;
export const COLUMN_WIDTH = 677; // 公众号正文列宽，图片按它收敛，保证和原文一样的比例
const BLOCKED = /(?:访问过于频繁|环境异常|异常访问|操作频繁|请在微信客户端打开链接|需要验证|安全验证)/;
const CLOUDFLARE = /(?:cf-chl-|challenge-platform|just a moment|attention required.{0,20}cloudflare)/i;
const PAYWALL = /(?:付费后阅读|购买后阅读|付费内容|试看)/;

/** 图片标签：原文自己就窄的图保持原尺寸，宽图收敛到列宽，居中。 */
function imageTag(node, imageWidth) {
  const src = node.getAttribute("src");
  if (!src) return "";
  if (imageWidth === "full") {
    return `\n<img src="${src}" alt="" style="width:100%;height:auto;display:block;margin:1.2em auto">\n`;
  }
  const declared = Number(node.getAttribute("data-w"));
  const limit = Number.isFinite(declared) && declared > 0 ? Math.min(declared, imageWidth) : imageWidth;
  // width 属性留给会过滤 style 的阅读器（如 Obsidian），style 优先，负责窄屏自适应
  return `\n<img src="${src}" alt="" width="${limit}" style="width:100%;max-width:${limit}px;height:auto;display:block;margin:1.2em auto">\n`;
}

function createTurndown(imageWidth) {
  const service = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
    strongDelimiter: "**",
    linkStyle: "inlined",
  });
  service.use(gfm);
  service.remove(["script", "style", "noscript", "iframe"]);
  // 默认的 ![]() 无法控制宽度，宽屏下图片会按原始尺寸撑开，改成受列宽约束的 <img>
  service.addRule("image", {
    filter: "img",
    replacement: (_content, node) => imageTag(node, imageWidth),
  });
  return service;
}

export class ArticleError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ArticleError";
    this.code = code;
  }
}

/** 只接受公众号文章的 HTTPS 链接，去掉无意义的 #fragment。 */
export function normalizeUrl(input) {
  const raw = String(input ?? "").trim();
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new ArticleError("URL_INVALID", `不是合法链接：${raw}`);
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "mp.weixin.qq.com" ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== "" ||
    (url.pathname !== "/s" && !url.pathname.startsWith("/s/"))
  ) {
    throw new ArticleError("URL_INVALID", `只支持 https://mp.weixin.qq.com/s... 形式的文章链接：${raw}`);
  }
  url.hash = "";
  return url;
}

async function readBytes(response) {
  const declared = response.headers.get("content-length");
  if (declared && /^\d+$/.test(declared) && Number(declared) > MAX_BYTES) {
    throw new ArticleError("TOO_LARGE", `页面超过 ${MAX_BYTES} 字节`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_BYTES) throw new ArticleError("TOO_LARGE", `页面超过 ${MAX_BYTES} 字节`);
  return buffer;
}

/** 手动跟随跳转，识别验证码页与 Cloudflare 拦截。 */
async function fetchHtml(url, signal) {
  let current = url;
  for (let redirects = 0; ; redirects += 1) {
    const response = await fetch(current, {
      redirect: "manual",
      signal,
      headers: { accept: "text/html,application/xhtml+xml", "user-agent": USER_AGENT },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      if (redirects >= 3) throw new ArticleError("REDIRECT_LIMIT", "跳转次数超过 3 次");
      if (!location) throw new ArticleError("REDIRECT_INVALID", "跳转缺少目标地址");
      const target = new URL(location, current);
      if (target.hostname === "mp.weixin.qq.com" && target.pathname === "/mp/wappoc_appmsgcaptcha") {
        throw new ArticleError("WECHAT_CHALLENGE", "微信要求验证，请先在浏览器打开该链接完成验证后重试");
      }
      try {
        current = normalizeUrl(target.href);
      } catch {
        throw new ArticleError("REDIRECT_INVALID", `跳转到了不支持的地址：${target.href}`);
      }
      continue;
    }

    if (!response.ok) {
      const cloudflare = response.headers.has("cf-ray") || /cloudflare/i.test(response.headers.get("server") ?? "");
      await response.body?.cancel().catch(() => undefined);
      if (cloudflare && [403, 429, 503].includes(response.status)) {
        throw new ArticleError("CLOUDFLARE_CHALLENGE", `被 Cloudflare 拦截（HTTP ${response.status}）`);
      }
      throw new ArticleError("HTTP_ERROR", `页面返回 HTTP ${response.status}`);
    }
    return { html: (await readBytes(response)).toString("utf8"), url: current };
  }
}

const text = (node) => node?.textContent?.trim() ?? "";

function metaContent(document, selector) {
  return document.querySelector(`meta[property="${selector}"]`)?.getAttribute("content")?.trim() ?? "";
}

function fromScript(html, name) {
  const quoted = new RegExp(`var\\s+${name}\\s*=\\s*("|')([\\s\\S]*?)\\1`).exec(html);
  if (quoted) return quoted[2].trim();
  const decoded = new RegExp(`var\\s+${name}\\s*=\\s*htmlDecode\\("([\\s\\S]*?)"\\)`).exec(html);
  return decoded ? decoded[1].trim() : "";
}

/** Unix 秒/毫秒 -> 北京时间字符串，与本机时区无关。 */
function beijingTime(value) {
  const seconds = Number(String(value ?? "").replace(/[^\d]/g, ""));
  if (!Number.isSafeInteger(seconds) || seconds <= 0) return "";
  const ms = seconds < 1_000_000_000_000 ? seconds * 1000 : seconds;
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(ms));
  const get = (type) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")} +08:00`;
}

function yaml(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\s+/g, " ").trim()}"`;
}

/** 从页面 HTML 中取出标题、公众号、作者、发布时间与正文 Markdown。 */
export function parseArticle(html, url, { imageWidth = COLUMN_WIDTH } = {}) {
  const { document } = parseHTML(html);
  const paywall = PAYWALL.test(html);
  const blocked = BLOCKED.test(html);
  const turndown = createTurndown(imageWidth);

  let markdown = "";
  for (const selector of ["#js_content", ".rich_media_content", "#js_article"]) {
    const body = document.querySelector(selector);
    if (!body) continue;
    for (const image of body.querySelectorAll("img")) {
      const lazy = image.getAttribute("data-src");
      if (lazy) image.setAttribute("src", lazy);
      image.removeAttribute("style");
      image.removeAttribute("data-src");
    }
    const converted = turndown.turndown(body.innerHTML).trim();
    const characters = converted.replace(/!\[\]\([^)]*\)/g, "").replace(/\s/g, "").length;
    if (characters >= MIN_CHARS || (paywall && characters > 0)) {
      markdown = converted;
      break;
    }
  }

  const title =
    text(document.querySelector("#activity-name")) ||
    metaContent(document, "og:title") ||
    fromScript(html, "msg_title") ||
    document.title.trim();
  if (markdown === "") {
    if (blocked) throw new ArticleError("BLOCKED", "页面被微信拦截，正文没有返回");
    if (paywall) throw new ArticleError("PAYWALL_EMPTY", "付费文章没有返回任何正文");
    throw new ArticleError(
      "CONTENT_MISSING",
      title === ""
        ? "页面没有文章正文（链接可能已失效，或该页面需要 JS 渲染，抓不到）"
        : `正文只有不到 ${MIN_CHARS} 字，可能被截断或需要验证`,
    );
  }

  const account = text(document.querySelector("#js_name")) || fromScript(html, "nickname");
  const author = metaContent(document, "og:article:author");
  const published =
    beijingTime(fromScript(html, "ct")) ||
    beijingTime(fromScript(html, "create_time")) ||
    metaContent(document, "article:published_time");

  return {
    title: title || "wx2md",
    account,
    author: author === account ? "" : author,
    published,
    markdown,
    state: paywall ? "partial" : "complete",
    url: url.href,
  };
}

/** 拼出最终写入文件的 Markdown：YAML 头信息 + 正文。 */
export function toDocument(article) {
  const front = [
    "---",
    `title: ${yaml(article.title)}`,
    `account: ${yaml(article.account)}`,
    ...(article.author ? [`author: ${yaml(article.author)}`] : []),
    ...(article.published ? [`published: ${yaml(article.published)}`] : []),
    `source: ${article.url}`,
    ...(article.state === "partial" ? ["note: 付费文章，正文可能只有试读部分"] : []),
    "---",
    "",
  ].join("\n");
  return `${front}${article.markdown.replace(/\n*$/, "")}\n`;
}

/** 文件名安全化：去掉路径分隔符与保留字符，限制长度。 */
export function fileName(title) {
  const cleaned = String(title || "")
    .replace(/[/\\:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 100)
    .trim();
  return `${cleaned || "wx2md"}.md`;
}

/** 抓取并解析一篇文章，返回可直接落盘的 Markdown。 */
export async function fetchArticle(input, { signal, timeout = TIMEOUT_MS, imageWidth = COLUMN_WIDTH } = {}) {
  const url = normalizeUrl(input);
  const timer = AbortSignal.timeout(timeout);
  const combined = signal ? AbortSignal.any([signal, timer]) : timer;
  let page;
  try {
    page = await fetchHtml(url, combined);
  } catch (cause) {
    if (cause?.name === "TimeoutError" || timer.aborted) {
      throw new ArticleError("TIMEOUT", `抓取超时（${timeout / 1000} 秒）`);
    }
    throw cause;
  }
  if (CLOUDFLARE.test(page.html)) {
    throw new ArticleError("CLOUDFLARE_CHALLENGE", "被 Cloudflare 挑战页拦截，请稍后重试");
  }
  const article = parseArticle(page.html, page.url, { imageWidth });
  return { ...article, document: toDocument(article) };
}
