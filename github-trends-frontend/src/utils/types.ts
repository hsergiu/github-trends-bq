export type TimeRange =
  // Time range values
  "current-week" | "last-week" | "last-month" | "last-3-months";

export interface QuestionObjectDefinition {
  suggestedQuestions: any[];
  userQuestions: any[];
}

export interface QueryResult {
  data: any;
}
