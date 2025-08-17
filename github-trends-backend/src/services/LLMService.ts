import { FastifyBaseLogger } from "fastify";
import OpenAI from "openai";
import { SchemaContextLoader } from "../bigquery/SchemaContextLoader";
import { GitHubArchivePlanBuilder } from "../bigquery/schemas/github-archive/GitHubArchivePlanBuilder";
import { RootQueryPlan } from "../bigquery/schemas/BaseBigQueryPlanBuilder";

const DEFAULT_MODEL = "gpt-4o-2024-08-06";
const LIGHTWEIGHT_MODEL = "gpt-4o-mini";

export class LLMService {
  private logger: FastifyBaseLogger;
  private openai: OpenAI;

  constructor(logger: FastifyBaseLogger) {
    this.logger = logger;

    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  public async generateQueryPlanWithSchemaContext(
    userPrompt: string,
    options?: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
      schemaKey?: string; // which schema folder under src/bigquery/schemas to use
    },
  ): Promise<any> {
    const {
      model = DEFAULT_MODEL,
      maxTokens = 500,
      temperature = 0.3,
      schemaKey = "github-archive",
    } = options || {};

    // Load schema-specific context
    const schemaLoader = new SchemaContextLoader(schemaKey);
    const schemaContext = schemaLoader.getFullSchemaContext();

    // Create a fresh builder per request
    const planBuilder = new GitHubArchivePlanBuilder();

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

    const structuredQueryPlanSchema = queryResponse?.choices[0]?.message?.parsed || {};
    const title = titleResponse.choices[0]?.message?.content?.trim() || userPrompt;

    const sql = planBuilder.buildQuery(structuredQueryPlanSchema as RootQueryPlan);
    return { sql, structuredQueryPlanSchema, title };
  }

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

      const chartConfigSchema = {
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
                // For pie charts
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
                // Optional multi-series
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
          json_schema: chartConfigSchema
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
