import { FastifyReply, FastifyBaseLogger } from "fastify";

/** Timeout for connection close after job completion/failure - 1 second */
const CONNECTION_CLOSE_TIMEOUT = 1000;

export interface JobState {
  jobId: string;
  status: string;
  title?: string;
  result?: unknown;
  error?: string;
  createdAt?: string;
}

export class SSEService {
  private static instance: SSEService | null = null;
  private activeConnections: Map<string, FastifyReply> = new Map();
  private logger!: FastifyBaseLogger;

  public static getInstance(): SSEService {
    if (!SSEService.instance) {
      SSEService.instance = new SSEService();
    }
    return SSEService.instance;
  }

  public initializeService(logger: FastifyBaseLogger): void {
    this.logger = logger;
  }

  /**
   * Set up an SSE connection for a job.
   * @param customJobId The job ID.
   * @param reply The Fastify reply to send the event.
   * @param jobState The initial job state.
   */
  public setupConnection(
    customJobId: string,
    reply: FastifyReply,
    jobState: JobState,
  ): void {
    try {
      this.setupSSEHeaders(reply);
      this.activeConnections.set(customJobId, reply);
      this.logger.info(
        `SSE connection established for job ${customJobId}`,
      );
      this.writeEventAndMaybeClose(customJobId, reply, jobState);
    } catch (error) {
      this.logger.error(
        `Error setting up SSE connection for job ${customJobId}: ${error}`,
      );
      throw error;
    }
  }

  /**
   * Set up the SSE headers for a reply.
   * @param reply The Fastify reply to set up.
   */
  private setupSSEHeaders(reply: FastifyReply): void {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
  }

  /**
   * Write an event to the SSE connection and close it if the job is complete.
   * @param customJobId The job ID.
   * @param reply The Fastify reply to send the event.
   * @param jobState The job state.
   */
  private writeEventAndMaybeClose(customJobId: string, reply: FastifyReply, jobState: JobState): void {
    const event = `data: ${JSON.stringify(jobState)}\n\n`;
    reply.raw.write(event);

    if (jobState.status === "completed" || jobState.status === "failed") {
      setTimeout(() => {
        this.closeConnection(customJobId);
      }, CONNECTION_CLOSE_TIMEOUT);
    }
  }

  /**
   * Send an update to the SSE connection.
   * @param customJobId The job ID.
   * @param jobState The job state.
   */
  public sendUpdate(customJobId: string, jobState: JobState): void {
    const connection = this.activeConnections.get(customJobId);
    if (!connection) return;

    try {
      this.writeEventAndMaybeClose(customJobId, connection, jobState);
    } catch (error) {
      this.logger.error(
        `Error sending SSE update for job ${customJobId}: ${error}`,
      );
      this.closeConnection(customJobId);
    }
  }

  public closeConnection(customJobId: string): void {
    const connection = this.activeConnections.get(customJobId);
    if (connection) {
      try {
        connection.raw.end();
        this.activeConnections.delete(customJobId);
        this.logger.info(`Closed SSE connection for job ${customJobId}`);
      } catch (error) {
        this.logger.error(
          `Error closing SSE connection for job ${customJobId}: ${error}`,
        );
      }
    }
  }
}
