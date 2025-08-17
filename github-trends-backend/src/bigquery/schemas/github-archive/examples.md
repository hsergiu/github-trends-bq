=================================================
```sql
DECLARE start_month_and_day STRING DEFAULT '0101'; -- inclusive
DECLARE end_month_and_day   STRING DEFAULT '0101'; -- inclusive

WITH events AS (
  SELECT
    id,
    type,
    actor.login AS actor_login,
    repo.name AS repo_name,
    COALESCE(org.login, SPLIT(repo.name, '/')[OFFSET(0)]) AS org_login,
    payload,
    created_at
  FROM `githubarchive.day.2012*`
  WHERE _TABLE_SUFFIX BETWEEN start_month_and_day AND end_month_and_day
)
-- Replace the SELECT below with any of the query bodies that follow
SELECT 1;
```

Paste one query body at a time below the CTE above (replace the final SELECT 1;). If a query uses another CTE, keep it inside that one query.

### Cross-cutting (all events)

Event volume by day
```sql
SELECT DATE(created_at) AS day, COUNT(*) AS events_count
FROM events
GROUP BY day
ORDER BY day;
```

Event volume by hour-of-day and day-of-week
```sql
SELECT
  EXTRACT(DAYOFWEEK FROM created_at) AS dow,  -- 1=Sunday
  EXTRACT(HOUR FROM created_at) AS hour,
  COUNT(*) AS events_count
FROM events
GROUP BY dow, hour
ORDER BY dow, hour;
```

Top actors (users) by total events
```sql
SELECT actor_login, COUNT(*) AS events_count
FROM events
GROUP BY actor_login
ORDER BY events_count DESC
LIMIT 100;
```

Activity breakdown by event type per repo
```sql
SELECT repo_name, type, COUNT(*) AS events_count
FROM events
GROUP BY repo_name, type
ORDER BY events_count DESC
LIMIT 1000;
```

New vs returning actors (churn proxy) -- only works for intervals > 1 day (returning actors must be > 0)
```sql
first_seen AS (
  SELECT actor_login, MIN(DATE(created_at)) AS first_day
  FROM events
  GROUP BY actor_login
)
SELECT
  DATE(e.created_at) AS day,
  SUM(CASE WHEN f.first_day = DATE(e.created_at) THEN 1 ELSE 0 END) AS new_actors_events,
  SUM(CASE WHEN f.first_day < DATE(e.created_at) THEN 1 ELSE 0 END) AS returning_actors_events
FROM events e
JOIN first_seen f USING (actor_login)
GROUP BY day
ORDER BY day;
```

### Stars (WatchEvent)

Top starred repos in period
```sql
SELECT repo_name, COUNT(*) AS stars
FROM events
WHERE type = 'WatchEvent' AND JSON_VALUE(payload, '$.action') = 'started'
GROUP BY repo_name
ORDER BY stars DESC
LIMIT 100;
```

Star growth over time per repo (daily)
```sql
SELECT
  repo_name,
  DATE(created_at) AS day,
  COUNTIF(JSON_VALUE(payload, '$.action') = 'started') AS stars
FROM events
WHERE type = 'WatchEvent'
GROUP BY repo_name, day
ORDER BY day, stars DESC;
```

Star-to-fork ratio per repo
```sql
stars AS (
  SELECT repo_name, COUNT(*) AS stars
  FROM events
  WHERE type = 'WatchEvent' AND JSON_VALUE(payload, '$.action') = 'started'
  GROUP BY repo_name
), forks AS (
  SELECT repo_name, COUNT(*) AS forks
  FROM events
  WHERE type = 'ForkEvent'
  GROUP BY repo_name
)
SELECT
  COALESCE(s.repo_name, f.repo_name) AS repo_name,
  s.stars,
  f.forks,
  SAFE_DIVIDE(s.stars, f.forks) AS star_to_fork_ratio
FROM stars s
FULL JOIN forks f ON s.repo_name = f.repo_name
ORDER BY s.stars DESC, star_to_fork_ratio DESC
LIMIT 100;
```

### Forks (ForkEvent)

Top forked repos
```sql
SELECT repo_name, COUNT(*) AS forks
FROM events
WHERE type = 'ForkEvent'
GROUP BY repo_name
ORDER BY forks DESC
LIMIT 100;
```

Fork growth over time (daily)
```sql
SELECT repo_name, DATE(created_at) AS day, COUNT(*) AS forks
FROM events
WHERE type = 'ForkEvent'
GROUP BY repo_name, day
ORDER BY forks DESC;
```

### Pushes/Commits (PushEvent)

Commits per repo (sum of payload.size)
```sql
SELECT repo_name, SUM(CAST(JSON_VALUE(payload, '$.size') AS INT64)) AS commits
FROM events
WHERE type = 'PushEvent'
GROUP BY repo_name
ORDER BY commits DESC
LIMIT 100;
```

Top committers per repo
```sql
SELECT repo_name, actor_login, SUM(CAST(JSON_VALUE(payload, '$.size') AS INT64)) AS commits
FROM events
WHERE type = 'PushEvent'
GROUP BY repo_name, actor_login
ORDER BY commits DESC
LIMIT 200;
```

