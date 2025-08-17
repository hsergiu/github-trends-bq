import { useState, useRef, useEffect } from 'react';
import { QuestionsService } from '@/services/QuestionsService';
import { QueryResult } from '@/utils/types';

export const useQuestionUpdates = (onQuestionCompleted?: (questionId: string, title: string) => void) => {
  const [result, setResult] = useState<QueryResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sseCleanupRef = useRef<(() => void) | null>(null);

  const cleanupSSE = () => {
    if (sseCleanupRef.current) {
      sseCleanupRef.current();
      sseCleanupRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      cleanupSSE();
    };
  }, []);

  const fetchQuestionData = async (questionId: string) => {
    cleanupSSE();
    setIsLoading(true);
    setResult({ data: null });
    setError(null);

    try {
      const questionData = await QuestionsService.getQuestion(questionId);
      if (questionData.status === 'done' && questionData.result) {
        setResult({ data: questionData.result });
        setIsLoading(false);
      } else if (questionData.status === 'in_progress') {
        subscribeToUpdates(questionId);
      } else if (questionData.status === 'failed') {
        setError(questionData.error || 'Question processing failed');
        setIsLoading(false);
      } else {
        setIsLoading(true);
      }
    } catch (error) {
      console.error('Error fetching question data:', error);
      setError('Failed to fetch question data');
      setIsLoading(false);
      setResult({ data: null });
    }
  };


  const subscribeToUpdates = (questionId: string) => {
    cleanupSSE();
    setIsLoading(true);
    setResult({ data: null });
    setError(null);

    const cleanup = QuestionsService.subscribeToQuestionUpdates(
      questionId,
      (data) => {
        if (data.status === 'completed' && data.result) {
          setIsLoading(false);
          setResult({ data: data.result });
          if (data.title && onQuestionCompleted) {
            onQuestionCompleted(questionId, data.title);
          }
          cleanupSSE();
        } else if (data.status === 'failed') {
          setIsLoading(false);
          console.error('Job failed:', data.error);
          setError(data.error || 'Question processing failed');
          setResult({ data: null });
          cleanupSSE();
        }
      },
      (error) => {
        setIsLoading(false);
        console.error('SSE error:', error);
        setError('Connection error occurred');
        setResult({ data: null });
        cleanupSSE();
      }
    );

    sseCleanupRef.current = cleanup;
  };

  const clearResult = () => {
    setResult(null);
    setError(null);
    cleanupSSE();
  };

  return {
    result,
    isLoading,
    error,
    fetchQuestionData,
    subscribeToUpdates,
    clearResult,
  };
};