import { Question } from "@prisma/client";
import { FastifyBaseLogger, FastifyReply } from "fastify";
import { JobService } from "./JobService";
import RedisService from "../redis/RedisService";
import { SSEService } from "./SSEService";
import BigQueryService from "../bigquery/BigQueryService";
import PostgresService from "../postgres/PostgresService";
import { LLMService } from "./LLMService";
import { Job } from "bull";
import { JobState } from "./SSEService";
import { calculateSqlHash, calculatePromptHash } from "../controllers/utils";
import crypto from "crypto";

const QUESTION_JOB_TYPE = "question-processing";

export class QuestionsService {
  private logger: FastifyBaseLogger;
  private jobService: JobService;
  private redisService: RedisService;
  private sseService: SSEService;
  private bigQueryService: BigQueryService;
  private postgresService: PostgresService;
  private llmService: LLMService;

  constructor(
    logger: FastifyBaseLogger,
    jobService?: JobService,
    redisService?: RedisService,
    sseService?: SSEService,
    bigQueryService?: BigQueryService,
    postgresService?: PostgresService,
    llmService?: LLMService,
  ) {
    this.logger = logger;
    this.jobService = jobService || new JobService(logger);
    this.redisService = redisService || RedisService.getInstance(logger);
    this.sseService = sseService || SSEService.getInstance();
    this.bigQueryService = bigQueryService || BigQueryService.getInstance();
    this.postgresService = postgresService || PostgresService.getInstance(logger);
    this.llmService = llmService || new LLMService(logger);
    this.sseService.initializeService(logger);
  }

  /** Register the question job processor and SSE event relays. */
  public initJobProcessor(): void {
    this.jobService.registerProcessor(
      QUESTION_JOB_TYPE,
      this.processQuestionJob.bind(this),
    );

    this.jobService.on("job:completed", ({ queue, job }) => {
      if (queue === QUESTION_JOB_TYPE) {
        this.onJobCompleted(job).catch(error => {
          this.logger.error(`Failed to handle job completion for ${job.id}`, error);
        });
        const jobState = this.buildJobState(job);
        this.sseService.sendUpdate(job.data.customId, jobState);
      }
    });

    this.jobService.on("job:failed", ({ queue, job }) => {
      if (queue === QUESTION_JOB_TYPE) {
        this.onJobFailed(job).catch(error => {
          this.logger.error(`Failed to handle job failure for ${job.id}`, error);
        });
        const jobState = this.buildJobState(job);
        this.sseService.sendUpdate(job.data.customId, jobState);
      }
    });
  }

