import { FastifyBaseLogger } from "fastify";
import OpenAI from "openai";
import { SchemaContextLoader } from "../bigquery/SchemaContextLoader";
import { GitHubArchivePlanBuilder } from "../bigquery/schemas/github-archive/GitHubArchivePlanBuilder";
import { RootQueryPlan } from "../bigquery/schemas/BaseBigQueryPlanBuilder";
import PostgresService from "../postgres/PostgresService";
import { ExamplesService } from "./ExamplesService";
import { EmbeddingsProvider } from "./EmbeddingsProvider";
import { configService } from "../config/ConfigService";
import { UserFacingError } from "./ErrorUtils";

const DEFAULT_MODEL = "gpt-4o-2024-08-06";
const LIGHTWEIGHT_MODEL = "gpt-4o-mini";

const CHART_CONFIG_SCHEMA = {
  name: "chart_config",
  description: "Chart configuration",
  schema: {
    type: 'object',
    properties: {
      chartType: { 
        type: "string", 
        enum: ["line", "bar", "pie", "area", "scatter", "composed", "table"], 
        description: "Type of chart to render the data" 
      },
      encoding: {
        type: 'object',
        properties: {
          x: {
            type: 'object',
            properties: {
              field: { type: 'string' },
              type: { type: 'string', enum: ["temporal", "nominal", "quantitative"] },
              timeUnit: { type: 'string' },
              title: { type: 'string' },
            },
            required: ["field"],
          },
          y: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                field: { type: 'string' },
                type: { type: 'string', enum: ["quantitative", "nominal"] },
                aggregate: { type: 'string', enum: ["sum", "avg", "min", "max", "count", "none"] },
                title: { type: 'string' },
              },
              required: ["field"],
            },
          },
          category: {
            type: 'object',
            properties: { field: { type: 'string' }, title: { type: 'string' } },
            required: ["field"],
          },
          value: {
            type: 'object',
            properties: { field: { type: 'string' }, aggregate: { type: 'string' }, title: { type: 'string' } },
            required: ["field"],
          },
          series: { type: 'object', properties: { field: { type: 'string' } } },
        },
        additionalProperties: false,
      },
      options: {
        type: 'object',
        properties: {
          stack: { type: 'boolean' },
          sort: { type: 'string', enum: ["asc", "desc"] },
          limit: { type: 'number' },
        },
      },
    },
    required: ["chartType", "encoding"],
    additionalProperties: false
  },
};

/** Service that uses OpenAI to turn NL prompts into BigQuery plans and chart configs. */
export class LLMService {
  private logger: FastifyBaseLogger;
  private openai: OpenAI;
  private examplesService: ExamplesService;

  constructor(logger: FastifyBaseLogger) {
    this.logger = logger;

    const apiKey = configService.get('openai').apiKey;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is required in configuration");
    }

    this.openai = new OpenAI({ apiKey });

