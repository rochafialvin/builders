import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { PROFILE_MAXIMUM, RESERVED_USERNAMES, USERNAME_FORMAT, validateGitHub, validateProfile, validateUsername } from "../app/lib/profile.ts";

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

test("a username takes the same shape the profile URL needs", () => {
  assert.deepEqual(validateUsername("fajarhide"), { username: "fajarhide" });
  assert.deepEqual(validateUsername("  FajarHide  "), { username: "fajarhide" }, "trimmed and lowercased");
  assert.deepEqual(validateUsername("zain-fathoni"), { username: "zain-fathoni" });
  for (const bad of ["a", "-leading", "has space", "UPPER!", "x".repeat(49)]) {
    assert.ok("error" in validateUsername(bad), bad);
  }
});

test("a username that is a site route is refused", () => {
  for (const reserved of ["admin", "account", "u", "projects", "settings"]) {
    assert.ok("error" in validateUsername(reserved), reserved);
  }
});

test("the reserved names and the username format match the database's", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261102000000_custom_username.sql", import.meta.url), "utf8");
  const listed = sql.match(/select lower\(name\) in \(([^)]*)\)/);
  assert.ok(listed, "is_reserved_username's list was not found");
  const names = [...listed[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual([...names].sort(), [...RESERVED_USERNAMES].sort());
  // Every copy of the format in the migration is the one the app checks.
  const formats = [...sql.matchAll(/~ '(\^[^']+\$)'/g)].map((match) => match[1]);
  assert.ok(formats.length >= 2, "the format checks were not found");
  for (const format of formats) assert.equal(format, USERNAME_FORMAT.source);
});

test("the profile editor cannot come back stale after a save (#191)", () => {
  const page = readFileSync(new URL("../app/account/profile/page.tsx", import.meta.url), "utf8");
  // Instant validation stays off, like the rest of /account.
  assert.match(page, /export const instant = false/);
  // Fresh values arrive because the save action revalidates the editor.
  const actions = readFileSync(new URL("../app/actions.ts", import.meta.url), "utf8");
  assert.match(actions, /revalidatePath\("\/account\/profile"\)/);
  // useActionState keeps the values it was mounted with, so the form has to
  // be remounted when the stored profile changes.
  assert.match(page, /<ProfileForm[^>]*key=\{JSON\.stringify\(editable\)\}/s);
});