  /**
   * Orchestrate LLM planning, BigQuery execution, chart config, and caching.
   * @param job Bull job payload containing user question and IDs.
   * @returns Result rows and chart config.
   */
  private async processQuestionJob(job: Job): Promise<{ result: any, chartConfig: any }> {
    this.logger.info(`Processing question job ${job.id}`);
    const { questionId, userQuestion } = job.data.params;

    try {
      this.logger.info(`Starting LLM processing for job ${job.id}`);
      const { sql, structuredQueryPlanSchema, title } =
        await this.llmService.generateQueryPlanWithSchemaContext(userQuestion);

      const sqlHash = calculateSqlHash(sql);

      // Check if SQL result already cached BEFORE updating question
      const sqlInfo = await this.getSqlHashWithResult(sqlHash);
      if (sqlInfo && sqlInfo.questionId && sqlInfo.result) {
        this.logger.info(`SQL hash ${sqlHash} already cached, reusing result and question ${sqlInfo.questionId}`);
        await this.postgresService.deleteQuestion(questionId);
        const promptHash = calculatePromptHash(userQuestion);
        await this.cachePromptHash(promptHash, {
          jobId: sqlInfo.jobId,
          questionId: sqlInfo.questionId
        });
        job.data.deduplicated = true;
        return { result: sqlInfo.result, chartConfig: sqlInfo.chartConfig };
      }

      await this.postgresService.updateQuestion(questionId, {
        bigQuerySql: sql,
        structuredQueryPlanSchema,
        title,
        sqlHash
      });

      this.logger.info(`Starting BigQuery execution for job ${job.id}`);
      const queryResult = await this.bigQueryService.executeQuery(sql);

      const chartConfig = await this.llmService.generateChartConfig(queryResult?.rows || []);

      await this.cacheSqlHashWithResult(sqlHash, {
        questionId,
        result: queryResult,
        chartConfig,
        jobId: job.id
      });

      this.logger.info(`Completed question job ${job.id} for question ${questionId}`);
      // Metadata needed by buildJobState
      job.data.params.title = title;
      job.data.params.sqlHash = sqlHash;

      return { result: queryResult, chartConfig };
    } catch (error) {
      this.logger.error(`Failed question job ${job.id} for question ${questionId}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        questionId,
      });
      throw error;
    }
  }

  /**
   * Deduplicate by prompt hash, create question if missing, then enqueue processing.
   * @param params User question and optional questionId.
   * @returns The enqueued job and resolved questionId.
   */
  public async scheduleQuestionJob(params: { userQuestion: string; questionId?: string }): Promise<{ job: any; questionId: string }> {
    const promptHash = calculatePromptHash(params.userQuestion);

    // Check if a job/question for this prompt already exists in Redis
    const promptInfo = await this.getPromptHash(promptHash);
    if (promptInfo && promptInfo.jobId && promptInfo.questionId) {
      const existingJob = await this.jobService.findExistingJob(QUESTION_JOB_TYPE, promptInfo.questionId);
      const isFailed = await existingJob?.isFailed();
      if (existingJob && !isFailed) {
        return { job: existingJob, questionId: promptInfo.questionId };
      }
    }

    // Create question record if not provided
    let questionId = params.questionId;
    if (!questionId) {
      questionId = crypto.randomUUID();
      await this.createQuestion({
        id: questionId,
        questionContent: params.userQuestion,
        title: 'Processing...',
        bigQuerySql: '',
        sqlHash: '',
      });
    }

    const job = await this.jobService.createJob(QUESTION_JOB_TYPE, questionId, {
      questionId,
      userQuestion: params.userQuestion
    }, undefined, true);

    await this.postgresService.createJobMetadata({
      questionId,
      bullJobId: job.id.toString(),
      status: 'pending'
    });

    // Cache for deduplication
    await this.cachePromptHash(promptHash, {
      jobId: job.id,
      questionId
    });

    return { job, questionId };
  }

  public async logQuestionRequest(questionId: string, opts?: { userId?: string; source?: string }): Promise<void> {
    await this.postgresService.createQuestionRequest({
      questionId,
      source: opts?.source,
    });
  }


  public async getSuggestedQuestions(): Promise<Question[]> {
    return this.postgresService.getSuggestedQuestions();
  }

  public async getUserQuestions(): Promise<Question[]> {
    return this.postgresService.getUserQuestions();
  }

  public async getQuestionById(questionId: string): Promise<Question | null> {
    return this.postgresService.getQuestionById(questionId);
  }

  public async createQuestion(params: { id: string; questionContent: string; title: string; bigQuerySql: string; sqlHash: string; }) {
    return this.postgresService.createQuestion(params);
  }

  public async getPromptHash(promptHash: string): Promise<any | null> {
    return this.redisService.getPromptHash(promptHash);
  }

  public async cachePromptHash(promptHash: string, data: any, expiryInSeconds?: number): Promise<void> {
    await this.redisService.cachePromptHash(promptHash, data, expiryInSeconds);
  }

  private async getSqlHashWithResult(sqlHash: string): Promise<Record<string, unknown> | null> {
    return this.redisService.getSqlHashWithResult(sqlHash);
  }

  private async cacheSqlHashWithResult(sqlHash: string, data: Record<string, unknown>, expiryInSeconds?: number): Promise<void> {
    await this.redisService.cacheSqlHashWithResult(sqlHash, data, expiryInSeconds);
  }

  /**
   * Set up SSE for a question, priming with current job state or 404 if missing.
   */
  public async subscribeToQuestionUpdates(questionId: string, reply: FastifyReply): Promise<void> {
    const job = await this.jobService.findExistingJob(QUESTION_JOB_TYPE, questionId);
    if (!job) {
      reply.status(404).send({ error: "Job not found" });
      return;
    }
    const jobState = this.buildJobState(job);
    this.sseService.setupConnection(job.data.customId, reply, jobState);
  }

  /** Build the current JobState from a Bull job object. */
  private buildJobState(job: Job): JobState {
    const status = this.jobService.getJobStatus(job);
    const baseState = {
      jobId: job.data.customId,
      status,
      error: job.failedReason || undefined,
      createdAt: job.data.createdAt,
    } as JobState;

    if (status === 'completed' && job.returnvalue?.result?.rows) {
      return {
        ...baseState,
        title: job.data.params?.title,
        questionContent: job.data.params?.userQuestion,
        result: {
          data: job.returnvalue.result?.rows,
          metadata: {
            totalRows: job.returnvalue.result?.rows.length,
            queryExecutionTime: job.returnvalue.job?.metadata?.statistics?.query?.totalBytesProcessed,
            sqlHash: job.data.params?.sqlHash
          }
        }
      };
    }

    return { ...baseState, title: job.data.params?.title };
  }

  /** Persist completion metadata and result; skip if deduplicated. */
  private async onJobCompleted(job: Job): Promise<void> {
    try {
      if (job.data.deduplicated) {
        this.logger.info(`Job ${job.id} was deduplicated, skipping completion update`);
        return;
      }

      await this.postgresService.completeJobWithResult(job.id.toString(), job.returnvalue);
    } catch (error) {
      this.logger.error(`Failed to complete job ${job.id}`, error);
    }
  }

  /** Persist failure status and reason for a job. */
  private async onJobFailed(job: Job): Promise<void> {
    try {
      await this.postgresService.updateJobMetadata(job.id.toString(), {
        status: 'failed',
        failedReason: job.failedReason,
      });
    } catch (error) {
      this.logger.error(`Failed to update job metadata for failed job ${job.id}`, error);
    }
  }
}
