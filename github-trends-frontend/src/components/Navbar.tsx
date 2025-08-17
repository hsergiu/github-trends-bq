import React from "react";
import { Github } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TimeRange } from "@/utils/types";

interface NavbarProps {
  onTimeRangeChange: (timeRange: TimeRange) => void;
  selectedTimeRange: TimeRange;
}

const Navbar: React.FC<NavbarProps> = ({
  onTimeRangeChange,
  selectedTimeRange,
}) => {
  return (
    <header className="sticky top-0 z-10 bg-background border-b border-border h-16 flex items-center px-4 md:px-6">
      <div className="container mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Github className="h-6 w-6 text-accent" />
          <h1 className="text-xl font-bold">GitHub Trends</h1>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden md:flex gap-1 border rounded-md p-0.5">
            <Button
              variant={
                selectedTimeRange === "current-week" ? "default" : "ghost"
              }
              size="sm"
              onClick={() => onTimeRangeChange("current-week")}
              className="text-xs h-8"
            >
              Current week
            </Button>
            <Button
              variant={selectedTimeRange === "last-week" ? "default" : "ghost"}
              size="sm"
              onClick={() => onTimeRangeChange("last-week")}
              className="text-xs h-8"
            >
              Last week
            </Button>
            <Button
              variant={selectedTimeRange === "last-month" ? "default" : "ghost"}
              size="sm"
              onClick={() => onTimeRangeChange("last-month")}
              className="text-xs h-8"
            >
              Last month
            </Button>
            <Button
              variant={
                selectedTimeRange === "last-3-months" ? "default" : "ghost"
              }
              size="sm"
              onClick={() => onTimeRangeChange("last-3-months")}
              className="text-xs h-8"
            >
              Last 3 months
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
