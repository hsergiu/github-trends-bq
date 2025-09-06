import { PrismaClient, Question, JobMetadata, QuestionResult } from '@prisma/client';
import { FastifyBaseLogger } from 'fastify';
import { Prisma } from '@prisma/client';
import { configService } from '../config/ConfigService';

type QuestionWithRelations = Prisma.QuestionGetPayload<{
  include: { result: true, jobMetadata: true }
}>;

export interface CreateQuestionParams {
  id?: string;
  questionContent: string;
  title: string;
  bigQuerySql: string;
  structuredQueryPlanSchema?: any;
}

export interface CreateJobMetadataParams {
  questionId: string;
  bullJobId: string;
  status?: string;
  failedReason?: string;
}

export interface CreateQuestionResultParams {
  questionId: string;
  result: any;
}

export interface CreateQuestionRequestParams {
  questionId: string;
  source?: string;
}

export interface UpsertExampleDbParams {
  id: string;
  title: string;
  promptText: string;
  sqlSnippet: string;
  chartHint?: string | null;
  tags?: string[];
  embedding: number[];
  embeddingModel: string;
}

export interface SearchExamplesOpts {
  limit?: number;
  minSim?: number;
  tags?: string[];
}

export class PostgresService {
  private static instance: PostgresService | null = null;
  private prisma: PrismaClient;
  private logger?: FastifyBaseLogger;

  public static getInstance(logger?: FastifyBaseLogger): PostgresService {
    if (!PostgresService.instance) {
      PostgresService.instance = new PostgresService(logger);
    }
    return PostgresService.instance;
  }

  private constructor(logger?: FastifyBaseLogger) {
    this.logger = logger;
    this.prisma = new PrismaClient({
      log: logger ? ['query', 'error', 'warn'] : ['error'],
      datasources: {
        db: {
          url: configService.get('postgres').databaseUrl,
        },
      },
    });
  }

