import { hideGitHubRepo, showGitHubRepo } from "../actions";
import { tx, type Locale } from "../lib/locale";

/**
 * Repositories kept off /activity, the leaderboard and the badges: those
 * hidden, each with a way back, and those shown now, each one press from
 * hidden. Anything else is typed: `owner/repo`, or `owner/*` for all of one.
 */
export function HiddenRepos({ hidden, shown, locale }: { hidden: string[]; shown: string[]; locale: Locale }) {
  const visible = shown.filter((repo) => !hidden.some((pattern) => pattern === repo || pattern === `${repo.split("/")[0]}/*`));
  return (
    <section className="gh-hidden" aria-labelledby="gh-hidden-title">
      <h3 id="gh-hidden-title">{tx(locale, "Repo yang disembunyikan", "Hidden repos")}</h3>
      <p className="hint">
        {tx(
          locale,
          "PR dan commit di repo ini tidak tampil di halaman Aktivitas, leaderboard, maupun badge. Hanya kamu yang bisa melihat daftar ini.",
          "Pull requests and commits in these repos stay off the Activity page, the leaderboard and badges. Only you can see this list.",
        )}
      </p>

      {hidden.length > 0 ? (
        <ul className="gh-hidden-list">
          {hidden.map((pattern) => (
            <li key={pattern}>
              <code>{pattern}</code>
              <form action={showGitHubRepo}>
                <input type="hidden" name="pattern" value={pattern} />
                <button className="text-button" type="submit">
                  {tx(locale, "Tampilkan lagi", "Show again")}
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}

      <form className="gh-hidden-add" action={hideGitHubRepo}>
        <label className="sr-only" htmlFor="gh-hidden-repo">
          {tx(locale, "Repo yang disembunyikan", "Repo to hide")}
        </label>
        <input id="gh-hidden-repo" name="repo" placeholder={tx(locale, "owner/repo atau owner/*", "owner/repo or owner/*")} required />
        <button className="ghost-button" type="submit">
          {tx(locale, "Sembunyikan", "Hide")}
        </button>
      </form>

      {visible.length > 0 ? (
        <>
          <p className="hint">{tx(locale, "Yang tampil sekarang:", "Shown now:")}</p>
          <ul className="gh-hidden-list">
            {visible.map((repo) => (
              <li key={repo}>
                <code>{repo}</code>
                <form action={hideGitHubRepo}>
                  <input type="hidden" name="repo" value={repo} />
                  <button className="text-button" type="submit">
                    {tx(locale, "Sembunyikan", "Hide")}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
