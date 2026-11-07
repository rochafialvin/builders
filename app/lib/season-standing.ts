import { listGitHubActivity, listOwnPullRequests } from "./data";
import { readPublicly } from "./public-read";
import { dayKey, seasonBoard, seasonOf, type ConsistencyRow, type GitHubActivityEntry, type PullRequestEntry, type Season } from "./github-activity";

/** Somebody's row on a season board and their place on it, 1-based. */
export type Standing = { row: ConsistencyRow; rank: number };

/**
 * Where a member stands this season, for their profile and its share card:
 * the leaderboard's own boards, read the way /leaderboard reads them, so the
 * numbers are the same in both places. Contributions are the board; their own
 * repos are shown beside it, never mixed in.
 */
export type SeasonStanding = {
  season: Season;
  /** Undefined while they have no week on the contributions board. */
  contributions?: Standing;
  /** How many members the contributions board has. */
  members: number;
  /** Their own repositories' board, the "own repos" choice on /leaderboard. */
  own?: Standing;
};

export function standingOf(rows: ConsistencyRow[], personId: string): Standing | undefined {
  const index = rows.findIndex((row) => row.person.id === personId);
  return index < 0 ? undefined : { row: rows[index], rank: index + 1 };
}

/** Null when the activity could not be read: better nothing than a false zero. */
export async function seasonStanding(personId: string, now = new Date()): Promise<SeasonStanding | null> {
  const [activity, own] = await Promise.all([
    readPublicly<GitHubActivityEntry[]>("github activity for a season standing", listGitHubActivity, []),
    readPublicly<PullRequestEntry[]>("own pull requests for a season standing", listOwnPullRequests, []),
  ]);
  if (activity.unavailable) return null;

  const today = dayKey(now, "Asia/Jakarta");
  const board = seasonBoard(activity.value, today);
  return {
    season: seasonOf(today),
    contributions: standingOf(board, personId),
    members: board.length,
    own: own.unavailable ? undefined : standingOf(seasonBoard(own.value, today), personId),
  };
}
