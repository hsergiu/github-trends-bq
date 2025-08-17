export interface QuestionJobResult {
  result: any,
  chartConfig: any,
}

export interface CreateQuestionJobParams {
  questionId: string;
  userQuestion: string;
  title: string;
  bigQuerySql: string;
  sqlHash: string;
  structuredQueryPlanSchema: any;
}
