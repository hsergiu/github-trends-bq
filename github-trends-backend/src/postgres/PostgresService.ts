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
  sqlHash: string;
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

  async updateJobMetadata(bullJobId: string, updates: Partial<JobMetadata>): Promise<JobMetadata> {
    return this.prisma.jobMetadata.update({
      where: { bullJobId },
      data: updates,
    });
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
        sqlHash: questionParams.sqlHash,
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
    await this.prisma.questionResult.deleteMany();
    await this.prisma.jobMetadata.deleteMany();
    await this.prisma.question.deleteMany();
  }

  getPrismaClient(): PrismaClient {
    return this.prisma;
  }
}

export default PostgresService;