import test from "node:test";
import assert from "node:assert/strict";
import { marked } from "marked";
import TurndownService from "turndown";
import { parseHTML } from "linkedom";
import { fetchArticle, normalizeUrl, parseArticle } from "../src/article.mjs";

const url = new URL("https://mp.weixin.qq.com/s/test");
const page = (body, extra = "") => `<html><head><title>文章</title></head><body><div id="js_content">${body}</div>${extra}</body></html>`;

test("short text and images do not depend on markup or URL length", () => {
  for (const body of ["明日休馆。", '<img data-src="https://example.com/a.jpg">', `<img data-src="https://example.com/${"a".repeat(200)}">`]) {
    assert.equal(parseArticle(page(body), url).state, "complete");
  }
});

test("empty content is rejected even when a template mentions paid content", () => {
  assert.throws(() => parseArticle(page("<p> </p>", '<script>var message="付费内容";</script>'), url), { code: "CONTENT_MISSING" });
  assert.throws(() => parseArticle('<html><body><div id="js_article"><h1>文章标题</h1></div></body></html>', url), { code: "CONTENT_MISSING" });
});

test("plain character count excludes images, URLs, whitespace and formatting", () => {
  const article = parseArticle(page('<h2>标题</h2><p>中 文 <strong>ab</strong>😀</p><a href="https://example.com">链接</a><img src="https://example.com/a.jpg"><script>ignored</script>'), url);
  assert.equal(article.characters, 9);
});

test("ordinary prose and unused templates do not mark free content as paid", () => {
  for (const extra of ["", '<script>var message="购买后阅读";</script>']) {
    assert.equal(parseArticle(page("付费内容的商业模式。".repeat(30), extra), url).state, "complete");
  }
});

test("explicit payment state distinguishes previews from purchased or free articles", () => {
  for (const script of ['var need_pay = 1;', 'var isPaySubscribe = "1"; var isPaid = "0";']) {
    assert.equal(parseArticle(page("试读正文。", `<script>${script}</script>`), url).state, "partial");
    assert.throws(() => parseArticle(page(" ", `<script>${script}</script>`), url), { code: "PAYWALL_EMPTY" });
  }
  assert.equal(parseArticle(page("正文。", '<script>var isPaySubscribe = 1; var isPaid = 1;</script>'), url).state, "complete");
  assert.equal(parseArticle(page('var need_pay = 1; 这是代码示例。', '<script>var need_pay = 0;</script>'), url).state, "complete");
});

test("image URLs survive HTML attribute serialization", () => {
  const src = 'https://example.com/a?title="quoted"&literal=&copy;';
  const body = `${"正文".repeat(110)}<img data-src="https://example.com/a?title=&quot;quoted&quot;&amp;literal=&amp;copy;">`;
  for (const imageWidth of [677, "full"]) {
    const article = parseArticle(page(body), url, { imageWidth });
    assert.equal(parseHTML(article.markdown).document.querySelector("img").getAttribute("src"), src);
  }
});

test("timestamps accept numeric assignments and malformed dates reach meta fallback", () => {
  const body = "正文".repeat(110);
  for (const value of ["1700000000", '"1700000000"', "1700000000000"]) {
    assert.equal(parseArticle(page(body, `<script>var ct = ${value};</script>`), url).published, "2023-11-15 06:13:20 +08:00");
  }
  for (const value of ["2024-11-07", "2024-11-07T23:01:59", "2024-11-07T23:01:59+08:00", "999999999999999", "-1700000000"]) {
    assert.equal(parseArticle(page(body, `<script>var create_time = "${value}";</script><meta property="article:published_time" content="2024-11-07T23:01:59+08:00">`), url).published, "2024-11-07T23:01:59+08:00");
  }
});

test("Cloudflare terminology in an article is not a challenge", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(page("just a moment, cf-chl- and challenge-platform. ".repeat(10))));
  assert.equal((await fetchArticle(url)).state, "complete");
});

test("real challenge markup and captcha redirects are rejected", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response('<html><title>Just a moment...</title><form id="challenge-form"><script src="/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1"></script></form></html>'));
  await assert.rejects(() => fetchArticle(url), { code: "CLOUDFLARE_CHALLENGE" });
  globalThis.fetch = async () => new Response(null, { status: 302, headers: { location: "/mp/wappoc_appmsgcaptcha" } });
  await assert.rejects(() => fetchArticle(url), { code: "WECHAT_CHALLENGE" });
});

test("URL restrictions remain enforced", () => {
  assert.equal(normalizeUrl(`${url.href}#rd`).href, url.href);
  for (const input of ["http://mp.weixin.qq.com/s/test", "https://example.com/s/test", "https://mp.weixin.qq.com:444/s/test", "https://user@mp.weixin.qq.com/s/test"]) {
    assert.throws(() => normalizeUrl(input), { code: "URL_INVALID" });
  }
});

test("zero-row tables cannot break the surrounding article", () => {
  for (const table of ["<table></table>", "<table><tbody></tbody></table>"]) {
    assert.equal(parseArticle(page(`前文${table}后文`), url).markdown.replace(/\s/g, ""), "前文后文");
  }
});

