import { RedisGateway } from "./RedisGateway";
import { FastifyBaseLogger } from "fastify";
import { safeJsonParse } from "../utils/utils";

const TTL = {
  DEFAULT: 60 * 60 * 24, // 24 hours
  LONG: 60 * 60 * 24 * 30, // 30 days
  SHORT: 60 * 10, // 10 minutes
};

const CACHE_PREFIXES = {
  QUESTION_BY_ID: 'question:id',
  QUESTION_RESULT: 'question:result',
  PROMPT_HASH: 'question:prompt',
  SQL_HASH: 'question:sql',
  BIGQUERY_RESULT: 'bigquery:result',
  EMBEDDING: 'embedding:prompt',
};

class RedisService {
  private static instance: RedisService | null = null;
  private redisGateway!: RedisGateway;
  private logger?: FastifyBaseLogger;

  public static getInstance(logger?: FastifyBaseLogger): RedisService {
    if (!RedisService.instance) {
      RedisService.instance = new RedisService(logger);
    }
    return RedisService.instance;
  }

  private constructor(logger?: FastifyBaseLogger) {
    this.logger = logger;
  }

  public async initializeService(redisGateway?: RedisGateway): Promise<void> {
    if (!this.redisGateway) {
      this.redisGateway = redisGateway || new RedisGateway();
      await this.redisGateway.connect();
    }
  }

  async shutdown(): Promise<void> {
    await this.redisGateway.disconnect();
  }

  private generateCacheKey(prefix: string, identifier: string): string {
    return `${prefix}:${identifier}`;
  }

  async cachePromptHash(promptHash: string, data: any, expiryInSeconds: number = TTL.DEFAULT): Promise<void> {
    await this.cache(CACHE_PREFIXES.PROMPT_HASH, promptHash, data, expiryInSeconds);
  }

  async getPromptHash(promptHash: string): Promise<any | null> {
    return this.get(CACHE_PREFIXES.PROMPT_HASH, promptHash, 'getPromptHash');
  }

  async cacheSqlHashWithResult(sqlHash: string, data: any, expiryInSeconds: number = TTL.DEFAULT): Promise<void> {
    await this.cache(CACHE_PREFIXES.SQL_HASH, sqlHash, data, expiryInSeconds);
  }

  async getSqlHashWithResult(sqlHash: string): Promise<any | null> {
    return this.get(CACHE_PREFIXES.SQL_HASH, sqlHash, 'getSqlHashWithResult');
  }

  async cacheEmbedding(prompt: string, vector: number[], expiryInSeconds: number = TTL.SHORT): Promise<void> {
    await this.cache(CACHE_PREFIXES.EMBEDDING, prompt, { v: vector }, expiryInSeconds);
  }

  async getEmbedding(prompt: string): Promise<number[] | null> {
    const data = await this.get(CACHE_PREFIXES.EMBEDDING, prompt, 'getEmbedding');
    return Array.isArray(data?.v) ? (data.v as number[]) : null;
  }

  private async cache(prefix: string, identifier: string, data: any, expiryInSeconds: number): Promise<void> {
    const cacheKey = this.generateCacheKey(prefix, identifier);
    await this.redisGateway.set(cacheKey, JSON.stringify(data), expiryInSeconds);
  }

  private async get(prefix: string, identifier: string, operation: string): Promise<any | null> {
    const cacheKey = this.generateCacheKey(prefix, identifier);
    const cachedData = await this.redisGateway.get(cacheKey);
    
    return cachedData ? safeJsonParse(cachedData, this.logger, {
      identifier,
      cacheKey,
      operation
    }) : null;
  }

  public async flushAll(): Promise<void> {
    const keys = await this.redisGateway.keys("*");
    if (keys.length > 0) {
      const pipeline = this.redisGateway.getClient().multi();
      keys.forEach((key) => pipeline.del(key));
      await pipeline.exec();
    }
  }

  public async testCleanup(): Promise<void> {
    await this.flushAll();
    await this.shutdown();
  }
}

export default RedisService;
