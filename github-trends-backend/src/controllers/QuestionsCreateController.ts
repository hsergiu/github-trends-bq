import { FastifyRequest, FastifyBaseLogger, FastifyReply } from "fastify";
import { QuestionsService } from "../services/QuestionsService";

export class QuestionsCreateController {
  private questionsService: QuestionsService;

  constructor(logger: FastifyBaseLogger, questionsService?: QuestionsService) {
    this.questionsService = questionsService || new QuestionsService(logger);
  }

  public async createQuestion(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { userPrompt } = request.body as {
        userPrompt: string;
      };

      if (!userPrompt) {
        return reply.status(400).send({ error: 'User prompt missing' });
      }

      const { job, questionId } = await this.questionsService.scheduleQuestionJob({
        userQuestion: userPrompt
      });

      return reply.status(202).send({
        questionId,
        jobId: job.id
      });

    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({
        error: "Failed to create question",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
