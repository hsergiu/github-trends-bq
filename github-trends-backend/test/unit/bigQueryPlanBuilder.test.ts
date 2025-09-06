import { gitHubArchivePlanBuilder } from '../../src/bigquery/schemas/github-archive/GitHubArchivePlanBuilder';
import { RootQueryPlan } from '../../src/bigquery/schemas/BaseBigQueryPlanBuilder';

describe('GitHubArchivePlanBuilder', () => {
  it('builds a simple query for a specific day table', () => {
    const plan: RootQueryPlan = {
      main_query: {
        table: 'githubarchive.day.20250101',
        columns: ['id', 'type'],
        filters: [{ column: 'type', op: '=', value: 'PushEvent' }],
        limit: 10,
      },
    };
    const sql = gitHubArchivePlanBuilder.buildQuery(plan);
    expect(sql).toBe(
      "SELECT id, type FROM githubarchive.day.20250101 WHERE type = 'PushEvent' LIMIT 10"
    );
  });

  it('builds a simple query for a wildcard day table', () => {
    const plan: RootQueryPlan = {
      main_query: {
        table: 'githubarchive.day.20250102',
        columns: ['id', 'type'],
        filters: [{ column: 'type', op: '=', value: 'PushEvent' }],
        limit: 10,
      },
    };
    const sql = gitHubArchivePlanBuilder.buildQuery(plan);
    expect(sql).toBe(
      "SELECT id, type FROM githubarchive.day.20250102 WHERE type = 'PushEvent' LIMIT 10"
    );
  });

  it('builds a simple query for a month table', () => {
    const plan: RootQueryPlan = {
      main_query: {
        table: 'githubarchive.month.202501',
        columns: ['id', 'type'],
        filters: [{ column: 'type', op: '=', value: 'PushEvent' }],
        limit: 10,
      },
    };
    const sql = gitHubArchivePlanBuilder.buildQuery(plan);
    expect(sql).toBe(
      "SELECT id, type FROM githubarchive.month.202501 WHERE type = 'PushEvent' LIMIT 10"
    );
  });

  it('builds a query with a CTE referencing a real table', () => {
    const plan: RootQueryPlan = {
      ctes: [
        {
          name: 'recent_events',
          query: {
            table: 'githubarchive.day.20250101',
            columns: ['id', 'type', 'created_at'],
            filters: [{ column: 'created_at', op: '>', value: '2024-01-01' }],
            limit: 50,
          },
        },
      ],
      main_query: {
        table: 'recent_events',
        columns: ['id', 'type'],
        filters: [],
        limit: 50,
      },
    };
    const sql = gitHubArchivePlanBuilder.buildQuery(plan);
    expect(sql).toBe(
      "WITH recent_events AS (SELECT id, type, created_at FROM githubarchive.day.20250101 WHERE created_at > '2024-01-01' LIMIT 50)\nSELECT id, type FROM recent_events WHERE 1=1 LIMIT 50"
    );
  });

  it('does not validate table names (BigQuery dry run will handle)', () => {
    const plan: RootQueryPlan = {
      main_query: {
        table: 'NotAllowed',
        columns: ['id'],
        filters: [],
        limit: 1,
      },
    };
    const sql = gitHubArchivePlanBuilder.buildQuery(plan);
    expect(sql).toBe("SELECT id FROM NotAllowed WHERE 1=1 LIMIT 1");
  });

  it('does not validate columns (BigQuery dry run will handle)', () => {
    const plan: RootQueryPlan = {
      main_query: {
        table: 'githubarchive.day.20250101',
        columns: ['not_a_column'],
        filters: [],
        limit: 1,
      },
    };
    const sql = gitHubArchivePlanBuilder.buildQuery(plan);
    expect(sql).toBe("SELECT not_a_column FROM githubarchive.day.20250101 WHERE 1=1 LIMIT 1");
  });

  it('throws for invalid operator', () => {
    const plan: RootQueryPlan = {
      main_query: {
        table: 'githubarchive.day.20250101',
        columns: ['id'],
        filters: [{ column: 'id', op: 'LIKE', value: '%foo%' }],
        limit: 1,
      },
    };
    expect(() => gitHubArchivePlanBuilder.buildQuery(plan)).toThrow('Operator not allowed: LIKE');
  });

  it('throws for IN operator with non-array value', () => {
    const plan: RootQueryPlan = {
      main_query: {
        table: 'githubarchive.day.20250101',
        columns: ['id'],
        filters: [{ column: 'id', op: 'IN', value: 'foo' }],
        limit: 1,
      },
    };
    expect(() => gitHubArchivePlanBuilder.buildQuery(plan)).toThrow('IN operator requires array value');
  });

  it('builds a query with multiple CTEs and CTE chaining', () => {
    const plan: RootQueryPlan = {
      ctes: [
        {
          name: 'recent_events',
          query: {
            table: 'githubarchive.day.20250101',
            columns: ['id', 'type', 'created_at'],
            filters: [{ column: 'created_at', op: '>', value: '2024-01-01' }],
          },
        },
        {
          name: 'filtered_events',
          query: {
            table: 'recent_events',
            columns: ['id', 'type'],
            filters: [{ column: 'type', op: '=', value: 'PushEvent' }],
          },
        },
      ],
      main_query: {
        table: 'filtered_events',
        columns: ['id', 'type'],
        filters: [],
        limit: 10,
      },
    };
    const sql = gitHubArchivePlanBuilder.buildQuery(plan);
    expect(sql).toBe(
      "WITH recent_events AS (SELECT id, type, created_at FROM githubarchive.day.20250101 WHERE created_at > '2024-01-01'), filtered_events AS (SELECT id, type FROM recent_events WHERE type = 'PushEvent')\nSELECT id, type FROM filtered_events WHERE 1=1 LIMIT 10"
    );
  });

  it('does not enforce JOIN/CTE validation beyond SQL construction', () => {
    const plan: RootQueryPlan = {
      ctes: [
        {
          name: 'stars_score',
          query: {
            table: 'githubarchive.day.20250101',
            columns: ['repo.name', 'actor.login', 'created_at'],
            filters: [],
          },
        },
        {
          name: 'forks_score',
          query: {
            table: 'githubarchive.day.20250101',
            columns: ['repo.name', 'actor.login', 'created_at'],
            filters: [],
          },
        },
      ],
      main_query: {
        table: 'joined',
        columns: ['repo_name', 'star_score', 'fork_score', 'total_score'],
        filters: [],
      },
    };
    const sql = gitHubArchivePlanBuilder.buildQuery(plan);
    expect(sql).toBe("WITH stars_score AS (SELECT repo.name, actor.login, created_at FROM githubarchive.day.20250101 WHERE 1=1), forks_score AS (SELECT repo.name, actor.login, created_at FROM githubarchive.day.20250101 WHERE 1=1)\nSELECT repo_name, star_score, fork_score, total_score FROM joined WHERE 1=1 LIMIT 20");
  });

  describe('Enhanced Filter Logic (OR/AND)', () => {
    it('builds a query with OR filter group', () => {
      const plan: RootQueryPlan = {
        main_query: {
          table: 'githubarchive.day.20250101',
          columns: ['id', 'type'],
          filters: [
            {
              logic: 'OR',
              filters: [
                { column: 'type', op: '=', value: 'PushEvent' },
                { column: 'type', op: '=', value: 'WatchEvent' }
              ]
            }
          ],
          limit: 10,
        },
      };
      const sql = gitHubArchivePlanBuilder.buildQuery(plan);
      expect(sql).toBe(
        "SELECT id, type FROM githubarchive.day.20250101 WHERE (type = 'PushEvent' OR type = 'WatchEvent') LIMIT 10"
      );
    });

    it('builds a query with AND filter group', () => {
      const plan: RootQueryPlan = {
        main_query: {
          table: 'githubarchive.day.20250101',
          columns: ['id', 'type', 'created_at'],
          filters: [
            {
              logic: 'AND',
              filters: [
                { column: 'type', op: '=', value: 'PushEvent' },
                { column: 'created_at', op: '>', value: '2024-01-01' }
              ]
            }
          ],
          limit: 10,
        },
      };
      const sql = gitHubArchivePlanBuilder.buildQuery(plan);
      expect(sql).toBe(
        "SELECT id, type, created_at FROM githubarchive.day.20250101 WHERE (type = 'PushEvent' AND created_at > '2024-01-01') LIMIT 10"
      );
    });

    it('builds a query with mixed simple filters and filter groups', () => {
      const plan: RootQueryPlan = {
        main_query: {
          table: 'githubarchive.day.20250101',
          columns: ['id', 'type', 'actor.login'],
          filters: [
            { column: 'actor.login', op: '!=', value: 'bot' },
            {
              logic: 'OR',
              filters: [
                { column: 'type', op: '=', value: 'PushEvent' },
                { column: 'type', op: '=', value: 'WatchEvent' }
              ]
            }
          ],
          limit: 10,
        },
      };
      const sql = gitHubArchivePlanBuilder.buildQuery(plan);
      expect(sql).toBe(
        "SELECT id, type, actor.login FROM githubarchive.day.20250101 WHERE actor.login != 'bot' AND (type = 'PushEvent' OR type = 'WatchEvent') LIMIT 10"
      );
    });

    it('builds a query with nested filter groups', () => {
      const plan: RootQueryPlan = {
        main_query: {
          table: 'githubarchive.day.20250101',
          columns: ['id', 'type', 'actor.login', 'created_at'],
          filters: [
            {
              logic: 'OR',
              filters: [
                {
                  logic: 'AND',
                  filters: [
                    { column: 'type', op: '=', value: 'PushEvent' },
                    { column: 'actor.login', op: '!=', value: 'bot' }
                  ]
                },
                {
                  logic: 'AND',
                  filters: [
                    { column: 'type', op: '=', value: 'WatchEvent' },
                    { column: 'created_at', op: '>', value: '2024-01-01' }
                  ]
                }
              ]
            }
          ],
          limit: 10,
        },
      };
      const sql = gitHubArchivePlanBuilder.buildQuery(plan);
      expect(sql).toBe(
        "SELECT id, type, actor.login, created_at FROM githubarchive.day.20250101 WHERE ((type = 'PushEvent' AND actor.login != 'bot') OR (type = 'WatchEvent' AND created_at > '2024-01-01')) LIMIT 10"
      );
    });

    it('handles IN operator with filter groups', () => {
      const plan: RootQueryPlan = {
        main_query: {
          table: 'githubarchive.day.20250101',
          columns: ['id', 'type', 'actor.login'],
          filters: [
            {
              logic: 'OR',
              filters: [
                { column: 'type', op: 'IN', value: ['PushEvent', 'WatchEvent'] },
                { column: 'actor.login', op: '=', value: 'admin' }
              ]
            }
          ],
          limit: 10,
        },
      };
      const sql = gitHubArchivePlanBuilder.buildQuery(plan);
      expect(sql).toBe(
        "SELECT id, type, actor.login FROM githubarchive.day.20250101 WHERE (type IN ('PushEvent', 'WatchEvent') OR actor.login = 'admin') LIMIT 10"
      );
    });

    it('handles string escaping in filter groups', () => {
      const plan: RootQueryPlan = {
        main_query: {
          table: 'githubarchive.day.20250101',
          columns: ['id', 'repo.name'],
          filters: [
            {
              logic: 'OR',
              filters: [
                { column: 'repo.name', op: '=', value: "user's-repo" },
                { column: 'repo.name', op: '=', value: 'test-repo' }
              ]
            }
          ],
          limit: 10,
        },
      };
      const sql = gitHubArchivePlanBuilder.buildQuery(plan);
      expect(sql).toBe(
        "SELECT id, repo.name FROM githubarchive.day.20250101 WHERE (repo.name = 'user''s-repo' OR repo.name = 'test-repo') LIMIT 10"
      );
    });

    it('does not validate columns in filter group', () => {
      const plan: RootQueryPlan = {
        main_query: {
          table: 'githubarchive.day.20250101',
          columns: ['id'],
          filters: [
            {
              logic: 'OR',
              filters: [
                { column: 'invalid_column', op: '=', value: 'test' }
              ]
            }
          ],
          limit: 10,
        },
      };
      const sql = gitHubArchivePlanBuilder.buildQuery(plan);
      expect(sql).toBe("SELECT id FROM githubarchive.day.20250101 WHERE (invalid_column = 'test') LIMIT 10");
    });

    it('throws for invalid operator in filter group', () => {
      const plan: RootQueryPlan = {
        main_query: {
          table: 'githubarchive.day.20250101',
          columns: ['id'],
          filters: [
            {
              logic: 'OR',
              filters: [
                { column: 'id', op: 'LIKE', value: '%test%' }
              ]
            }
          ],
          limit: 10,
        },
      };
      expect(() => gitHubArchivePlanBuilder.buildQuery(plan)).toThrow('Operator not allowed: LIKE');
    });

    it('works with CTEs and filter groups', () => {
      const plan: RootQueryPlan = {
        ctes: [
          {
            name: 'filtered_events',
            query: {
              table: 'githubarchive.day.20250101',
              columns: ['id', 'type', 'actor.login'],
              filters: [
                {
                  logic: 'OR',
                  filters: [
                    { column: 'type', op: '=', value: 'PushEvent' },
                    { column: 'type', op: '=', value: 'WatchEvent' }
                  ]
                }
              ],
              limit: 50,
            },
          },
        ],
        main_query: {
          table: 'filtered_events',
          columns: ['id', 'type'],
          filters: [
            { column: 'actor.login', op: '!=', value: 'bot' }
          ],
          limit: 10,
        },
      };
      const sql = gitHubArchivePlanBuilder.buildQuery(plan);
      expect(sql).toBe(
        "WITH filtered_events AS (SELECT id, type, actor.login FROM githubarchive.day.20250101 WHERE (type = 'PushEvent' OR type = 'WatchEvent') LIMIT 50)\nSELECT id, type FROM filtered_events WHERE actor.login != 'bot' LIMIT 10"
      );
    });
  });
}); 