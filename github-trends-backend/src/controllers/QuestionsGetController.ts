import { FastifyRequest, FastifyReply, FastifyBaseLogger } from "fastify";
import { QuestionsService } from "../services/QuestionsService";

export class QuestionsGetController {
  private questionsService: QuestionsService;

  constructor(logger: FastifyBaseLogger) {
    this.questionsService = new QuestionsService(logger);
  }

  public async getQuestion(
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    try {
      const { questionId } = request.params as {
        questionId: string;
      };
      
      const questionData = await this.questionsService.getQuestionById(questionId);
      
      if (!questionData) {
        return reply.status(404).send({
          error: "Question not found"
        });
      }

      const latestJob = questionData.jobMetadata[0];
      const questionResult = questionData.result;

      let status: "done" | "in_progress" = "done";
      let result = null;

      if (latestJob) {
        if (latestJob.status === "completed" && questionResult) {
          status = "done";
          result = questionResult.result;
        } else if (latestJob.status === "pending" || latestJob.status === "active") {
          status = "in_progress";
        }
      }

      return {
        id: questionData.id,
        title: questionData.title,
        status,
        result
      };
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({
        error: "Failed to get question",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  }
}