  async initializeService(): Promise<void> {
    try {
      await this.prisma.$connect();
      this.logger?.info('PostgreSQL service initialized');
    } catch (error) {
      this.logger?.error('Failed to initialize PostgreSQL service', error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    try {
      await this.prisma.$disconnect();
      this.logger?.info('PostgreSQL service shutdown');
    } catch (error) {
      this.logger?.error('Error shutting down PostgreSQL service', error);
      throw error;
    }
  }

  async getSuggestedQuestions(): Promise<Question[]> {
    return this.prisma.question.findMany({
      where: { type: 'suggested' },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getUserQuestions(): Promise<Question[]> {
    return this.prisma.question.findMany({
      where: {
        jobMetadata: {
          some: {
            status: 'completed'
          }
        },
        type: 'user'
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getQuestionById(id: string): Promise<QuestionWithRelations | null> {
    return this.prisma.question.findUnique({
      where: { id },
      include: { result: true, jobMetadata: true },
    });
  }

  async createJobMetadata(metadata: CreateJobMetadataParams): Promise<JobMetadata> {
    return this.prisma.jobMetadata.create({
      data: {
        questionId: metadata.questionId,
        bullJobId: metadata.bullJobId,
        status: metadata.status || 'pending',
        failedReason: metadata.failedReason,
      },
    });
  }

  async createQuestionRequest(request: CreateQuestionRequestParams): Promise<void> {
    await this.prisma.questionRequest.create({
      data: {
        questionId: request.questionId,
        source: request.source,
      }
    });
  }

  async updateJobMetadata(bullJobId: string, updates: Partial<JobMetadata>): Promise<JobMetadata> {
    return this.prisma.jobMetadata.update({
      where: { bullJobId },
      data: updates,
    });
  }

  /**
   * Promote popular questions to suggested
   * @param params.threshold - The threshold for the promotion
   * @param params.windowHours - The window hours for the promotion
   * @returns The number of questions promoted
   */
  async promotePopularQuestions(params: { threshold: number; windowHours: number }): Promise<number> {
    const { threshold, windowHours } = params;
    const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000);

    const popular = await this.prisma.questionRequest.groupBy({
      by: ['questionId'],
      where: {
        createdAt: { gte: windowStart },
        question: { type: 'user' },
      },
      _count: { questionId: true },
      having: {
        questionId: {
          _count: {
            gte: threshold,
          },
        },
      },
    } as any);

    if (!popular || popular.length === 0) return 0;

    const questionIds = popular.map((p: any) => p.questionId);

    const result = await this.prisma.question.updateMany({
      where: {
        id: { in: questionIds },
        type: 'user',
      },
      data: {
        type: 'suggested',
        updatedAt: new Date(),
      },
    });

    return result.count || 0;
  }

  async completeJobWithResult(bullJobId: string, returnValue: any): Promise<{ jobMetadata: JobMetadata; result: QuestionResult }> {
    return this.prisma.$transaction(async (tx) => {
      const jobMetadata = await tx.jobMetadata.update({
        where: { bullJobId },
        data: { status: 'completed' },
      });

      const rows = returnValue?.result?.rows;
      const chartConfig = returnValue?.chartConfig;
      const result = await tx.questionResult.upsert({
        where: { questionId: jobMetadata.questionId },
        update: {
          result: { rows, chartConfig },
          updatedAt: new Date(),
        },
        create: {
          questionId: jobMetadata.questionId,
          result: { rows, chartConfig },
        },
      });

      return { jobMetadata, result };
    });
  }

  async createQuestion(questionParams: CreateQuestionParams): Promise<Question> {
    return this.prisma.question.create({
      data: {
        id: questionParams.id,
        questionContent: questionParams.questionContent,
        title: questionParams.title,
        bigQuerySql: questionParams.bigQuerySql,
        structuredQueryPlanSchema: questionParams.structuredQueryPlanSchema,
      },
    });
  }

  async updateQuestion(questionId: string, updates: Prisma.QuestionUpdateInput): Promise<Question> {
    return this.prisma.question.update({
      where: { id: questionId },
      data: updates,
    });
  }

  async deleteQuestion(questionId: string): Promise<void> {
    await this.prisma.question.delete({
      where: { id: questionId },
    });
  }

  async testCleanup(): Promise<void> {
    await this.prisma.questionRequest.deleteMany();
    await this.prisma.questionResult.deleteMany();
    await this.prisma.jobMetadata.deleteMany();
    await this.prisma.question.deleteMany();
  }

  getPrismaClient(): PrismaClient {
    return this.prisma;
  }

  async upsertExample(example: UpsertExampleDbParams): Promise<void> {
    const embeddingLiteral = `[${example.embedding.join(',')}]`;
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO query_examples (id, title, prompt_text, sql_snippet, chart_hint, tags, embedding, embedding_model)
       VALUES ($1::uuid, $2, $3, $4, $5, $6::text[], $7::vector, $8)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         prompt_text = EXCLUDED.prompt_text,
         sql_snippet = EXCLUDED.sql_snippet,
         chart_hint = EXCLUDED.chart_hint,
         tags = EXCLUDED.tags,
         embedding = EXCLUDED.embedding,
         embedding_model = EXCLUDED.embedding_model,
         updated_at = now();`,
      example.id,
      example.title,
      example.promptText,
      example.sqlSnippet,
      example.chartHint ?? null,
      (example.tags || []) as any,
      embeddingLiteral,
      example.embeddingModel,
    );
  }

  async searchExamplesByVector(embedding: number[], opts: SearchExamplesOpts = {}): Promise<Array<{ id: string; title: string; prompt_text: string; sql_snippet: string; chart_hint: string | null; tags: string[]; similarity: number }>> {
    const limit = opts.limit ?? 3;
    const minSim = opts.minSim ?? 0.8;
    const hasTags = Array.isArray(opts.tags) && opts.tags.length > 0;
    const embeddingLiteral = `[${embedding.join(',')}]`;

    if (hasTags) {
      const rows = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT id, title, prompt_text, sql_snippet, chart_hint, tags,
                1 - (embedding <=> $1::vector) AS similarity
         FROM query_examples
         WHERE (tags && $2::text[])
           AND 1 - (embedding <=> $1::vector) >= $3
         ORDER BY embedding <=> $1::vector
         LIMIT $4`,
        embeddingLiteral,
        opts.tags as any,
        minSim,
        limit
      );
      return rows as any;
    } else {
      const rows = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT id, title, prompt_text, sql_snippet, chart_hint, tags,
                1 - (embedding <=> $1::vector) AS similarity
         FROM query_examples
         WHERE 1 - (embedding <=> $1::vector) >= $2
         ORDER BY embedding <=> $1::vector
         LIMIT $3`,
        embeddingLiteral,
        minSim,
        limit
      );
      return rows as any;
    }
  }
}

export default PostgresService;