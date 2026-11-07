import assert from "node:assert/strict";
import test from "node:test";

import { feedDays, feedKindLabel, feedLine, feedPage, feedStats, groupProductFeed, isFeedKind } from "../app/lib/product-feed.ts";
import { eventReactionKey, isReactionTarget } from "../app/lib/reactions.ts";

const ana = { username: "ana", name: "Ana" };
const event = (id, over = {}) => ({
  id,
  kind: "update_posted",
  createdAt: "2026-10-25T03:00:00Z",
  projectSlug: "kopi",
  projectTitle: "Kopi",
  payload: {},
  actor: ana,
  ...over,
});

test("a product's events on one day are one entry, keyed by the day's first event", () => {
  const feed = groupProductFeed([
    event(10, { kind: "project_stage_changed", createdAt: "2026-10-25T09:00:00Z" }),
    event(7),
    event(5, { projectSlug: "teh", projectTitle: "Teh", createdAt: "2026-10-25T05:00:00Z" }),
  ]);
  assert.deepEqual(feed.map((entry) => entry.product.slug), ["kopi", "teh"]);
  assert.equal(feed[0].firstEventId, 7);
  assert.deepEqual(feed[0].events.map((e) => e.id), [10, 7]);
  assert.equal(feed[0].at, "2026-10-25T09:00:00Z");
});

test("days are counted in WIB, so an evening update stays on its evening", () => {
  // 18:00 UTC on the 24th is 01:00 WIB on the 25th.
  const feed = groupProductFeed([event(2, { createdAt: "2026-10-24T18:00:00Z" }), event(1, { createdAt: "2026-10-24T10:00:00Z" })]);
  assert.deepEqual(feed.map((entry) => entry.day), ["2026-10-25", "2026-10-24"]);
  assert.deepEqual(feedDays(feed).map((day) => day.day), ["2026-10-25", "2026-10-24"]);
});

test("only the product kinds make the feed", () => {
  assert.equal(isFeedKind("seat_filled"), true);
  assert.equal(isFeedKind("comment_posted"), false);
  assert.equal(groupProductFeed([event(1, { kind: "comment_posted" }), event(2, { kind: "boost_given" })]).length, 0);
});

test("a deleted product keeps its events under the recorded title", () => {
  const [entry] = groupProductFeed([event(1, { projectSlug: "", projectTitle: "Old idea" })]);
  assert.deepEqual(entry.product, { slug: "", title: "Old idea" });
});

test("the heading counts the last 30 days", () => {
  const now = new Date("2026-10-26T00:00:00Z");
  const stats = feedStats(
    [
      event(1),
      event(2, { kind: "seat_filled", projectSlug: "teh" }),
      event(3, { createdAt: "2026-08-01T00:00:00Z" }),
    ],
    now,
  );
  assert.deepEqual(stats, { products: 2, updates: 1, rolesFilled: 1 });
});

test("a product's day is something a reaction can be left on", () => {
  assert.equal(eventReactionKey(42), "event:42");
  assert.equal(isReactionTarget("event:42"), true);
  assert.equal(isReactionTarget("event:"), false);
  assert.equal(isReactionTarget("event:4x"), false);
});

test("a kind filter narrows a day's lines and drops days without it, keeping the card's key", () => {
  const day = [
    event(9, { kind: "seat_opened", createdAt: "2026-10-25T10:00:00Z" }),
    event(4, { kind: "update_posted", createdAt: "2026-10-25T09:00:00Z" }),
    event(1, { kind: "project_created", projectSlug: "teh", projectTitle: "Teh", createdAt: "2026-10-24T05:00:00Z" }),
  ];
  const [kopi] = groupProductFeed(day, "Asia/Jakarta", "seat_opened");
  assert.deepEqual(kopi.events.map((e) => e.id), [9]);
  // Reactions stay keyed by the day's first event, not the filtered one.
  assert.equal(kopi.firstEventId, 4);
  assert.equal(groupProductFeed(day, "Asia/Jakarta", "seat_filled").length, 0, "a day without the kind drops");
});

test("a filtered card is timed and ordered by the lines it shows", () => {
  const feed = groupProductFeed(
    [
      event(10, { kind: "project_stage_changed", createdAt: "2026-10-25T09:00:00Z" }),
      event(7),
      event(5, { projectSlug: "teh", projectTitle: "Teh", createdAt: "2026-10-25T05:00:00Z" }),
    ],
    "Asia/Jakarta",
    "update_posted",
  );
  assert.deepEqual(feed.map((entry) => entry.product.slug), ["teh", "kopi"]);
  assert.equal(feed[1].at, "2026-10-25T03:00:00Z");
});

test("paging is per card, and a page past the end lands on the last one", () => {
  const entries = groupProductFeed([
    event(3, { projectSlug: "susu", projectTitle: "Susu" }),
    event(2, { projectSlug: "teh", projectTitle: "Teh", createdAt: "2026-10-24T03:00:00Z" }),
    event(1, { createdAt: "2026-10-23T03:00:00Z" }),
  ]);
  const second = feedPage(entries, 2, 2);
  assert.equal(second.pages, 2);
  assert.equal(second.page, 2);
  assert.deepEqual(second.shown.map((entry) => entry.product.slug), ["kopi"]);
  assert.deepEqual(feedPage(entries, 99, 2).shown.map((entry) => entry.product.slug), ["kopi"], "clamped to the last page");
});

test("each kind has its chip label", () => {
  assert.equal(feedKindLabel("update_posted", "id"), "Kabar terbaru");
  assert.equal(feedKindLabel("seat_filled", "en"), "Role filled");
});

test("a card's lines leave the product's name to the heading", () => {
  assert.equal(feedLine({ kind: "update_posted", payload: { update_title: "Rilis 1.0" } }, "id"), "mengirim kabar: “Rilis 1.0”");
  assert.equal(feedLine({ kind: "project_stage_changed", payload: { to: "live" } }, "en"), "moved it to Live.");
  assert.equal(feedLine({ kind: "project_created", payload: { title: "Kopi" } }, "id"), "mendaftarkan produk ini.");
});
