import { FastifyRequest, FastifyReply, FastifyBaseLogger } from "fastify";
import { QuestionsService } from "../services/QuestionsService";

export class QuestionsListController {
  private questionsService: QuestionsService;

  constructor(logger: FastifyBaseLogger) {
    this.questionsService = new QuestionsService(logger);
  }

  public async getQuestions(request: FastifyRequest, reply: FastifyReply) {
    try {
      const suggestedQuestions = await this.questionsService.getSuggestedQuestions();
      const userQuestions = await this.questionsService.getUserQuestions();
      return { suggestedQuestions, userQuestions };
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({
        error: "Failed to load questions",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
