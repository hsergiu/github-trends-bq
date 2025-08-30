import fs from 'fs';
import path from 'path';
import { v5 as uuidv5 } from 'uuid';
import PostgresService from '../postgres/PostgresService';
import RedisService from '../redis/RedisService';
import { EmbeddingsProvider } from '../services/EmbeddingsProvider';
import { ExamplesService, UpsertExampleParams } from '../services/ExamplesService';

interface ExamplesJson {
	baseEventsQuery: string;
	description?: string;
	required?: boolean;
	queries: Record<string, Array<{ id: string; description: string; sql: string }>>;
}

interface CliOptions {
	year: string; // yyyy
	start: string; // mmdd
	end: string; // mmdd
	file: string; // json path
}

const DEFAULT_TAG = 'githubarchive';
const UUID_NAMESPACE = 'b3f2a3a7-3d43-4580-9d2e-3c9ec2d3a123';

/** Parse CLI args like --year=YYYY --start=MMDD --end=MMDD and optional file path. */
function parseArgs(argv: string[]): Partial<CliOptions> {
	const out: Partial<CliOptions> = {};
	for (const arg of argv) {
		if (arg.startsWith('--year=')) out.year = arg.split('=')[1];
		else if (arg.startsWith('--start=')) out.start = arg.split('=')[1];
		else if (arg.startsWith('--end=')) out.end = arg.split('=')[1];
		else if (!arg.startsWith('--')) out.file = arg;
	}
	return out;
}

/** Normalize a section key into a '-' tag. */
function normalizeTag(tag: string): string {
	return tag.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Create a stable UUIDv5 from section and example ids. */
function computeId(sectionKey: string, exampleId: string): string {
	return uuidv5(`${sectionKey}::${exampleId}`, UUID_NAMESPACE); // stable upserts for reruns
}

/** Replace yyyy* and the first two mmdd placeholders in the base SQL. */
function replacePlaceholdersInBase(baseSql: string, year: string, start: string, end: string, needsStartDate: boolean): string {
	// Replace yyyy* pattern in table path
	let sql = baseSql.replace(/yyyy\*/g, `${year}*`);
	// Replace the first two 'mmdd' occurrences deterministically with start and end
	let mmddCount = 0;
	sql = sql.replace(/mmdd/g, () => {
		mmddCount += 1;
		return mmddCount === 1 ? start : end;
	});

	return sql;
}

/** Concatenate the base query and example body SQL with spacing. */
function stitchBaseAndBody(baseSql: string, bodySql: string): string {
	return `${baseSql}\n\n${bodySql}`;
}

/** Entry point: import examples from JSON into storage and embeddings index. */
async function main() {
	const now = new Date();
	const defaults: CliOptions = {
		year: String(now.getUTCFullYear()),
		start: '0101',
		end: '0102',
		file: 'src/bigquery/schemas/github-archive/examples.json',
	};
	const args = parseArgs(process.argv.slice(2));
	const year = args.year || defaults.year;
	const start = args.start || defaults.start;
	const end = args.end || defaults.end;
	const filePath = path.resolve(process.cwd(), args.file || defaults.file);

	if (!fs.existsSync(filePath)) {
		console.error(`Examples JSON not found at ${filePath}`);
		process.exit(1);
	}

	const json: ExamplesJson = JSON.parse(fs.readFileSync(filePath, 'utf8'));
	const baseRaw = json.baseEventsQuery;

	const redis = RedisService.getInstance();
	await redis.initializeService();

	const postgres = PostgresService.getInstance();
	await postgres.initializeService();

	const embed = new EmbeddingsProvider();
	const examplesService = new ExamplesService(postgres, embed);

	let total = 0;
	let success = 0;

	for (const [sectionKey, items] of Object.entries(json.queries)) {
		const sectionTag = normalizeTag(sectionKey);
		for (const item of items) {
			total += 1;
			try {
				const needsStartDate = /start_date/.test(item.sql);
				const baseSql = replacePlaceholdersInBase(baseRaw, year, start, end, needsStartDate);
				const finalSql = stitchBaseAndBody(baseSql, item.sql);
				const title = item.description;
				const promptText = `${title} - ${sectionKey} - year ${year} from ${start} (mmdd) to ${end} (mmdd) (GitHub Archive)`;
				const id = computeId(sectionKey, item.id);
				const tags = Array.from(new Set([DEFAULT_TAG, sectionTag]));

				const data: UpsertExampleParams = {
					id,
					title,
					promptText,
					sqlSnippet: finalSql,
					tags,
				};
				await examplesService.upsertExample(data);
				success += 1;
				console.log(`Upserted: [${sectionKey}] ${item.id} — ${title}`);
			} catch (err) {
				console.error(`Failed: [${sectionKey}] ${item.id} — ${item.description}`, err);
			}
		}
	}

	console.log(`Done. Upserted ${success}/${total} examples.`);

	await postgres.shutdown();
	await redis.shutdown();
}

main().catch((err) => {
	console.error('Fatal error during import:', err);
	process.exitCode = 1;
}); 