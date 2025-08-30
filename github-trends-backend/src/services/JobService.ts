import { FastifyBaseLogger } from "fastify";
import Queue, { Job, JobOptions, JobStatus } from "bull";
import { EventEmitter } from "events";
import { toSafeFailedReason } from "./ErrorUtils";

export class JobService extends EventEmitter {
  private logger: FastifyBaseLogger;
  private queues: Map<string, Queue.Queue> = new Map();

  constructor(logger: FastifyBaseLogger) {
    super();
    this.logger = logger;
  }

  /** Initialize or reuse a Bull queue for a job type.
   * @param jobType Queue name.
   * @returns Queue instance.
   */
  public initQueue(jobType: string): Queue.Queue {
    if (this.queues.has(jobType)) {
      return this.queues.get(jobType)!;
    }

    const queueOptions: Queue.QueueOptions = {
      redis: {
        host: process.env.REDIS_HOST || "localhost",
        port: parseInt(process.env.REDIS_PORT || "6379"),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.NODE_ENV === 'test' ? "1" : "0"),
      },
      defaultJobOptions: {
        removeOnComplete: false,
        removeOnFail: false,
      },
    };

    const queue = new Queue(jobType, queueOptions);

    queue.on("error", (error) => {
      this.logger.error(`Queue ${jobType} error: ${error}`);
    });

    queue.on("failed", (job, error) => {
      const safeFailedReason = toSafeFailedReason(error);
      this.logger.error(`Job ${job.id} in queue ${jobType} failed: ${error.message}\n${error.stack}`);
      job.failedReason = safeFailedReason;
      this.emit("job:failed", { queue: jobType, job });
    });

    queue.on("completed", (job, result) => {
      this.logger.info(`Job ${job.id} in queue ${jobType} completed`);
      this.emit("job:completed", { queue: jobType, job, result });
    });

    this.queues.set(jobType, queue);
    return queue;
  }

  /** Register an async processor for a job type.
   * @param jobType Queue name.
   * @param processor Async function to process jobs.
   * @param concurrency Number of parallel processors.
   */
  public registerProcessor(
    jobType: string,
    processor: (job: Job) => Promise<any>,
    concurrency: number = 1,
  ): void {
    const queue = this.initQueue(jobType);
    queue.process(concurrency, processor);
    this.logger.info(
      `Registered processor for job type ${jobType} with concurrency ${concurrency}`,
    );
  }

  /* Generate a consistent job ID for a set of parameters */
  private generateCustomId(
    jobType: string,
    jobKey: string,
  ): string {
    return `${jobType}:${jobKey}`;
  }

  /** Search all states for a job with a matching customId.
   */
  public async findExistingJob(
    jobType: string,
    jobKey: string,
  ): Promise<Job | null> {
    const customId = this.generateCustomId(jobType, jobKey);
    const queue = this.initQueue(jobType);

    const states: JobStatus[] = [
      "active",
      "waiting",
      "completed",
      "failed",
      "delayed",
    ];

    for (const state of states) {
      const jobs = await queue.getJobs([state]);
      const job = jobs.find((j) => j.data.customId === customId);
      if (job) return job;
    }

    return null;
  }

  /** Enqueue a job with a deterministic customId; optionally skip existing check. */
  public async createJob(
    jobType: string,
    jobKey: string,
    params: Record<string, any>,
    options?: JobOptions,
    skipExistingCheck: boolean = false,
  ): Promise<Job> {
    const customId = this.generateCustomId(jobType, jobKey);
    const queue = this.initQueue(jobType);

    if (!skipExistingCheck) {
      const existingJob = await this.findExistingJob(jobType, jobKey);
      if (existingJob) {
        this.logger.info(
          `Job ${customId} already exists with Bull ID ${existingJob.id}`,
        );
        return existingJob;
      }
    }

    const jobData = {
      customId,
      params,
      createdAt: new Date().toISOString(),
    };

    const job = await queue.add(jobData, options);
    this.logger.info(`Created job ${customId} with Bull ID ${job.id}`);

    return job;
  }

  /** Map Bull job timestamps to a coarse status string. */
  public getJobStatus(
    job: Job,
  ): "pending" | "processing" | "completed" | "failed" {
    if (job.finishedOn) {
      return job.failedReason ? "failed" : "completed";
    } else if (job.processedOn) {
      return "processing";
    } else {
      return "pending";
    }
  }

  /** Clean completed/failed jobs across all queues (test helper).
   * @returns Total number of removed jobs.
   */
  public async testCleanup(): Promise<number> {
    let totalRemoved = 0;

    for (const [jobType, queue] of this.queues.entries()) {
      try {
        const completedCount = await queue.clean(0, "completed");
        const failedCount = await queue.clean(0, "failed");

        totalRemoved += completedCount.length + failedCount.length;

        this.logger.info(
          `Cleaned ${completedCount.length} completed and ${failedCount.length} failed jobs from queue ${jobType}`,
        );
        await queue.close();
      } catch (error) {
        this.logger.error(
          `Error cleaning jobs from queue ${jobType}: ${error}`,
        );
      }
    }

    return totalRemoved;
  }
}