Average commits per push per repo
```sql
SELECT
  repo_name,
  AVG(CAST(JSON_VALUE(payload, '$.size') AS FLOAT64)) AS avg_commits_per_push,
  COUNT(*) AS pushes
FROM events
WHERE type = 'PushEvent'
GROUP BY repo_name
HAVING pushes >= 10
ORDER BY avg_commits_per_push DESC
LIMIT 100;
```

Commit activity heatmap (hour/day)
```sql
SELECT
  EXTRACT(DAYOFWEEK FROM created_at) AS dow,
  EXTRACT(HOUR FROM created_at) AS hour,
  SUM(CAST(JSON_VALUE(payload, '$.size') AS INT64)) AS commits
FROM events
WHERE type = 'PushEvent'
GROUP BY dow, hour
ORDER BY dow, hour;
```

### Issues (IssuesEvent)

Issues opened vs closed per day per repo - for popular repos
```sql
stars AS (
  SELECT repo_name, COUNT(*) AS stars
  FROM events
  WHERE type = 'WatchEvent' AND JSON_VALUE(payload, '$.action') = 'started'
  GROUP BY repo_name
)
SELECT
  events.repo_name,
  DATE(created_at) AS day,
  COUNTIF(JSON_VALUE(payload, '$.action') = 'opened') AS opened,
  COUNTIF(JSON_VALUE(payload, '$.action') = 'closed') AS closed,
  MAX(s.stars) AS stars
FROM events
FULL JOIN stars s ON s.repo_name = events.repo_name
WHERE type = 'IssuesEvent'
GROUP BY repo_name, day
ORDER BY day, stars DESC;
```

Median time-to-close issues per repo - for popular repos
```sql
stars AS (
  SELECT repo_name, COUNT(*) AS stars
  FROM events
  WHERE type = 'WatchEvent' AND JSON_VALUE(payload, '$.action') = 'started'
  GROUP BY repo_name
),
closed_issues AS (
  SELECT
    e.repo_name,
    TIMESTAMP(JSON_VALUE(e.payload, '$.issue.created_at')) AS issue_created_at,
    TIMESTAMP(JSON_VALUE(e.payload, '$.issue.closed_at')) AS issue_closed_at
  FROM events e
  JOIN stars s
    ON e.repo_name = s.repo_name
  WHERE e.type = 'IssuesEvent'
    AND JSON_VALUE(e.payload, '$.action') = 'closed'
)
SELECT
  repo_name,
  APPROX_QUANTILES(TIMESTAMP_DIFF(issue_closed_at, issue_created_at, HOUR), 100)[OFFSET(50)] AS median_hours_to_close,
  COUNT(*) AS closed_count
FROM closed_issues
GROUP BY repo_name
HAVING closed_count >= 5
ORDER BY median_hours_to_close;
```

### Issue comments (IssueCommentEvent)

Most discussed repos (comments count)
```sql
SELECT repo_name, COUNT(*) AS comments
FROM events
WHERE type = 'IssueCommentEvent'
GROUP BY repo_name
ORDER BY comments DESC
LIMIT 100;
```

Top commenters
```sql
SELECT actor_login, COUNT(*) AS comments
FROM events
WHERE type = 'IssueCommentEvent'
GROUP BY actor_login
ORDER BY comments DESC
LIMIT 100;
```

### Pull requests (PullRequestEvent)

PRs opened/closed/merged per day per repo + merge rate
```sql
SELECT
  repo_name,
  DATE(created_at) AS day,
  COUNTIF(JSON_VALUE(payload, '$.action') = 'opened') AS opened,
  COUNTIF(JSON_VALUE(payload, '$.action') = 'closed') AS closed,
  COUNTIF(JSON_VALUE(payload, '$.action') = 'closed' AND CAST(JSON_VALUE(payload, '$.pull_request.merged') AS BOOL)) AS merged,
  SAFE_DIVIDE(
    COUNTIF(JSON_VALUE(payload, '$.action') = 'closed' AND CAST(JSON_VALUE(payload, '$.pull_request.merged') AS BOOL)),
    NULLIF(COUNTIF(JSON_VALUE(payload, '$.action') = 'opened'), 0)
  ) AS merge_rate
FROM events
WHERE type = 'PullRequestEvent'
GROUP BY repo_name, day
ORDER BY day, merged DESC;
```

```sql
WITH merged AS (
  SELECT
    repo_name,
    TIMESTAMP(JSON_VALUE(payload, '$.pull_request.created_at')) AS pr_created_at,
    TIMESTAMP(JSON_VALUE(payload, '$.pull_request.merged_at')) AS pr_merged_at
  FROM events
  WHERE type = 'PullRequestEvent'
    AND JSON_VALUE(payload, '$.action') = 'closed'
    AND CAST(JSON_VALUE(payload, '$.pull_request.merged') AS BOOL)
)
SELECT
  repo_name,
  APPROX_QUANTILES(TIMESTAMP_DIFF(pr_merged_at, pr_created_at, HOUR), 100)[OFFSET(50)] AS median_hours_to_merge,
  COUNT(*) AS merged_count
FROM merged
GROUP BY repo_name
HAVING merged_count >= 5
ORDER BY median_hours_to_merge;
```

