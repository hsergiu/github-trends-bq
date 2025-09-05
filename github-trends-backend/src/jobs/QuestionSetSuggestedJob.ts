import { CronJob } from 'cron';
import { FastifyBaseLogger } from 'fastify';
import PostgresService from '../postgres/PostgresService';

const CRON_SCHEDULE = '0 */5 * * * *'; // every 5 minutes
const POPULARITY_THRESHOLD = 5; // minimum requests
const WINDOW_HOURS = 24; // lookback window

export class QuestionSetSuggestedJob {
  private logger: FastifyBaseLogger;
  private postgresService: PostgresService;
  private job: CronJob;

  constructor(logger: FastifyBaseLogger, postgresService?: PostgresService) {
    this.logger = logger;
    this.postgresService = postgresService || PostgresService.getInstance(logger);

    this.job = new CronJob(
      CRON_SCHEDULE,
      async () => {
        try {
          const promoted = await this.postgresService.promotePopularQuestions({
            threshold: POPULARITY_THRESHOLD,
            windowHours: WINDOW_HOURS,
          });
          if (promoted > 0) {
            this.logger.info(`[QuestionSetSuggestedJob] Promoted ${promoted} questions to suggested`);
          }
        } catch (error) {
          this.logger.error(`[QuestionSetSuggestedJob] Error promoting questions`, error);
        }
      },
      null,
      false,
      'UTC'
    );
  }

  public start(): void {
    if (!this.job.running) {
      this.job.start();
      this.logger.info(`[QuestionSetSuggestedJob] Started with schedule ${CRON_SCHEDULE}, threshold=${POPULARITY_THRESHOLD}, windowHours=${WINDOW_HOURS}`);
    }
  }
}

export default QuestionSetSuggestedJob;
