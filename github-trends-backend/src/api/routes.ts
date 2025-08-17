import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { QuestionsService } from "../services/QuestionsService";
import { QuestionsListController } from "../controllers/QuestionsListController";
import { QuestionsCreateController } from "../controllers/QuestionsCreateController";
import { QuestionsSSEController } from "../controllers/QuestionsSSEController";
import { QuestionsGetController } from "../controllers/QuestionsGetController";

export const apiRoutes: FastifyPluginAsync = async (
  fastify: FastifyInstance,
) => {
  const questionsListController = new QuestionsListController(fastify.log);
  const questionsCreateController = new QuestionsCreateController(fastify.log);
  const questionsSSEController = new QuestionsSSEController(fastify.log);
  const questionsGetController = new QuestionsGetController(fastify.log);

  const questionsService = new QuestionsService(fastify.log);
  questionsService.initJobProcessor();

  fastify.get("/questions", async (request, reply) =>
    questionsListController.getQuestions(request, reply),
  );

  fastify.post("/questions", async (request, reply) =>
    questionsCreateController.createQuestion(request, reply),
  );

  fastify.get("/questions/:questionId", async (request, reply) =>
    questionsGetController.getQuestion(request, reply),
  );

  fastify.get("/questions/:questionId/updates", async (request, reply) =>
    questionsSSEController.subscribeQuestionUpdates(request, reply),
  );
};
