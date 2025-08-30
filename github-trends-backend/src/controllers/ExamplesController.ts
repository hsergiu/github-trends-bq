import { FastifyBaseLogger, FastifyReply, FastifyRequest } from "fastify";
import PostgresService from "../postgres/PostgresService";
import { EmbeddingsProvider } from "../services/EmbeddingsProvider";
import { ExamplesService } from "../services/ExamplesService";

export class ExamplesController {
  private logger: FastifyBaseLogger;
  private examplesService: ExamplesService;

  constructor(logger: FastifyBaseLogger) {
    this.logger = logger;
    const postgres = PostgresService.getInstance(logger);
    const embeddings = new EmbeddingsProvider('text-embedding-3-small');
    this.examplesService = new ExamplesService(postgres, embeddings);
  }

  public async upsertExample(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id, title, promptText, sqlSnippet, chartHint, tags } = request.body as {
        id?: string;
        title: string;
        promptText: string;
        sqlSnippet: string;
        chartHint?: string;
        tags?: string[];
      };

      if (!title || !promptText || !sqlSnippet) {
        return reply.status(400).send({ error: 'Missing required fields: title, promptText, sqlSnippet' });
      }

      const exampleId = await this.examplesService.upsertExample({ id, title, promptText, sqlSnippet, chartHint, tags });
      return reply.status(200).send({ id: exampleId });
    } catch (err) {
      this.logger.error({ err }, 'Failed to upsert example');
      return reply.status(500).send({ error: 'Failed to upsert example' });
    }
  }

  public async searchExamples(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { prompt, limit, minSim, tags } = request.body as {
        prompt: string;
        limit?: number;
        minSim?: number;
        tags?: string[];
      };

      if (!prompt) {
        return reply.status(400).send({ error: 'Missing required field: prompt' });
      }

      const results = await this.examplesService.search(prompt, { limit, minSim, tags });
      return reply.status(200).send({ results });
    } catch (err) {
      this.logger.error({ err }, 'Failed to search examples');
      return reply.status(500).send({ error: 'Failed to search examples' });
    }
  }
} 