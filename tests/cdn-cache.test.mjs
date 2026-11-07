import assert from "node:assert/strict";
import test from "node:test";

import { guestVary, sessionCookieNames } from "../app/lib/cdn-cache.ts";

test("the session cookie is named after the Supabase project, with its chunks", () => {
  assert.deepEqual(sessionCookieNames("https://abcdefgh.supabase.co"), [
    "sb-abcdefgh-auth-token",
    "sb-abcdefgh-auth-token.0",
    "sb-abcdefgh-auth-token.1",
    "sb-abcdefgh-auth-token.2",
  ]);
});

test("without a Supabase address there is no session cookie to key on", () => {
  for (const url of [undefined, "", "not a url"]) assert.deepEqual(sessionCookieNames(url), []);
});

test("a guest's copy is keyed by the query, language, theme and session", () => {
  assert.equal(
    guestVary(["sb-x-auth-token", "sb-x-auth-token.0"]),
    "query, cookie=ahsan-language|ahsan-theme|sb-x-auth-token|sb-x-auth-token.0",
  );
});
