import { BigQuery } from "@google-cloud/bigquery";
import { promises as fs } from "fs";

// BigQuery constants
const BIGQUERY_CONSTANTS = {
  MAX_BYTES_LIMIT: 1024 * 1024 * 1024 * 3, // 3 GB
  BYTES_TO_MB: 1024 * 1024,
} as const;

interface BigQueryGatewayConfig {
  projectId?: string;
  keyFilename?: string;
  maxBytes?: number;
}

interface QueryOptions {
  maxBytes?: number;
  skipSizeCheck?: boolean;
  params?: Record<string, any>;
}

export interface QueryResult<T = any> {
  rows: T[];
  job: {
    id: string;
    metadata: any;
    status: {
      state: string;
      errorResult?: {
        message: string;
        reason: string;
      };
    };
  };
}

interface QueryCache {
  [filePath: string]: {
    content: string;
  };
}

interface QueryVariables {
  [key: string]: string | number | boolean | null;
}

class BigQueryGateway {
  private bigquery: BigQuery;
  private maxBytes: number;
  private queryCache: QueryCache = {};

  constructor(config: BigQueryGatewayConfig = {}) {
    this.bigquery = new BigQuery({
      projectId: config.projectId || process.env.GOOGLE_CLOUD_PROJECT,
    });

    this.maxBytes = config.maxBytes || BIGQUERY_CONSTANTS.MAX_BYTES_LIMIT;
  }

  private async estimateQuerySize(
    query: string,
    options: QueryOptions = {},
  ): Promise<number> {
    try {
      const [job] = await this.bigquery.createQueryJob({
        query,
        ...options,
        dryRun: true,
      });
      return parseInt(job.metadata.statistics.totalBytesProcessed);
    } catch (error) {
      throw new Error(
        `Failed to estimate query size: ${(error as Error).message}`,
      );
    }
  }

  private async validateQuerySize(query: string, options: QueryOptions): Promise<void> {
    if (options.skipSizeCheck) return;
    
    const bytesToProcess = await this.estimateQuerySize(query, options);
    const maxBytes = options.maxBytes || this.maxBytes;

    if (bytesToProcess > maxBytes) {
      throw new Error(
        `Query would process ${(bytesToProcess / BIGQUERY_CONSTANTS.BYTES_TO_MB).toFixed(2)} MB, which exceeds limit of ${(maxBytes / BIGQUERY_CONSTANTS.BYTES_TO_MB).toFixed(2)} MB.`,
      );
    }
  }

  private async createAndExecuteJob<T = any>(query: string, options: QueryOptions): Promise<QueryResult<T>> {
    const [job] = await this.bigquery.createQueryJob({
      query,
      ...options,
    });

    const [rows] = await job.getQueryResults();

    return {
      rows,
      job: {
        id: job.id || "",
        metadata: job.metadata,
        status: job.metadata.status,
      },
    };
  }

  public async executeQuery<T = any>(
    query: string,
    options: QueryOptions = {},
  ): Promise<QueryResult<T>> {
    if (!query || typeof query !== 'string') {
      throw new Error('Query must be a non-empty string');
    }

    try {
      await this.validateQuerySize(query, options);
      return await this.createAndExecuteJob<T>(query, options);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`BigQuery query failed: ${errorMessage}`);
    }
  }

  private async readQueryFromFile(
    filePath: string,
    variables: QueryVariables = {},
    options: { bypassCache?: boolean } = {},
  ): Promise<string> {
    try {
      const cached = this.queryCache[filePath];
      if (!options.bypassCache && cached) {
        return this.replaceVariables(cached.content, variables);
      }

      const query = await fs.readFile(filePath, "utf-8");

      this.queryCache[filePath] = {
        content: query,
      };

      return this.replaceVariables(query, variables);
    } catch (error) {
      throw new Error(`Failed to read query file: ${(error as Error).message}`);
    }
  }

  private replaceVariables(query: string, variables: QueryVariables): string {
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`__${key}\\b`, "g");
      if (typeof value === "string") {
        query = query.replace(regex, `${value.replace(/'/g, "\\'")}`);
      } else {
        query = query.replace(regex, String(value));
      }
    }
    return query;
  }

  public clearQueryCache(filePath?: string): void {
    if (filePath) {
      delete this.queryCache[filePath];
    } else {
      this.queryCache = {};
    }
  }

  public async executeQueryFromFile<T = any>(
    filePath: string,
    variables: QueryVariables = {},
    options: QueryOptions & { bypassCache?: boolean } = {},
  ): Promise<QueryResult<T>> {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('File path must be a non-empty string');
    }

    try {
      const query = await this.readQueryFromFile(filePath, variables, {
        bypassCache: options.bypassCache,
      });

      const { bypassCache, ...queryOptions } = options;
      return this.executeQuery<T>(query, queryOptions);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(
        `Failed to execute query from file '${filePath}': ${errorMessage}`,
      );
    }
  }
}

export default BigQueryGateway;
