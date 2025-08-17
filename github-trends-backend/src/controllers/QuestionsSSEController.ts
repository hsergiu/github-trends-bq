// src/controllers/QuestionsSSEController.ts
import { FastifyRequest, FastifyReply, FastifyBaseLogger } from "fastify";
import { SSEService } from "../services/SSEService";
import { QuestionsService } from "../services/QuestionsService";

export class QuestionsSSEController {
  private sseService: SSEService;
  private questionsService: QuestionsService;

  constructor(logger: FastifyBaseLogger) {
    this.sseService = SSEService.getInstance();
    this.questionsService = new QuestionsService(logger);
  }

  public async subscribeQuestionUpdates(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const { questionId } = request.params as { questionId: string };
    try {
      await this.questionsService.subscribeToQuestionUpdates(questionId, reply);
      
      request.raw.on("close", () => {
        this.sseService.closeConnection(questionId);
      });
    } catch (error) {
      reply.status(500).send({ error: "Failed to set up SSE for questions" });
    }
  }
}
