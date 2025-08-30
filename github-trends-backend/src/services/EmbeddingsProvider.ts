import OpenAI from 'openai';
import RedisService from '../redis/RedisService';
import { configService } from '../config/ConfigService';
import crypto from 'crypto';

export class EmbeddingsProvider {
	public readonly modelName: string;
	private client: OpenAI;
	private redis: RedisService;

	constructor(modelName: string = 'text-embedding-3-small') {
		const apiKey = configService.get('openai').apiKey;
		if (!apiKey) {
			throw new Error('OPENAI_API_KEY is required in configuration');
		}
		this.modelName = modelName;
		this.client = new OpenAI({ apiKey });
		this.redis = RedisService.getInstance();
	}

	/**
	 * Generate an embedding for a given text.
	 * @param text The text to embed.
	 * @returns The embedding vector.
	 */
	async embed(text: string): Promise<number[]> {
		const existing = await this.redis.getEmbedding(this.buildCacheKey(text));
		if (existing) return existing;

		const res = await this.client.embeddings.create({ model: this.modelName, input: text });
		const vector = res.data?.[0]?.embedding || [];
		await this.redis.cacheEmbedding(this.buildCacheKey(text), vector);
		return vector;
	}

	/**
	 * Build a cache key for a given text.
	 * @param text The text to build a cache key for.
	 * @returns The cache key.
	 */
	private buildCacheKey(text: string): string {
		const hash = crypto.createHash('sha256').update(text, 'utf8').digest('hex');
		return `${this.modelName}:${hash}`;
	}
} 