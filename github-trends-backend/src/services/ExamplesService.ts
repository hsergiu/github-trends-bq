import PostgresService from "../postgres/PostgresService";
import { EmbeddingsProvider } from "./EmbeddingsProvider";
import crypto from 'crypto';

export interface UpsertExampleParams {
	id?: string;
	title: string;
	promptText: string;
	sqlSnippet: string;
	chartHint?: string;
	tags?: string[];
}

export interface SearchOptions {
	limit?: number;
	minSim?: number;
	tags?: string[];
}

export interface ExampleSearchResult {
	id: string;
	title: string;
	promptText: string;
	sqlSnippet: string;
	chartHint: string | null;
	tags: string[];
	similarity: number;
}

export class ExamplesService {
	private postgres: PostgresService;
	private embed: EmbeddingsProvider;

	constructor(postgres?: PostgresService, embed?: EmbeddingsProvider) {
		this.postgres = postgres || PostgresService.getInstance();
		this.embed = embed || new EmbeddingsProvider();
	}

	/**
	 * Upsert an example into the database.
	 * @param example The example to upsert.
	 * @returns The ID of the upserted example.
	 */
	async upsertExample(example: UpsertExampleParams): Promise<string> {
		const id = example.id ?? crypto.randomUUID();

		const vector = await this.embed.embed(example.promptText);
		await this.postgres.upsertExample({
			id,
			title: example.title,
			promptText: example.promptText,
			sqlSnippet: example.sqlSnippet,
			chartHint: example.chartHint,
			tags: example.tags || [],
			embedding: vector,
			embeddingModel: this.embed.modelName,
		});
		return id;
	}

	/**
	 * Search for examples by embedding similarity.
	 * @param userPrompt The natural language prompt to search for.
	 * @param opts Optional search parameters.
	 * @returns Array of matching examples.
	 */
	async search(userPrompt: string, opts: SearchOptions = { limit: 1, minSim: 0.8, tags: ["githubarchive"] }): Promise<ExampleSearchResult[]> {
		const vector = await this.embed.embed(userPrompt);
		const rows = await this.postgres.searchExamplesByVector(vector, opts);
		return rows.map((r) => ({
			id: r.id,
			title: r.title,
			promptText: r.prompt_text,
			sqlSnippet: r.sql_snippet,
			chartHint: r.chart_hint,
			tags: r.tags,
			similarity: r.similarity,
		}));
	}
}
