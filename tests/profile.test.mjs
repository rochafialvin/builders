import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { PROFILE_MAXIMUM, validateGitHub, validateProfile } from "../app/lib/profile.ts";

const blank = {
  name: "",
  profession: "",
  headline: "",
  bio: "",
  skills: "",
  website: "",
  publicEmail: "",
  linkedin: "",
  x: "",
};

const named = { ...blank, name: "Zikrul Ihsan" };

test("only a name is actually required", () => {
  assert.deepEqual(validateProfile(named), {});
  assert.ok(validateProfile(blank).name);
});

test("a link without a scheme is refused rather than silently dropped", () => {
  for (const field of ["website", "linkedin", "x"]) {
    const errors = validateProfile({ ...named, [field]: "example.com/page" });
    assert.ok(errors[field], `${field} harus ditolak`);
  }
  assert.deepEqual(validateProfile({ ...named, website: "https://contoh.id" }), {});
});

test("a link that is not an ordinary web link is refused too", () => {
  assert.ok(validateProfile({ ...named, website: "javascript:alert(1)" }).website);
  assert.ok(validateProfile({ ...named, linkedin: "data:text/plain,x" }).linkedin);
});

test("a public email has to look like an address", () => {
  assert.ok(validateProfile({ ...named, publicEmail: "halo-at-contoh" }).publicEmail);
  assert.deepEqual(validateProfile({ ...named, publicEmail: "halo@contoh.id" }), {});
});

test("the ceilings match the columns the row is stored in", () => {
  const errors = validateProfile({
    ...named,
    bio: "a".repeat(PROFILE_MAXIMUM.bio + 1),
    headline: "b".repeat(PROFILE_MAXIMUM.headline + 1),
  });
  assert.ok(errors.bio);
  assert.ok(errors.headline);
  assert.deepEqual(validateProfile({ ...named, bio: "a".repeat(PROFILE_MAXIMUM.bio) }), {});
});

test("GitHub takes a username or a profile link, and is stored as the link", () => {
  assert.deepEqual(validateGitHub(""), { url: "" });
  assert.deepEqual(validateGitHub("zikrulihsan"), { url: "https://github.com/zikrulihsan" });
  assert.deepEqual(validateGitHub("@zikrulihsan"), { url: "https://github.com/zikrulihsan" });
  assert.deepEqual(validateGitHub("https://github.com/zikrulihsan/"), { url: "https://github.com/zikrulihsan" });
  assert.deepEqual(validateGitHub("github.com/zikrulihsan"), { url: "https://github.com/zikrulihsan" });
  for (const value of ["https://gitlab.com/zikrulihsan", "https://github.com/zikrulihsan/builders", "bukan username!", "javascript:alert(1)"]) {
    assert.ok("error" in validateGitHub(value), value);
  }
});

test("the profile editor never replays from the client router cache", async () => {
  const page = await readFile(new URL("../app/account/profile/page.tsx", import.meta.url), "utf8");
  assert.match(page, /export const unstable_dynamicStaleTime = 0;/);
});

test("the profile editor remounts when the server sends newer values", async () => {
  const page = await readFile(new URL("../app/account/profile/page.tsx", import.meta.url), "utf8");
  assert.ok(page.includes("key={JSON.stringify(editable)}"), "ProfileForm needs a key derived from the editable profile");
  // GitHubForm gets no key: it saves in place, and a remount would drop its saved-confirmation.
});
