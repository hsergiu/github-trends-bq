import React from "react";
import { useLocation, Link } from "react-router-dom";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound: React.FC = () => {
  const location = useLocation();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-gray-300">
      <div className="text-center max-w-md mx-auto p-8">
        <h1 className="text-6xl font-bold text-gray-100">404</h1>
        <h2 className="text-2xl font-bold mt-4 text-gray-200">
          Page Not Found
        </h2>
        <p className="text-gray-400 mt-2 mb-6">
          We couldn't find the page you were looking for:{" "}
          <span className="font-mono text-gray-500">{location.pathname}</span>
        </p>
        <Button asChild>
          <Link
            to="/"
            className="flex items-center gap-2 px-4 py-2 rounded bg-gray-700 text-gray-200 hover:bg-gray-600 transition"
          >
            <Home className="h-4 w-4" />
            Return to Home
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
