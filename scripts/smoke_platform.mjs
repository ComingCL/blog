// Real-browser regression check for a disposable local deployment only.
// node scripts/smoke_platform.mjs deploy/runtime/error-smoke /path/to/chrome
import assert from "node:assert/strict";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
const require = createRequire(new URL("../web/package.json", import.meta.url));
const { chromium } = require("playwright-core");
const { parse } = require("yaml");
const directory = resolve(process.argv[2] || "deploy/runtime/error-smoke");
const state = JSON.parse(
  readFileSync(resolve(directory, "state.json"), "utf8"),
);
const origin = new URL(state.origin);
assert(
  origin.protocol === "http:" &&
    origin.hostname === "127.0.0.1" &&
    Number(origin.port) >= 1024 &&
    state.project.endsWith("-smoke"),
  "Only a disposable local *-smoke deployment is permitted",
);
assert(
  process.argv[3],
  "Pass the executable path to an installed Chrome/Chromium browser",
);
const config = parse(readFileSync(resolve(directory, "config.yaml"), "utf8"));
const output = resolve(directory, "ui-checks");
mkdirSync(output, { recursive: true, mode: 0o700 });
const browser = await chromium.launch({
  executablePath: process.argv[3],
  headless: true,
});
const admin = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: "reduce",
});
const visitor = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: "reduce",
});
const page = await admin.newPage();
const reader = await visitor.newPage();
const errors = [];
for (const p of [page, reader])
  p.on("pageerror", (error) => errors.push(error.message));
