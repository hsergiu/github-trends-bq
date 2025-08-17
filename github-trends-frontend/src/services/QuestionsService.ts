import { QuestionObjectDefinition } from "@/utils/types";

export class QuestionsService {
  private static BASE_URL = "http://localhost:3000/api";

  public static async getQuestions(): Promise<QuestionObjectDefinition> {
    try {
      const response = await fetch(`${this.BASE_URL}/questions`);

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error fetching questions:", error);
      throw error;
    }
  }

  public static async createQuestion(userPrompt: string): Promise<{ jobId: string; questionId: string }> {
    try {
      const response = await fetch(`${this.BASE_URL}/questions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userPrompt }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error("Error creating question:", error);
      throw error;
    }
  }

  public static async getQuestion(questionId: string): Promise<{ id: string; title: string; status: string; result: any; error: string; failedReason: string }> {
    try {
      const response = await fetch(`${this.BASE_URL}/questions/${questionId}`);

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error fetching question:", error);
      throw error;
    }
  }

  public static subscribeToQuestionUpdates(
    questionId: string,
    onUpdate: (data: any) => void,
    onError: (error: Error) => void
  ): () => void {
    const eventSource = new EventSource(`${this.BASE_URL}/questions/${questionId}/updates`);

    let receivedTerminalUpdate = false;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onUpdate(data);

        if (data.status === 'completed' || data.status === 'failed') {
          receivedTerminalUpdate = true;
          // Close to avoid onerror when server ends the stream
          eventSource.close();
        }
      } catch (error) {
        onError(new Error(`Failed to parse SSE data: ${error}`));
      }
    };

    eventSource.onerror = () => {
      // Ignore errors caused by normal server-side close after terminal update
      if (receivedTerminalUpdate || eventSource.readyState === EventSource.CLOSED) {
        return;
      }
      onError(new Error("SSE connection error"));
    };

    return () => {
      eventSource.close();
    };
  }
}
