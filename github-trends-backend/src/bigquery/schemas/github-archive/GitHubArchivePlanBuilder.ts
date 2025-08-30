import { BaseBigQueryPlanBuilder } from '../BaseBigQueryPlanBuilder';

export class GitHubArchivePlanBuilder extends BaseBigQueryPlanBuilder {
  private injectedExamplesContext?: string;

  public setExamplesContext(examplesBlock: string | undefined): void {
    this.injectedExamplesContext = examplesBlock;
  }

  protected get allowedOperators(): string[] {
    return ["=", "!=", ">", "<", ">=", "<=", "IN", "BETWEEN"];
  }

  private get chartContext(): string {
    return `
    Available chart types:
    - line: Time series data (datetime x-axis, numeric y-axis)
    - bar: Categorical comparisons (category x-axis, numeric y-axis)  
    - pie: Distribution/proportions (≤8 categories recommended)
    - area: Cumulative trends over time
    - scatter: Correlation between two numeric variables
    - composed: Multiple metrics on same chart
    - table: Complex data or many columns

    Select the most appropriate chart type and specify which columns to use for visualization axes.
    Table type should only be used as the last option if there is no better alternative.
    For events the user might need them grouped by another property like repo name.
    Select only the relevant columns for this purpose.
    `;
  }

  private get incompleteDataHelperPrompt(): string {
    const now = new Date();
    return `
      If the user did not specify a date interval or a date for event aggregation use last day ${now} as a reference.
      Define the interval \`githubarchive.day.yyyy*\` WHERE _TABLE_SUFFIX BETWEEN 'mmdd' AND 'mmdd'. Where yyyy, mm and dd are taken from the reference.
      Always use backticks (\`) around table identifiers when defining the table name.
    `;
  }

  private get qualityGatePrompt(): string {
    return `
    Quality gate and abstention rules:
    - Provide a self-assessed fidelity score in [0.0, 1.0] for how well the plan answers the user's question and will execute correctly.
    - If the user's intent is ambiguous, critical information is missing (e.g., repo scope, time window, metric), or the plan is likely to fail, set \"abstain\" to true.
    - Common issues that should reduce fidelity or trigger abstention:
      * Missing date filter when querying wildcard tables (e.g., githubarchive.day.yyyy*).
      * Selecting too many columns or using \"*\".
      * Unsupported operators or malformed filters.
      * Mismatch between requested metric and selected columns/aggregations.
      * Unclear grouping key for event aggregations.
    `;
  }

  private get additionalContextSections(): string[] {
    const sections = [
      this.chartContext,
      this.incompleteDataHelperPrompt,
      this.qualityGatePrompt,
    ];
    if (this.injectedExamplesContext) sections.push(this.injectedExamplesContext);
    return sections;
  }

  get additionalContext(): string {
    return this.additionalContextSections.join('\n');
  }

  get bigQueryPlanSchema(): any {
    return {
      name: "bigquery_plan",
      description: "BigQuery query plan with optional CTEs and main query",
      schema: {
        type: "object",
        properties: {
          fidelity: { type: "number", minimum: 0, maximum: 1, description: "Self-assessed confidence that the plan matches the user's intent and will work." },
          abstain: { type: "boolean", description: "Set true if the model is not confident enough to proceed." },
          ctes: {
            type: "array",
            description: "Common Table Expressions (optional)",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Name of the CTE" },
                query: { "$ref": "#/$defs/query_plan" }
              },
              required: ["name", "query"],
              additionalProperties: false
            }
          },
          main_query: { "$ref": "#/$defs/query_plan" },
        },
        required: ["fidelity", "abstain", "ctes", "main_query"],
        additionalProperties: false,
        "$defs": {
          "variable_ref": {
            type: "object",
            description: "Reference to a declared variable",
            properties: { var: { type: "string" } },
            required: ["var"],
            additionalProperties: false
          },
          "simple_filter": {
            type: "object",
            description: "Simple filter condition",
            properties: {
              column: { type: "string" },
              op: { type: "string" },
              value: {
                anyOf: [
                  { type: "string" },
                  { type: "number" },
                  { type: "boolean" },
                  { type: "null" },
                  { "$ref": "#/$defs/variable_ref" },
                  { type: "array", items: { anyOf: [ { type: "string" }, { type: "number" }, { "$ref": "#/$defs/variable_ref" } ] } }
                ]
              }
            },
            required: ["column", "op", "value"],
            additionalProperties: false
          },
          "filter_group": {
            type: "object",
            description: "Filter group with logical operator",
            properties: {
              logic: { type: "string", enum: ["AND", "OR"] },
              filters: {
                type: "array",
                items: { "$ref": "#/$defs/simple_filter" },
                minItems: 1
              }
            },
            required: ["logic", "filters"],
            additionalProperties: false
          },
          "query_plan": {
            type: "object",
            description: "Query definition with table, columns, filters and limit",
            properties: {
                table: { type: "string", description: "Table name to query from (allow backticks and wildcards like githubarchive.day.2012*)" },
                columns: { type: "array", items: { type: "string" }, minItems: 1, description: "Columns to select" },
                filters: { type: "array", description: "Filter conditions", items: { anyOf: [ { "$ref": "#/$defs/simple_filter" }, { "$ref": "#/$defs/filter_group" } ] } },
                groupBy: { type: "array", items: { type: "string" }, description: "Optional GROUP BY columns" },
                orderBy: {
                  type: "array",
                  description: "Optional ORDER BY clauses",
                  items: {
                    type: "object",
                    properties: {
                      column: { type: "string" },
                      direction: { type: "string", enum: ["ASC", "DESC" ] }
                    },
                    required: ["column", "direction"],
                    additionalProperties: false
                  }
                },
                limit: { type: "integer", description: "Maximum number of rows to return. This is optional." }
              },
              required: ["table", "columns", "filters", "limit", "groupBy", "orderBy"],
              additionalProperties: false
          }
        }
      },
      strict: true
    };
  }
}

export const gitHubArchivePlanBuilder = new GitHubArchivePlanBuilder();