import assert from "node:assert/strict";
import test from "node:test";

import { crawlerTarget, isCrawler } from "../app/lib/crawlers.ts";

const googlebot = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const gptbot = "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)";
const bytespider = "Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)";
const chrome = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";

test("crawlers are told apart from people's browsers", () => {
  for (const agent of [googlebot, gptbot, bytespider, "curl/8.7.1", "python-requests/2.32"]) assert.equal(isCrawler(agent), true, agent);
  for (const agent of [chrome, iphone, "", null]) assert.equal(isCrawler(agent), false, String(agent));
});

test("a crawler on a filtered list page is sent to the page itself", () => {
  assert.equal(crawlerTarget("/", "?member=someone&weeks=4", googlebot), "/");
  assert.equal(crawlerTarget("/directory", "?track=github&lang=id", gptbot), "/directory");
  assert.equal(crawlerTarget("/leaderboard", "?of=own", bytespider), "/leaderboard");
});

test("people keep their filters, and other pages keep their query", () => {
  assert.equal(crawlerTarget("/", "?member=someone", chrome), null);
  assert.equal(crawlerTarget("/", "", googlebot), null);
  // An OAuth code or a sign-in's ?next= is not a filter.
  assert.equal(crawlerTarget("/auth/callback", "?code=abc", googlebot), null);
  assert.equal(crawlerTarget("/signin", "?next=/inbox", googlebot), null);
});
