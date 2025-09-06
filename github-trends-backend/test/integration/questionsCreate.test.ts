import fastify, { FastifyInstance } from "fastify";
import { QuestionsCreateController } from "../../src/controllers/QuestionsCreateController";
import { QuestionsService } from "../../src/services/QuestionsService";
import RedisService from "../../src/redis/RedisService";
import PostgresService from "../../src/postgres/PostgresService";

describe("Questions Create Integration Tests - Root", () => {
  let redisService: RedisService;
  let postgresService: PostgresService;

  beforeAll(async () => {
    redisService = RedisService.getInstance();
    redisService.initializeService();
    
    postgresService = PostgresService.getInstance();
    await postgresService.initializeService();
  });

  beforeEach(async () => {
    // Clear database and Redis test data
    await postgresService.testCleanup();
    await redisService.flushAll();
    
    // Reset mock call counts
    jest.clearAllMocks();
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await redisService.testCleanup();
    await postgresService.testCleanup();
  });

  describe("Questions Create Integration Tests", () => {
    let app: FastifyInstance;
    let questionsService: QuestionsService;
    let questionsCreateController: QuestionsCreateController;
    let llmService: any;
    let bigQueryService: any;

    const executedQuery1 = 'SELECT * FROM `githubarchive.day.20190101`';

    beforeAll(async () => {
      llmService = {
        generateQueryPlanWithSchemaContext: jest.fn().mockResolvedValue({
          sql: executedQuery1,
          structuredQueryPlanSchema: { test: 'schema1' }
        })
      };
      bigQueryService = {
        executeQuery: jest.fn().mockResolvedValue({
          rows: [{ repo_name: "test-repo", star_score: 100, fork_score: 50, total_score: 150 }],
          job: { id: "test-job-id", metadata: {}, status: { state: "DONE" } }
        })
      };

      questionsService = new QuestionsService(
        console as any,
        undefined,
        redisService,
        undefined,
        bigQueryService,
        postgresService,
        llmService,
      );
      questionsService.initJobProcessor();

      questionsCreateController = new QuestionsCreateController(console as any, questionsService);

      app = fastify({ logger: true });
      app.post("/questions", async (request, reply) =>
        questionsCreateController.createQuestion(request, reply),
      );
      await app.ready();
    });

    afterAll(async () => {
      await (questionsService as any).jobService.testCleanup();
      await app.close();
    });

      test("should create a question job and return jobId and questionId", async () => {
      const userPrompt = "Show all trending repos";
      const response = await app.inject({
        method: "POST",
        url: "/questions",
        payload: { userPrompt },
      });
      expect(response.statusCode).toBe(202);
      const body = JSON.parse(response.body);

      expect(body).toHaveProperty("jobId");
      expect(body).toHaveProperty("questionId");
      expect(llmService.generateQueryPlanWithSchemaContext).toHaveBeenCalled();
      
      // Give the background job time to process
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(bigQueryService.executeQuery).toHaveBeenCalledWith(executedQuery1);
    });

    test("should find existent question job by user prompt", async () => {
      const userPrompt = "Show all trending repos";
      
      const response1 = await app.inject({
        method: "POST",
        url: "/questions",
        payload: { userPrompt },
      });
      expect(response1.statusCode).toBe(202);
      const body1 = JSON.parse(response1.body);

      const response2 = await app.inject({
        method: "POST",
        url: "/questions",
        payload: { userPrompt },
      });
      expect(response2.statusCode).toBe(202);
      const body2 = JSON.parse(response2.body);
      expect(body2).toHaveProperty("jobId");
      expect(body2).toHaveProperty("questionId");

      expect(body2.jobId).toBe(body1.jobId);
      expect(body2.questionId).toBe(body1.questionId);
      
      expect(llmService.generateQueryPlanWithSchemaContext).toHaveBeenCalled();
      
      // Give the background job time to process (only one job should execute since they're deduplicated)
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(bigQueryService.executeQuery).toHaveBeenCalledTimes(1);
    });

    test("should find existent question job by generated sql", async () => {
      const userPrompt1 = "Show all trending repos";
      const userPrompt2 = "Show every trending repo";
      
      const response1 = await app.inject({
        method: "POST",
        url: "/questions",
        payload: { userPrompt: userPrompt1 },
      });
      expect(response1.statusCode).toBe(202);
      const body1 = JSON.parse(response1.body);

      const response2 = await app.inject({
        method: "POST",
        url: "/questions",
        payload: { userPrompt: userPrompt2 },
      });
      expect(response2.statusCode).toBe(202);
      const body2 = JSON.parse(response2.body);
      expect(body2).toHaveProperty("jobId");
      expect(body2).toHaveProperty("questionId");

      // Different prompts create different jobs/questions initially
      expect(body2.jobId).not.toBe(body1.jobId);
      expect(body2.questionId).not.toBe(body1.questionId);
      
      expect(llmService.generateQueryPlanWithSchemaContext).toHaveBeenCalled();
      
      // Give the background job time to process 
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Both jobs process, but second one reuses cached BigQuery result
      expect(bigQueryService.executeQuery).toHaveBeenCalledWith(executedQuery1);
    });
  });

  describe("Questions Create Error Handling Tests", () => {
    async function createTestApp(llmService: any, bigQueryService: any, mockPostgresService?: any, mockRedisService?: any) {
      const questionsService = new QuestionsService(
        console as any,
        undefined,
        mockRedisService || redisService,
        undefined,
        bigQueryService,
        mockPostgresService || postgresService,
        llmService,
      );
      questionsService.initJobProcessor();

      const questionsCreateController = new QuestionsCreateController(console as any, questionsService);

      const app = fastify({ logger: true });
      app.post("/questions", async (request, reply) =>
        questionsCreateController.createQuestion(request, reply),
      );
      await app.ready();

      return { app, questionsService };
    }

    test("should handle LLM service errors and persist failed job metadata", async () => {
      const llmService = {
        generateQueryPlanWithSchemaContext: jest.fn().mockRejectedValue(new Error("LLM service unavailable"))
      };
      const bigQueryService = {
        executeQuery: jest.fn().mockResolvedValue({
          rows: [{ repo_name: "test-repo", star_score: 100 }],
          job: { id: "test-job-id", metadata: {}, status: { state: "DONE" } }
        })
      };

      const { app, questionsService } = await createTestApp(llmService, bigQueryService);

      const userPrompt = "Show all trending repos";
      const response = await app.inject({
        method: "POST",
        url: "/questions",
        payload: { userPrompt },
      });

      expect(response.statusCode).toBe(202);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("jobId");
      expect(body).toHaveProperty("questionId");

      // Wait for job to process and fail
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify question was created and persisted even though job failed
      const question = await postgresService.getQuestionById(body.questionId);
      expect(question!.questionContent).toBe(userPrompt);
      expect(question!.title).toBe('Processing...');
      expect(question!.bigQuerySql).toBe('');

      // Verify job metadata shows failure
      expect(question!.jobMetadata).toHaveLength(1);
      expect(question!.jobMetadata[0].status).toBe('failed');
      expect(question!.jobMetadata[0].failedReason).toContain('LLM service unavailable');

      // LLM should have been called, BigQuery should not
      expect(llmService.generateQueryPlanWithSchemaContext).toHaveBeenCalled();
      expect(bigQueryService.executeQuery).not.toHaveBeenCalled();

      await (questionsService as any).jobService.testCleanup();
      await app.close();
    });

    test("should handle BigQuery service errors and persist failed job metadata", async () => {
      const llmService = {
        generateQueryPlanWithSchemaContext: jest.fn().mockResolvedValue({
          sql: 'SELECT * FROM `githubarchive.day.20190101`',
          structuredQueryPlanSchema: { test: 'schema1' },
          title: 'Test Query'
        })
      };
      const bigQueryService = {
        executeQuery: jest.fn().mockRejectedValue(new Error("BigQuery quota exceeded"))
      };

      const { app, questionsService } = await createTestApp(llmService, bigQueryService);

      const userPrompt = "Show all trending repos";
      const response = await app.inject({
        method: "POST",
        url: "/questions",
        payload: { userPrompt },
      });

      expect(response.statusCode).toBe(202);
      const body = JSON.parse(response.body);

      // Wait for job to process and fail
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify question was updated with LLM results but job failed at BigQuery stage
      const question = await postgresService.getQuestionById(body.questionId);
      expect(question!.questionContent).toBe(userPrompt);
      expect(question!.title).toBe('Test Query');
      expect(question!.bigQuerySql).toBe('SELECT * FROM `githubarchive.day.20190101`');

      // Verify job metadata shows failure
      expect(question!.jobMetadata).toHaveLength(1);
      expect(question!.jobMetadata[0].status).toBe('failed');
      expect(question!.jobMetadata[0].failedReason).toContain('BigQuery quota exceeded');

      // No result should be created for failed BigQuery execution
      expect(question!.result).toBeNull();

      // Both services should have been called
      expect(llmService.generateQueryPlanWithSchemaContext).toHaveBeenCalled();
      expect(bigQueryService.executeQuery).toHaveBeenCalled();

      await (questionsService as any).jobService.testCleanup();
      await app.close();
    });

    test("should handle database connection errors gracefully", async () => {
      const llmService = {
        generateQueryPlanWithSchemaContext: jest.fn().mockResolvedValue({
          sql: 'SELECT * FROM `githubarchive.day.20190101`',
          structuredQueryPlanSchema: { test: 'schema1' },
          title: 'Test Query'
        })
      };
      const bigQueryService = {
        executeQuery: jest.fn().mockResolvedValue({
          rows: [{ repo_name: "test-repo", star_score: 100 }],
          job: { id: "test-job-id", metadata: {}, status: { state: "DONE" } }
        })
      };

      // Mock PostgresService to simulate database connection error
      const mockPostgresService = {
        ...postgresService,
        createQuestion: jest.fn().mockRejectedValue(new Error("Database connection lost")),
        initializeService: jest.fn(),
        testCleanup: postgresService.testCleanup.bind(postgresService),
        getQuestionById: postgresService.getQuestionById.bind(postgresService),
      };

      const { app, questionsService } = await createTestApp(llmService, bigQueryService, mockPostgresService);

      const userPrompt = "Show all trending repos";
      const response = await app.inject({
        method: "POST",
        url: "/questions",
        payload: { userPrompt },
      });

      // Should return error when database fails
      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Failed to create question");
      expect(body.details).toContain("Database connection lost");

      // Verify mock was called
      expect(mockPostgresService.createQuestion).toHaveBeenCalled();

      await (questionsService as any).jobService.testCleanup();
      await app.close();
    });

    test("should handle missing user prompt", async () => {
      const llmService = {
        generateQueryPlanWithSchemaContext: jest.fn()
      };
      const bigQueryService = {
        executeQuery: jest.fn()
      };

      const { app, questionsService } = await createTestApp(llmService, bigQueryService);

      const response = await app.inject({
        method: "POST",
        url: "/questions",
        payload: {}, // Missing userPrompt
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Failed to create question");
      expect(body.details).toContain("User prompt missing");

      // No services should be called
      expect(llmService.generateQueryPlanWithSchemaContext).not.toHaveBeenCalled();
      expect(bigQueryService.executeQuery).not.toHaveBeenCalled();

      await (questionsService as any).jobService.testCleanup();
      await app.close();
    });

    test("should handle Redis connection errors gracefully", async () => {
      const llmService = {
        generateQueryPlanWithSchemaContext: jest.fn().mockResolvedValue({
          sql: 'SELECT * FROM `githubarchive.day.20190101`',
          structuredQueryPlanSchema: { test: 'schema1' },
          title: 'Test Query'
        })
      };
      const bigQueryService = {
        executeQuery: jest.fn().mockResolvedValue({
          rows: [{ repo_name: "test-repo", star_score: 100 }],
          job: { id: "test-job-id", metadata: {}, status: { state: "DONE" } }
        })
      };

      // Mock RedisService to simulate connection error
      const mockRedisService = {
        ...redisService,
        getPromptHash: jest.fn().mockRejectedValue(new Error("Redis connection timeout")),
        cachePromptHash: jest.fn().mockRejectedValue(new Error("Redis connection timeout")),
        flushAll: redisService.flushAll.bind(redisService),
        testCleanup: redisService.testCleanup.bind(redisService),
        initializeService: redisService.initializeService.bind(redisService),
      };

      const { app, questionsService } = await createTestApp(llmService, bigQueryService, undefined, mockRedisService);

      const userPrompt = "Show all trending repos";
      const response = await app.inject({
        method: "POST",
        url: "/questions",
        payload: { userPrompt },
      });

      // Should return error when Redis fails
      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Failed to create question");
      expect(body.details).toContain("Redis connection timeout");

      await (questionsService as any).jobService.testCleanup();
      await app.close();
    });
  });
});