    const postgres = PostgresService.getInstance(logger);
    const embeddings = new EmbeddingsProvider('text-embedding-3-small');
    this.examplesService = new ExamplesService(postgres, embeddings);
  }

  private buildRetrievedExamplesBlock(results: Array<{ title: string; sql_snippet: string; chart_hint?: string | null; similarity: number }>): string {
    if (!results || results.length === 0) return '';
    const lines: string[] = [
      'Retrieved examples:'
    ];
    results.forEach((r, idx) => {
      if (!r.sql_snippet) return;
      lines.push(`${idx + 1}) Title: ${r.title}`);
      if (r.chart_hint) lines.push(` Hint: ${r.chart_hint}`);
      lines.push(' Snippet:');
      lines.push(` ${r.sql_snippet}`);
    });
    lines.push('\nUse these only as inspiration. Do not copy as is. Produce a fresh query according to the user prompt and the provided schema.');
    return lines.join('\n');
  }

  /** Basic safety validation to block wildcard or malformed plans. */
  private validatePlan(root: any): { ok: boolean, reason?: string } {
    if (!root || typeof root !== 'object') {
      return { ok: false, reason: 'Invalid plan' };
    }

    const main = root.main_query;
    if (!main) {
      return { ok: false, reason: 'Missing main_query' };
    }

    if (!main.table || typeof main.table !== 'string') {
      return { ok: false, reason: 'Missing table' };
    }
    if (!Array.isArray(main.columns) || main.columns.length === 0) {
      return { ok: false, reason: 'Missing columns' };
    }
    if (Array.isArray(main.columns) && main.columns.some((c: string) => c?.trim() === '*' )) {
      return { ok: false, reason: 'Wildcard columns are not allowed' };
    }

    // Heuristic: wildcard partition requires _TABLE_SUFFIX filter
    const usesWildcardDayTable = /githubarchive\.day\.[0-9]{4}\*/.test(main.table) || /githubarchive\.day\.\*/.test(main.table);
    if (usesWildcardDayTable) {
      const hasSuffixFilter = Array.isArray(main.filters) && main.filters.some((f: any) => {
        if (f && typeof f === 'object' && 'column' in f && 'op' in f) {
          const col = (f as any).column;
          const op = (f as any).op;
          return col === '_TABLE_SUFFIX' && (op === 'BETWEEN' || op === 'IN' || op === '=');
        }
        return false;
      });
      if (!hasSuffixFilter) {
        return { ok: false, reason: 'Wildcard day table requires _TABLE_SUFFIX filter' };
      }
    }

    return { ok: true };
  }

  /**
   * Build a BigQuery plan from a natural-language prompt using schema context and example retrieval.
   * @param userPrompt Natural-language question.
   * @param options Model and safety options.
   * @returns Object containing SQL, structured plan, title and fidelity.
   * @throws UserFacingError if plan is unsafe or below fidelity threshold.
   */
  public async generateQueryPlanWithSchemaContext(
    userPrompt: string,
    options?: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
      schemaKey?: string; // which schema folder under src/bigquery/schemas to use
      fidelityThreshold?: number; // abstain if below this threshold
    },
  ): Promise<any> {
    const {
      model = DEFAULT_MODEL,
      maxTokens = 500,
      temperature = 0.3,
      schemaKey = "github-archive",
      fidelityThreshold = 0.7,
    } = options || {};

    const schemaLoader = new SchemaContextLoader(schemaKey);
    const schemaContext = schemaLoader.getFullSchemaContext();

    // Attempt to retrieve 'limit' vector examples
    let examplesBlock = '';
    try {
      const examples = await this.examplesService.search(userPrompt, { limit: 1, minSim: 0.8, tags: ['githubarchive'] });
      if (examples && examples.length > 0) {
        examplesBlock = this.buildRetrievedExamplesBlock(examples.map(e => ({
          title: e.title,
          sql_snippet: e.sqlSnippet,
          chart_hint: e.chartHint,
          similarity: e.similarity,
        })));
      }
    } catch (err) {
      this.logger.warn({ err }, 'Vector example retrieval failed; continuing without examples');
      examplesBlock = '';
    }

    const planBuilder = new GitHubArchivePlanBuilder();
    planBuilder.setExamplesContext(examplesBlock);

    const userFinalPrompt = `User Question: ${userPrompt}`;
    const systemPrompt = [
      "You are a BigQuery query planner. Only return structured JSON in the following format:",
      JSON.stringify(planBuilder.bigQueryPlanSchema, null, 2),
      planBuilder.additionalContext
    ].join("\n");

    this.logger.info(
      `Generating query plan with model: ${model}, user prompt length: ${userPrompt.length}, system prompt length: ${systemPrompt.length}`,
    );

    const [queryResponse, titleResponse] = await Promise.all([
      this.openai.chat.completions.parse({
        model,
        messages: [
          { role: "system", content: systemPrompt + "\n" + (schemaContext || "") },
          { role: "user", content: userFinalPrompt },
        ],
        max_tokens: maxTokens,
        temperature,
        response_format: {
          type: "json_schema",
          json_schema: planBuilder.bigQueryPlanSchema
        }
      }),
      this.openai.chat.completions.create({
        model: LIGHTWEIGHT_MODEL,
        messages: [
          { role: "system", content: "Generate a short, descriptive title (max 30 characters) for this query. No quotes." },
          { role: "user", content: userPrompt }
        ],
        max_tokens: 20,
        temperature
      })
    ]);

    const structuredQueryPlanSchema: any = queryResponse?.choices[0]?.message?.parsed || {};
    const title = titleResponse.choices[0]?.message?.content?.trim() || userPrompt;

    const fidelity: number = typeof structuredQueryPlanSchema?.fidelity === 'number' ? structuredQueryPlanSchema.fidelity : 0;
    const abstainFlag: boolean = Boolean(structuredQueryPlanSchema?.abstain);
    const { ok: validation, reason } = this.validatePlan(structuredQueryPlanSchema);

    const shouldAbstain = abstainFlag || fidelity < fidelityThreshold || !validation;

    if (shouldAbstain) {
      this.logger.warn({ fidelity, validation, reason }, 'Abstaining from SQL generation due to low fidelity or validation failure');

      throw new UserFacingError(`Could not generate a safe SQL for this question. Please try refining your prompt.`);
    }

    const sql = planBuilder.buildQuery(structuredQueryPlanSchema as RootQueryPlan);
    return { sql, structuredQueryPlanSchema, title, fidelity };
  }

  /**
   * Infer a minimal chart configuration for a given result set.
   * @param resultSet Array of result rows.
   * @returns Chart config adhering to CHART_CONFIG_SCHEMA.
   */
  public async generateChartConfig(
    resultSet: any[]
  ) {
    try {
      if (!Array.isArray(resultSet) || resultSet.length === 0) {
        return { chartType: "table", encoding: {} };
      }

      const sampleSize = Math.min(10, resultSet.length);
      const sampleData = resultSet.slice(0, sampleSize);
      const columns = Object.keys(resultSet[0] || {});

      if (columns.length === 0) {
        return { chartType: "table", encoding: {} };
      }

      const systemPrompt = `You are a data visualization expert. Analyze the provided dataset and determine the best chart configuration.
        Chart types and their best use cases:
        - line: Time series data, trends over time
        - bar: Categorical comparisons, rankings
        - pie: Proportions/percentages, small number of categories (≤8)
        - area: Cumulative data, stacked time series
        - scatter: Correlation between two numeric variables
        - composed: Multiple chart types combined
        - table: When data is best viewed as raw values

        Use the 'encoding' object to specify which fields to use for axes/values.
        Return only the JSON configuration matching the schema.`;

      const userPrompt = `Dataset sample (${sampleSize} rows):
        ${JSON.stringify(sampleData, null, 2)}

        Total rows: ${resultSet.length}
        Columns: ${columns.join(", ")}

        Generate the optimal chart configuration for this data.`;

      this.logger.info(
        `Generating chart config with sample size: ${sampleSize}, total rows: ${resultSet.length}`,
      );

      const response = await this.openai.chat.completions.parse({
        model: DEFAULT_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 200,
        temperature: 0.1,
        response_format: {
          type: "json_schema",
          json_schema: CHART_CONFIG_SCHEMA
        }
      });

      const chartConfig = response?.choices[0]?.message?.parsed || { 
        chartType: "table",
        encoding: {}
      };

      this.logger.info(`Generated chart config: ${JSON.stringify(chartConfig)}`);
      return chartConfig;

    } catch (err) {
      this.logger.error({ err }, "Failed to generate chart config with LLM, falling back to table");
      return { 
        chartType: "table",
        encoding: {}
      };
    }
  }
}
