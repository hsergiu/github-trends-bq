import { useState, useMemo } from 'react';
import { QuestionsService } from '@/services/QuestionsService';

const NEW_QUESTION_ID = "new-question";
const MAX_TITLE_LENGTH = 25;


const truncateTitle = (title: string) => 
  title.length > MAX_TITLE_LENGTH ? `${title.substring(0, MAX_TITLE_LENGTH)}...` : title;

export const useQuestions = (userQuestions: any[] | undefined) => {
  const [localUserQuestions, setLocalUserQuestions] = useState([]);

  // Only include backend questions that don't exist locally
  const allUserQuestions = useMemo(() => {
    const localIds = new Set(localUserQuestions.map(q => q.id));
    const filteredUserQuestions = (userQuestions || []).filter(q => !localIds.has(q.id));
    return [...localUserQuestions, ...filteredUserQuestions];
  }, [localUserQuestions, userQuestions]);

  const handleNewQuestion = () => {
    const newQuery = {
      id: NEW_QUESTION_ID,
      title: "New Question"
    };
    
    // Don't add to sidebar - only return for UI state
    return newQuery;
  };

  const createQuestion = async (questionText: string) => {
    try {
      const { questionId } = await QuestionsService.createQuestion(questionText);

      return { id: questionId };
    } catch (error) {
      console.error("Failed to create question:", error);
      throw error;
    }
  };

  const updateQuestionTitle = (questionId: string, newTitle: string, questionContent: string) => {
    // Add new question to sidebar when job finishes with title
    const newQuestion = {
      id: questionId,
      title: truncateTitle(newTitle),
      questionContent,
    };
    
    setLocalUserQuestions(prev => [newQuestion, ...prev]);
  };

  return {
    allUserQuestions,
    handleNewQuestion,
    createQuestion,
    updateQuestionTitle,
  };
};