First-time PR contributors (no prior PRs to repo before window)
```sql
opened AS (
  SELECT repo_name, actor_login, created_at
  FROM events
  WHERE type = 'PullRequestEvent' AND JSON_VALUE(payload, '$.action') = 'opened'
),
prior AS (
  -- prior to start_date, scan earlier day tables
  SELECT
    repo.name AS repo_name,
    actor.login AS actor_login
  FROM `githubarchive.day.*`
  WHERE _TABLE_SUFFIX < start_date
    AND type = 'PullRequestEvent'
    AND JSON_VALUE(payload, '$.action') = 'opened'
  GROUP BY repo_name, actor_login
)
SELECT
  o.repo_name,
  COUNT(DISTINCT o.actor_login) AS first_time_pr_authors
FROM opened o
LEFT JOIN prior p
  ON o.repo_name = p.repo_name AND o.actor_login = p.actor_login
WHERE p.actor_login IS NULL
GROUP BY repo_name
ORDER BY first_time_pr_authors DESC
LIMIT 100;
```

### Releases (ReleaseEvent)

Releases per repo over time (daily)
```sql
SELECT repo_name, DATE(created_at) AS day, COUNT(*) AS releases
FROM events
WHERE type = 'ReleaseEvent' AND JSON_VALUE(payload, '$.action') = 'published'
GROUP BY repo_name, day
ORDER BY day, releases DESC;
```

Average release cadence (days between releases)
```sql
WITH rels AS (
  SELECT repo_name, created_at
  FROM events
  WHERE type = 'ReleaseEvent' AND JSON_VALUE(payload, '$.action') = 'published'
),
gaps AS (
  SELECT
    repo_name,
    created_at,
    LAG(created_at) OVER (PARTITION BY repo_name ORDER BY created_at) AS prev_created_at
  FROM rels
)
SELECT
  repo_name,
  AVG(TIMESTAMP_DIFF(created_at, prev_created_at, DAY)) AS avg_days_between_releases,
  COUNT(*) AS releases_count
FROM gaps
WHERE prev_created_at IS NOT NULL
GROUP BY repo_name
HAVING releases_count >= 3
ORDER BY releases_count DESC, avg_days_between_releases;
```

commits vs releases by day (joined series)
```sql
WITH comm AS (
  SELECT DATE(created_at) AS day, SUM(CAST(JSON_VALUE(payload, '$.size') AS INT64)) AS commits
  FROM events
  WHERE type = 'PushEvent'
  GROUP BY day
),
rels AS (
  SELECT DATE(created_at) AS day, COUNT(*) AS releases
  FROM events
  WHERE type = 'ReleaseEvent' AND JSON_VALUE(payload, '$.action') = 'published'
  GROUP BY day
)
SELECT
  COALESCE(c.day, r.day) AS day,
  c.commits,
  r.releases
FROM comm c
FULL JOIN rels r USING (day)
ORDER BY day;
```

### Repository lifecycle (CreateEvent, DeleteEvent, PublicEvent)

New repos per org over time
```sql
SELECT
  org_login,
  DATE(created_at) AS day,
  COUNTIF(JSON_VALUE(payload, '$.ref_type') = 'repository' OR JSON_VALUE(payload, '$.ref_type') IS NULL) AS repos_created
FROM events
WHERE type = 'CreateEvent'
GROUP BY org_login, day
ORDER BY day, repos_created DESC;
```

Branch/tag creation counts
```sql
SELECT
  repo_name,
  DATE(created_at) AS day,
  COUNTIF(JSON_VALUE(payload, '$.ref_type') = 'branch') AS branches_created,
  COUNTIF(JSON_VALUE(payload, '$.ref_type') = 'tag') AS tags_created
FROM events
WHERE type = 'CreateEvent'
GROUP BY repo_name, day
ORDER BY day, branches_created + tags_created DESC;
```

### Membership/Collaborator (MemberEvent)

Collaborator additions per repo/org
```sql
SELECT
  repo_name,
  org_login,
  COUNTIF(JSON_VALUE(payload, '$.action') = 'added') AS collaborators_added
FROM events
WHERE type = 'MemberEvent'
GROUP BY repo_name, org_login
ORDER BY collaborators_added DESC
LIMIT 200;
```

Notes:
- JSON fields come from `payload` and are accessed with `JSON_VALUE`/`JSON_QUERY_ARRAY`. Cast as needed.
- Adjust limits, HAVING thresholds, and date window as desired.

- Added runnable SQL templates per example, referencing the provided schema via `events` CTE.
- Covered cross-cutting metrics, stars, forks, pushes, issues, comments, PRs, reviews, releases, repo lifecycle, membership.

- Use and LOWER(events.repo_name) LIKE '%repo name you want to search for%' in the where clause when searching for a specific repo.