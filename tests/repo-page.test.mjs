import test from "node:test";
import assert from "node:assert/strict";
import { repoCommunity } from "../app/lib/github-activity.ts";

const ana = { id: "1", username: "ana", name: "Ana", handle: "Ana" };
const budi = { id: "2", username: "budi", name: "Budi", handle: "budi" };
const citra = { id: "3", username: "citra", name: "Citra", handle: "citra" };

function pr(person, repo, state, ...items) {
  const pullRequests = items.map(([number, at]) => ({ url: `https://github.com/${repo}/pull/${number}`, number, title: `PR ${number}`, at, openedAt: at }));
  return { kind: "pull_request", key: `${person.id}:${repo}:${state}:${items[0][1]}`, person, repo, url: pullRequests[0].url, state, pullRequests, at: pullRequests[0].at };
}

const entries = [
  pr(budi, "acme/kit", "open", [12, "2026-10-30T09:00:00Z"]),
  pr(ana, "acme/kit", "merged", [11, "2026-10-29T09:00:00Z"], [10, "2026-10-29T08:00:00Z"]),
  pr(ana, "acme/kit", "open", [13, "2026-10-28T09:00:00Z"]),
  pr(citra, "other/repo", "merged", [1, "2026-10-30T10:00:00Z"]),
  pr(budi, "acme/kit", "merged", [9, "2026-10-20T09:00:00Z"]),
  { kind: "commit_summary", key: "commits:3", person: citra, commits: 4, merged: 0, repos: [{ repo: "acme/kit", commits: 4 }], since: "", at: "2026-10-30T00:00:00Z" },
];

test("a repo's page lists only the community's pull requests to it, newest first", () => {
  const { pullRequests } = repoCommunity(entries, "Acme/Kit");
  assert.deepEqual(pullRequests.map((each) => each.number), [12, 11, 10, 13, 9]);
  assert.deepEqual(pullRequests.map((each) => each.state), ["open", "merged", "merged", "open", "merged"]);
  assert.equal(pullRequests[0].person.username, "budi");
});

test("who got merged there, the most recent first, each once", () => {
  assert.deepEqual(repoCommunity(entries, "acme/kit").merged.map((person) => person.username), ["ana", "budi"]);
});

test("in review names only those with nothing merged there yet", () => {
  const { inReview } = repoCommunity([...entries, pr(citra, "acme/kit", "open", [14, "2026-10-31T09:00:00Z"])], "acme/kit");
  assert.deepEqual(inReview.map((person) => person.username), ["citra"]);
});

test("a repo nobody has sent anything to has an empty community", () => {
  assert.deepEqual(repoCommunity(entries, "nobody/here"), { merged: [], inReview: [], pullRequests: [] });
});
