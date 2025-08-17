import React, { useState, useEffect } from "react";
import { QueryDefinition } from "@/utils/types";
import { UpArrow, DownArrow } from "@/components/svgs/arrows";

interface SidebarProps {
  predefinedQueries: QueryDefinition[];
  userQueries?: QueryDefinition[];
  activeId: string;
  onSelect: (q: QueryDefinition) => void;
}

const MAX_CHARS_QUESTION = 25;

const truncateTitle = (title: string) => 
  title.length > MAX_CHARS_QUESTION ? `${title.substring(0, MAX_CHARS_QUESTION)}...` : title;

interface QuestionButtonProps {
  query: QueryDefinition;
  isActive: boolean;
  onClick: () => void;
}

const QuestionButton: React.FC<QuestionButtonProps> = ({ query, isActive, onClick }) => (
  <button
    className={`w-full text-left px-4 py-2 rounded-md hover:bg-gray-700 ${
      isActive ? "bg-gray-700" : ""
    }`}
    onClick={onClick}
    title={query.title}
  >
    <span className="truncate block">
      {truncateTitle(query.title)}
    </span>
  </button>
);

const Sidebar: React.FC<SidebarProps> = ({
  predefinedQueries,
  userQueries,
  activeId,
  onSelect,
}) => {
  const [expandedSuggested, setExpandedSuggested] = useState(true);
  const [expandedUser, setExpandedUser] = useState(true);

  useEffect(() => {
    if (userQueries && userQueries.length > 0) {
      setExpandedUser(true);
    }
  }, [userQueries]);

  return (
    <aside className="w-64 border-r border-gray-700 bg-gray-800 text-gray-300 h-full overflow-y-auto">
      <div
        className="p-4 pb-3 font-bold flex items-center justify-between cursor-pointer select-none"
        onClick={() => setExpandedSuggested((v) => !v)}
        aria-expanded={expandedSuggested}
      >
        <span>Suggested Questions</span>
        <span>{expandedSuggested ? <UpArrow /> : <DownArrow />}</span>
      </div>
      {expandedSuggested && (
        <ul className="space-y-0">
          {predefinedQueries.map((q) => (
            <li key={q.id}>
              <QuestionButton
                query={q}
                isActive={q.id === activeId}
                onClick={() => onSelect(q)}
              />
            </li>
          ))}
        </ul>
      )}

      <div
        className="p-4 pb-3 font-bold border-t border-gray-700 flex items-center justify-between cursor-pointer select-none"
        onClick={() => setExpandedUser((v) => !v)}
        aria-expanded={expandedUser}
      >
        <span>Your Questions</span>
        <span>{expandedUser ? <UpArrow /> : <DownArrow />}</span>
      </div>
      {expandedUser && (
        <ul className="space-y-0">
          {userQueries?.map((q) => (
            <li key={q.id}>
              <QuestionButton
                query={q}
                isActive={q.id === activeId}
                onClick={() => onSelect(q)}
              />
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
};

export default Sidebar;
