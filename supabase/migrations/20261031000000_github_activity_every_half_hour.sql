-- /activity every half hour instead of every six.
--
-- Members' pull requests to other people's repositories cannot be pushed to
-- us — GitHub's webhooks only reach repositories we own — so the page is as
-- fresh as its schedule. With a few dozen members a run is one or two
-- GraphQL requests, against 5,000 points an hour on the function's token,
-- so there is no reason to keep people waiting six hours to see a merge.
-- Revisit if the members who show their activity number in the thousands.
--
-- At :07 and :37, clear of refresh-repos at :17 every six hours, so the two
-- never share the token's limit in the same minute. Scheduling under an
-- existing name replaces that job.

do $guard$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('refresh-github-activity', '7,37 * * * *', $$ select private.request_github_activity_refresh(null) $$);
  end if;
end
$guard$;