const nonce = randomBytes(5).toString("hex");
const title = "窗边的旅行笔记 " + nonce;
const username = "reader_" + nonce;
const password = randomBytes(20).toString("base64url");
const nextPassword = randomBytes(20).toString("base64url");
const secrets = [config.admin.password, password, nextPassword];
let phase = "初始化";
async function request(context, url, options = {}) {
  // The suite shares one source IP across several readers. Respect production
  // throttling instead of disabling it or exhausting the retry window.
  for (let attempt = 0; ; attempt++) {
    const response = await context.request.fetch(url, options);
    if (response.status() !== 429 || attempt === 1) return response;
    const seconds = Number(response.headers()["retry-after"] || 60);
    assert(
      Number.isFinite(seconds) && seconds > 0 && seconds <= 60,
      "Invalid retry window",
    );
    console.log("Waiting for the server rate-limit window: " + seconds + "s");
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }
}
async function api(context, path, method = "GET", data) {
  const headers = { Origin: origin.origin };
  if (method !== "GET")
    headers["X-CSRF-Token"] = (
      await (await request(context, origin + "v1/api/auth/csrf")).json()
    ).data.token;
  const response = await request(context, origin + "v1/api" + path, {
    method,
    headers,
    data,
  });
  assert(response.ok(), `${method} ${path}: HTTP ${response.status()}`);
  const envelope = await response.json();
  assert.equal(envelope.code, "OK");
  return envelope.data;
}
async function goto(p, path) {
  const response = await p.goto(origin + "v1" + path);
  assert(response.status() < 400, `${path}: HTTP ${response.status()}`);
}
async function shot(p, name) {
  await p.evaluate(() => document.fonts.ready);
  assert.equal(
    await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
    `horizontal overflow: ${name}`,
  );
  await p.screenshot({ path: resolve(output, name + ".png"), fullPage: true });
}
async function focused(p, locator) {
  // Radix restores focus after its unmount task, after the dialog is hidden.
  await p.waitForFunction(
    (el) => el === document.activeElement,
    await locator.elementHandle(),
    { timeout: 3000 },
  );
}
try {
  phase = "后台登录及写作";
  await goto(page, "/admin/posts");
  await page.getByRole("button", { name: "去登录" }).click();
  await page
    .getByRole("textbox", { name: "用户名", exact: true })
    .fill(config.admin.username);
  await page.getByLabel("密码", { exact: true }).fill(config.admin.password);
  await page.getByRole("button", { name: "走进这扇窗" }).click();
  await page.getByRole("heading", { name: "文章管理" }).waitFor();
  const before = (await api(admin, "/admin/posts")).pagination.total;
  await page.getByRole("link", { name: "＋ 写文章", exact: true }).click();
  await page.getByLabel("文章标题", { exact: true }).fill(title);
  await page.getByLabel("固定链接 slug").fill("platform-" + nonce);
  const markdown =
    "## **一次**停留\n\n把远方写成日常。\n\n```md\n## 只是代码\n```\n\n第二节\n---\n\n![窗边](/v1/images/rainy-night-poster.jpg)\n\n[雨夜片段](/v1/images/rainy-night-loop.mp4)";
  await page.getByRole("textbox", { name: "Markdown 正文" }).fill(markdown);
  const postID = page.url().match(/posts\/([^/]+)\/edit/)[1];
  assert.equal(
    (await api(admin, "/admin/posts")).pagination.total,
    before + 1,
    "one writing action must create exactly one draft",
  );
  // A real navigation must wait for explicit save confirmation, and cancel restores focus.
  await page.getByRole("link", { name: "← 文章管理", exact: true }).click();
  await page.getByRole("alertdialog").waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("alertdialog").waitFor({ state: "hidden" });
  assert(page.url().endsWith("/edit"));
  await page.getByRole("link", { name: "← 文章管理", exact: true }).click();
  await page.getByRole("button", { name: "保存并离开", exact: true }).click();
  await page.getByRole("heading", { name: "文章管理" }).waitFor();
  assert.equal(
    (await api(admin, "/admin/posts/" + postID + "/draft")).markdown,
    markdown,
  );
  await page
    .getByRole("row")
    .filter({ hasText: title })
    .getByRole("link", { name: "编辑", exact: true })
    .click();
  await page.getByRole("button", { name: "预览", exact: true }).click();
  await page.getByRole("heading", { name: title, exact: true }).waitFor();
  await page.getByRole("link", { name: "返回编辑器 ↗" }).click();
  await page.getByRole("button", { name: "发布文章 ↗" }).click();
  await page.getByRole("heading", { name: "文章管理" }).waitFor();
  await page
    .getByRole("row")
    .filter({ hasText: title })
    .getByText("● 已发布", { exact: true })
    .waitFor();
  await shot(page, "admin-desktop");
  console.log(
    "PASS: authenticated editor, one draft, guarded navigation, save, preview, publish",
  );

  phase = "阅读、目录与媒体";
  await goto(reader, "/posts/platform-" + nonce);
  await reader.getByRole("heading", { name: title, exact: true }).waitFor();
  const toc = reader.getByRole("complementary", { name: "文章目录" });
  assert.deepEqual(await toc.getByRole("link").allTextContents(), [
    "一次停留",
    "第二节",
  ]);
  await reader.getByRole("button", { name: "预览图片：窗边" }).click();
  await reader.getByRole("dialog").waitFor();
  await reader.keyboard.press("Escape");
  await reader.getByRole("dialog").waitFor({ state: "hidden" });
  await focused(reader, reader.getByRole("button", { name: "预览图片：窗边" }));
  await reader.getByRole("button", { name: "预览视频：雨夜片段" }).click();
  assert.equal(
    await reader.getByRole("dialog").locator("video[controls]").count(),
    1,
  );
  await reader.keyboard.press("Escape");
  await reader.getByRole("dialog").waitFor({ state: "hidden" });
  console.log(
    "PASS: article SSR, Markdown index, image/video dialogs and Escape focus restoration",
  );

  phase = "注册、评论与个人记录";
  const comment = "想去看一场山间的雨 " + nonce;
  await reader.getByRole("textbox", { name: "聊聊你的想法" }).fill(comment);
  await reader.getByRole("button", { name: "登录后留言" }).click();
  await reader
    .getByRole("dialog")
    .getByRole("button", { name: "注册", exact: true })
    .click();
  await reader
    .getByRole("textbox", { name: "用户名", exact: true })
    .fill(username);
  await reader.getByRole("textbox", { name: "昵称", exact: true }).fill("旅人");
  await reader.getByLabel("密码", { exact: true }).fill(password);
  await reader.getByRole("button", { name: "创建账号", exact: true }).click();
  await reader.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(
    await reader.getByRole("textbox", { name: "聊聊你的想法" }).inputValue(),
    comment,
  );
  await reader.getByRole("button", { name: "发布留言 ↗" }).click();
  await reader
    .locator(".nl-comment-content > p")
    .filter({ hasText: comment })
    .waitFor();
  await reader.getByRole("button", { name: /^♡ 点赞/ }).click();
  await reader.getByRole("button", { name: /^♥ 已点赞/ }).waitFor();
  await reader.getByRole("button", { name: "收藏文章 ＋" }).click();
  await reader.getByRole("button", { name: "已收藏 ✓" }).waitFor();
  await goto(reader, "/me/bookmarks");
  await reader.getByRole("heading", { name: title, exact: true }).waitFor();
  await reader.getByRole("button", { name: "取消收藏" }).click();
  await reader.getByRole("link", { name: "去读一篇喜欢的文章 ↗" }).waitFor();
  await reader.getByRole("link", { name: "我的点赞", exact: true }).click();
  await reader.getByRole("heading", { name: title, exact: true }).waitFor();
  assert.equal(
    (await visitor.request.get(origin + "v1/api/admin/posts")).status(),
    403,
  );
  console.log(
    "PASS: registration preserves comment draft; comments, like/bookmark and private collections; reader denied admin API",
  );

  phase = "后台评论回复";
  await goto(page, "/admin/comments");
  const thread = page.locator(".nl-inbox-item").filter({ hasText: comment });
  await thread.getByRole("button", { name: "回复", exact: true }).click();
  await thread
    .getByRole("textbox", { name: "以博主身份回复" })
    .fill("谢谢来访，愿旅途有风景。");
  await thread.getByRole("button", { name: "发送回复" }).click();
  await thread
    .locator(".nl-reply > p")
    .filter({ hasText: "谢谢来访，愿旅途有风景。" })
    .waitFor();
  const comments = await api(visitor, "/posts/" + postID + "/comments");
  assert(
    comments.list
      .find((c) => c.body === comment)
      .replies.some((c) => c.body === "谢谢来访，愿旅途有风景。"),
  );
  await thread.getByRole("button", { name: "隐藏", exact: true }).click();
  await thread.getByRole("button", { name: "恢复显示", exact: true }).waitFor();
  assert(
    !(await api(visitor, "/posts/" + postID + "/comments")).list.some(
      (c) => c.body === comment,
    ),
  );
  await thread.getByRole("button", { name: "恢复显示", exact: true }).click();
  await thread.getByRole("button", { name: "隐藏", exact: true }).waitFor();
  console.log("PASS: comment reply, moderation and restore");

  phase = "账号和站点配置";
  await goto(reader, "/me/settings");
  await reader
    .getByRole("textbox", { name: "昵称", exact: true })
    .fill("旅行中的读者");
  await reader.getByRole("button", { name: "保存昵称" }).click();
  await reader
    .getByRole("link", { name: "旅行中的读者", exact: true })
    .waitFor();
  await reader.getByLabel("当前密码", { exact: true }).fill(password);
  await reader.getByLabel("新密码", { exact: true }).fill(nextPassword);
  await reader.getByRole("button", { name: "修改密码" }).click();
  await reader.getByRole("button", { name: "去登录" }).waitFor();
  await api(visitor, "/auth/login", "POST", {
    username,
    password: nextPassword,
  });
  const oldSite = await api(admin, "/admin/settings");
  await goto(page, "/admin/settings");
  await page.getByLabel("博客名称", { exact: true }).fill("窗边旅行记");
  await page.getByRole("button", { name: "保存设置 ↗" }).click();
  await page
    .locator("[data-site-name]")
    .filter({ hasText: "窗边旅行记" })
    .waitFor();
  assert.equal((await api(visitor, "/site")).name, "窗边旅行记");
  await api(admin, "/admin/settings", "PUT", {
    ...oldSite,
    version: (await api(admin, "/site")).version,
  });
  console.log(
    "PASS: nickname, password/session revocation, configurable site name",
  );

  phase = "手机、减少动态效果与删除确认";
  await page.setViewportSize({ width: 390, height: 844 });
  await goto(page, "/admin/posts");
  const row = page.getByRole("row").filter({ hasText: title });
  await row.getByRole("button", { name: "删除", exact: true }).click();
  await page.getByRole("alertdialog").waitFor();
  await shot(page, "confirm-mobile");
  await page.keyboard.press("Escape");
  await page.getByRole("alertdialog").waitFor({ state: "hidden" });
  await shot(page, "admin-mobile");
  const date = await row.locator(".nl-post-date").evaluate((el) => ({
    height: el.getBoundingClientRect().height,
    line: parseFloat(getComputedStyle(el).lineHeight),
  }));
  assert(date.height <= date.line + 2, "mobile date wraps across lines");
  await goto(page, "");
  assert.equal(
    await page.locator(".nl-hero-video").count(),
    0,
    "reduced motion should disable video",
  );
  assert.equal(
    await page.getByRole("heading", { name: title, exact: true }).count(),
    1,
    "home duplicates an article",
  );
  await shot(page, "home-mobile");
  await reader.setViewportSize({ width: 390, height: 844 });
  await goto(reader, "/posts/platform-" + nonce);
  await reader.getByRole("heading", { name: title, exact: true }).waitFor();
  await shot(reader, "article-mobile");
  const guest = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const guestPage = await guest.newPage();
  guestPage.on("pageerror", (error) => errors.push(error.message));
  await goto(guestPage, "");
  const login = guestPage.getByRole("button", { name: "登录 / 注册" });
  await login.click();
  await guestPage.getByRole("dialog").waitFor();
  await shot(guestPage, "auth-mobile");
  await guestPage.keyboard.press("Escape");
  await guestPage.getByRole("dialog").waitFor({ state: "hidden" });
  await focused(guestPage, login);
  await guest.close();
  console.log(
    "PASS: mobile layouts, login/confirmation keyboard dismissal, reduced motion",
  );

  phase = "留言板和文章回收恢复";
  await goto(reader, "/guestbook");
  const guestMessage = "窗边留个脚印 " + nonce;
  await reader
    .getByRole("textbox", { name: "留下一点想说的话" })
    .fill(guestMessage);
  await reader.getByRole("button", { name: "发布留言 ↗" }).click();
  const guestComment = reader
    .locator(".nl-comment")
    .filter({ hasText: guestMessage });
  await guestComment.getByRole("button", { name: "删除", exact: true }).click();
  await reader
    .getByRole("alertdialog")
    .getByRole("button", { name: "删除留言", exact: true })
    .click();
  await guestComment.waitFor({ state: "hidden" });
  assert(
    !(await api(visitor, "/guestbook")).list.some(
      (c) => c.body === guestMessage,
    ),
  );
  await goto(page, "/admin/posts");
  await page
    .getByRole("row")
    .filter({ hasText: title })
    .getByRole("button", { name: "删除", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "移入回收站", exact: true })
    .click();
  await page.getByRole("button", { name: "回收站", exact: true }).click();
  const trashed = page.getByRole("row").filter({ hasText: title });
  await trashed.getByRole("button", { name: "恢复", exact: true }).waitFor();
  assert.equal(
    (
      await visitor.request.get(origin + "v1/api/posts/platform-" + nonce)
    ).status(),
    404,
  );
  await trashed.getByRole("button", { name: "恢复", exact: true }).click();
  await trashed.waitFor({ state: "hidden" });
  const restored = await api(admin, "/admin/posts/" + postID + "/draft");
  assert.equal(
    restored.markdown,
    markdown,
    "trash/restore must retain the draft",
  );
  console.log("PASS: guestbook creation/deletion and article trash/restore");

  phase = "附属入口与审计";
  for (const path of ["/about", "/feed.xml", "/sitemap.xml", "/robots.txt"])
    assert.equal(
      (await admin.request.get(origin + "v1" + path)).status(),
      200,
      path,
    );
  assert.equal(
    (await admin.request.get(origin + "v1/posts/missing-" + nonce)).status(),
    404,
  );
  assert((await api(admin, "/admin/audits")).list.length > 0);
  assert.deepEqual(errors, [], "browser runtime errors");
  console.log("PASS: privacy, RSS, sitemap, robots, 404 and audit records");
  console.log("Screenshots: " + output);
} catch (error) {
  let message = error instanceof Error ? error.message : "Unknown test failure";
  for (const secret of secrets)
    message = message.split(secret).join("[REDACTED]");
  console.error("FAIL [" + phase + "]: " + message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
