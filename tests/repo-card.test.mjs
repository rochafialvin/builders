import assert from "node:assert/strict";
import test from "node:test";

import { cardVersion, repoCardPath } from "../app/lib/repo-card.ts";

const card = {
  ownerName: "aula-id",
  repoName: "koma",
  description: "why so complex if simple is enough and smarter? huh",
  language: "Rust",
  stars: "85",
  tier: "Accepting PRs",
  scope: "Global",
  faces: [{ id: "1", handle: "someone" }],
  merged: 2,
};

test("the same card is the same version", () => {
  assert.equal(cardVersion(card), cardVersion({ ...card }));
  assert.match(cardVersion(card), /^[0-9a-z]{1,7}$/);
});

test("anything the card shows changing makes a new version", () => {
  for (const changed of [{ stars: "231" }, { tier: "Actively accepting PRs" }, { merged: 3 }, { description: "" }, { faces: [] }]) {
    assert.notEqual(cardVersion({ ...card, ...changed }), cardVersion(card), JSON.stringify(changed));
  }
});

test("the card lives under the repo's page", () => {
  assert.equal(repoCardPath("Aula-ID/Koma", "abc"), "/directory/aula-id/koma/card?v=abc");
});