test("images inside retained and Markdown tables honor width and preserve URLs", () => {
  const src = 'https://example.com/a?x="quoted"&literal=&copy;';
  const img = '<img data-src="https://example.com/a?x=&quot;quoted&quot;&amp;literal=&amp;copy;" data-w="1080" style="width:1080px">';
  for (const heading of ["", "<tr><th>表头</th></tr>"]) {
    for (const width of [100, 677, "full"]) {
      const article = parseArticle(page(`<table>${heading}<tr><td>${img}</td></tr></table>`), url, { imageWidth: width });
      const image = parseHTML(article.markdown).document.querySelector("img");
      assert.equal(image.getAttribute("src"), src);
      assert.equal(image.getAttribute("width"), width === "full" ? null : String(width));
      assert.match(image.getAttribute("style"), /width:100%;/);
      if (width !== "full") assert.match(image.getAttribute("style"), new RegExp(`max-width:${width}px`));
      assert.equal(article.characters, heading ? 2 : 0);
      if (heading) assert.match(article.markdown, /---/);
      else assert.match(article.markdown, /<table>/);
    }
  }
});

test("conversion failures report an article error and retain the original cause", (t) => {
  const cause = new Error("converter failed");
  t.mock.method(TurndownService.prototype, "turndown", () => { throw cause; });
  assert.throws(() => parseArticle(page("正文"), url), (error) => error.code === "CONVERT_FAILED" && error.cause === cause);
});

test("nested layout tables preserve an originally narrow image", () => {
  const body = '<table><tr><td><table><tr><td><img data-src="https://example.com/narrow.jpg" data-w="60"></td></tr></table></td></tr></table>';
  const article = parseArticle(page(body), url, { imageWidth: 100 });
  assert.equal(parseHTML(article.markdown).document.querySelector("img").getAttribute("width"), "60");
});


test("simple tables retain their existing Markdown bytes", () => {
  assert.equal(parseArticle(page('<table><tr><th>项目</th><th>数值</th></tr><tr><td>苹果</td><td>10</td></tr></table>'), url).markdown,
    '| 项目 | 数值 |\n| --- | --- |\n| 苹果 | 10 |');
});

test("table pipes and backslashes preserve cell text when rendered", () => {
  for (const value of ['a | b', String.raw`a \| b`, String.raw`a \\| b`, '<code>a | b</code>', String.raw`<code>a \| b</code>`, '<strong>a | b</strong>']) {
    const body = `<table><tr><th>运算符</th><th>用途</th></tr><tr><td>${value}</td><td>按位或</td></tr></table>`;
    const markdown = parseArticle(page(body), url).markdown;
    const rendered = parseHTML(marked.parse(markdown)).document;
    assert.deepEqual(Array.from(rendered.querySelectorAll('tbody td'), n => n.textContent),
      [parseHTML(`<span>${value}</span>`).document.querySelector('span').textContent, '按位或'], markdown);
  }
});

test("multiline and image cells retain their row and column", () => {
  for (const value of ['第一行<br>第二行', '<p>第一段</p><p>第二段</p>', '<img data-src="https://example.com/a.jpg" data-w="1080">']) {
    const body = `<table><tr><th>项目</th><th>说明</th></tr><tr><td>${value}</td><td>解释</td></tr></table>`;
    const markdown = parseArticle(page(body), url, { imageWidth: 100 }).markdown;
    const rendered = parseHTML(marked.parse(markdown)).document;
    const rows = rendered.querySelectorAll('tr');
    assert.equal(rows.length, 2, markdown);
    assert.equal(rows[1].querySelectorAll('td').length, 2, markdown);
    assert.equal(rows[1].lastElementChild.textContent, '解释');
    if (value.startsWith('<img')) assert.equal(rows[1].firstElementChild.querySelector('img').getAttribute('width'), '100');
    else assert.match(rows[1].firstElementChild.textContent, /第一[行段]\s*第二[行段]/);
  }
});

test("merged tables retain HTML structure and image sizing", () => {
  const body = '<table><tr><th colspan="2">合并标题</th></tr><tr><td><img data-src="https://example.com/a?x=1&amp;y=2" data-w="60"></td><td>不能丢失</td></tr></table>';
  for (const imageWidth of [100, 677, 'full']) {
    const markdown = parseArticle(page(body), url, { imageWidth }).markdown;
    const rendered = parseHTML(marked.parse(markdown)).document;
    assert.equal(rendered.querySelector('th').getAttribute('colspan'), '2', markdown);
    assert.equal(rendered.querySelectorAll('td').length, 2);
    assert.equal(rendered.querySelectorAll('td')[1].textContent, '不能丢失');
    const image = rendered.querySelector('td img');
    assert.equal(image.getAttribute('width'), imageWidth === 'full' ? null : '60');
    assert.match(image.getAttribute('style'), /width:100%/);
    assert.equal(image.getAttribute('src'), 'https://example.com/a?x=1&y=2');
  }
});

test("block content inside a table retains its structure", () => {
  for (const cell of ['<pre><code>first\n\nsecond</code></pre>', '<blockquote>引文</blockquote>', '<ul><li>第一项</li><li>第二项</li></ul>']) {
    const markdown = parseArticle(page(`<table><tr><th>内容</th><th>说明</th></tr><tr><td>${cell}</td><td>保留</td></tr></table>`), url).markdown;
    const doc = parseHTML(marked.parse(markdown)).document;
    const original = parseHTML(`<div>${cell}</div>`).document.querySelector('div');
    assert.equal(doc.querySelectorAll('tbody td').length, 2, markdown);
    assert.equal(doc.querySelector('td').textContent, original.textContent, markdown);
    assert.equal(doc.querySelector('td').firstElementChild.tagName, original.firstElementChild.tagName);
  }
});
