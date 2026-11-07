-- /activity every six hours again, instead of every half hour.
--
-- The half-hourly runs were cheap on GitHub's side but not on ours: each one
-- invalidated the feed, and the site's pages are cached at Netlify's CDN for
-- guests (see app/lib/cdn-cache.ts), so a fresher schedule only meant more
-- renders. A member who turns their activity on, links GitHub or shows a repo
-- again is still refreshed at once by the trigger; this schedule is only for
-- what changes on GitHub by itself.
--
-- Back on the original slot, :47 every six hours, clear of refresh-repos at
-- :17. Scheduling under an existing name replaces that job.

select cron.schedule('refresh-github-activity', '47 */6 * * *', $$ select private.request_github_activity_refresh(null) $$);
