import React, { useState, useEffect } from "react";
import useSWR from "swr";
import { Github, Plus } from "lucide-react";
import { UpArrow, DownArrow } from "@/components/svgs/arrows";
import Sidebar from "@/components/Sidebar";
import ResultsRenderer from "@/components/ResultsRenderer";
import { QuestionObjectDefinition } from "@/utils/types";
import { QuestionsService } from "@/services/QuestionsService";
import { useQuestions } from "@/hooks/useQuestions";
import { useQuestionUpdates } from "@/hooks/useQuestionUpdates";

const dataSourceOptions = {
  "github-events": {
    name: "GitHub Events",
    description: "Curious about GitHub trends? Ask anything.",
    icon: <Github className="inline-block" />,
  },
};

const hasMultipleSources = Object.keys(dataSourceOptions).length > 1;
const NEW_QUESTION_ID = "new-question";

const AnimatedEllipsis: React.FC<{ intervalMs?: number }> = ({ intervalMs = 400 }) => {
  const [dots, setDots] = useState("");

  useEffect(() => {
    const id = setInterval(() => {
      setDots((prev) => (prev.length < 3 ? prev + "." : ""));
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return <span className="ml-1 inline-block w-6 text-gray-400">{dots || "\u00A0"}</span>;
};

const fetchQuestions = () => QuestionsService.getQuestions();

const DashboardPage: React.FC = () => {
  const { data: questionsObject, error } = useSWR<QuestionObjectDefinition>(
    "questions",
    fetchQuestions,
  );

  const { suggestedQuestions, userQuestions } = questionsObject || {};
  const [selectedDataSource, setSelectedDataSource] = useState<keyof typeof dataSourceOptions>(
    "github-events",
  );
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const [activeQuery, setActiveQuery] = useState<any | null>(null);
  const [questionText, setQuestionText] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { allUserQuestions, handleNewQuestion, createQuestion, updateQuestionTitle } = useQuestions(userQuestions);
  
  const handleQuestionCompleted = (questionId: string, title: string, questionContent: string) => {
    updateQuestionTitle(questionId, title, questionContent);
  };
  
  const { result, isLoading, error: queryError, fetchQuestionData, clearResult } = useQuestionUpdates(handleQuestionCompleted);
  
  useEffect(() => {
    if (queryError) {
      setErrorMessage(queryError);
    }
  }, [queryError]);

  useEffect(() => {
    if (allUserQuestions.length > 0) {
      const firstQuestion = allUserQuestions[0];
      setActiveQuery(firstQuestion);
      if (firstQuestion.id !== NEW_QUESTION_ID) {
        setQuestionText(firstQuestion.questionContent ?? "");
        fetchQuestionData(firstQuestion.id);
      }
    } else if (suggestedQuestions && suggestedQuestions.length > 0) {
      setActiveQuery(suggestedQuestions[0]);
      setQuestionText(suggestedQuestions[0].questionContent ?? "");
    }
  }, [allUserQuestions, suggestedQuestions]);

  const handleNewQuestionClick = () => {
    const newQuery = handleNewQuestion();
    setActiveQuery(newQuery);
    setQuestionText("");
    clearResult();
    setErrorMessage(null);
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    const trimmedQuestionText = (questionText ?? "").trim();
    if (e.key === "Enter" && trimmedQuestionText) {
      try {
        setErrorMessage(null);
        const newQuery = await createQuestion(trimmedQuestionText);
        setActiveQuery(newQuery);
        fetchQuestionData(newQuery.id);
      } catch (error) {
        setErrorMessage("Failed to create question. Please try again.");
      }
    }
  };

  const handleSideBarSelect = (query) => {
    setActiveQuery(query);
    setErrorMessage(null);
    setQuestionText(query.questionContent ?? "");
    if (query.id) {
      fetchQuestionData(query.id);
    }
  };

  const selectDataSource = (id: keyof typeof dataSourceOptions) => {
    setSelectedDataSource(id);
    setDropdownOpen(false);
  };

  const isNewQuestionDisabled = activeQuery?.id === NEW_QUESTION_ID && !errorMessage;
  const isInputDisabled = activeQuery?.id !== NEW_QUESTION_ID;
  
  if (error) {
    return (
      <div className="h-screen flex bg-gray-900 text-gray-300">
        <main className="flex-1 overflow-auto flex flex-col items-center px-4 relative">
          <div className="absolute top-2 left-4 rounded">
            <button className="flex items-center px-4 py-2 space-x-2 text-gray-200 focus:outline-none">
              {dataSourceOptions[selectedDataSource]?.icon}
              <span>
                {dataSourceOptions[selectedDataSource]?.name}
              </span>
            </button>
          </div>

          <div className="text-center max-w-md mx-auto p-8">
            <h2 className="text-2xl font-bold mt-4 text-gray-200">
              Unable to Load Questions
            </h2>
            <p className="text-red-400 mt-2 mb-6">
              Failed to load suggested questions. Please try refreshing the page.
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (!suggestedQuestions) {
    return (
      <div className="p-8 text-gray-400">Loading suggested questions...</div>
    );
  }

  return (
    <div className="h-screen flex bg-gray-900 text-gray-300">
      <Sidebar
        predefinedQueries={suggestedQuestions}
        userQueries={allUserQuestions}
        onSelect={handleSideBarSelect}
        activeId={activeQuery?.id || ""}
      />
      <main className="flex-1 overflow-auto flex flex-col items-center px-4 relative">
        <div className="absolute top-2 left-4 rounded">
          <button
            className="flex items-center px-4 py-2 space-x-2 text-gray-200 focus:outline-none"
            onClick={hasMultipleSources ? () => setDropdownOpen(!dropdownOpen) : undefined}
            aria-haspopup={hasMultipleSources ? "true" : undefined}
            aria-expanded={hasMultipleSources ? dropdownOpen : undefined}
          >
            {dataSourceOptions[selectedDataSource]?.icon}
            <span>
              {dataSourceOptions[selectedDataSource]?.name}
            </span>
            {hasMultipleSources && (
              <span className="ml-2 select-none">
                {dropdownOpen ? <UpArrow /> : <DownArrow />}
              </span>
            )}
          </button>
          {dropdownOpen && hasMultipleSources && (
            <div className="flex flex-col px-2">
              {Object.entries(dataSourceOptions).map(([id, { name, icon }]) => (
                <label
                  key={id}
                  className="inline-flex items-center cursor-pointer select-none text-gray-200 px-2 py-2 rounded hover:bg-gray-700"
                >
                  <input
                    type="radio"
                    name="data-source"
                    className="hidden"
                    checked={selectedDataSource === id}
                    onChange={() => selectDataSource(id as keyof typeof dataSourceOptions)}
                  />
                  <div className="flex items-center space-x-2">
                    {icon}
                    <span>{name}</span>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="absolute top-2 right-4">
          <button
            onClick={!isNewQuestionDisabled ? handleNewQuestionClick : undefined}
            disabled={isNewQuestionDisabled}
            className={`flex items-center px-4 py-2 space-x-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              isNewQuestionDisabled
                ? "bg-gray-600 text-gray-400" 
                : "bg-gray-600 hover:bg-gray-700 text-white"
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>New Question</span>
          </button>
        </div>

        <div className="mt-10 mb-6 text-xl font-semibold text-gray-200">
          {dataSourceOptions[selectedDataSource]?.description}
        </div>
        <input
          type="text"
          placeholder="Enter your question"
          value={questionText ?? ""}
          onChange={(e) => setQuestionText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isInputDisabled}
          className="w-1/2 p-3 mb-8 rounded-lg border border-gray-700 bg-gray-800 text-gray-200 shadow-sm placeholder-gray-500 focus:outline-none focus:ring-2 transition disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed"
        />
        {errorMessage && (
          <div className="text-red-400 text-center mb-4">
            {errorMessage}
          </div>
        )}
        {isLoading && (
          <div className="text-gray-400 text-center">
            Processing your query<AnimatedEllipsis />
          </div>
        )}
        {result && result.data && <ResultsRenderer result={result} />}
      </main>
    </div>
  );
};

export default DashboardPage;
