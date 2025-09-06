import React from "react";
import { QueryResult } from "@/utils/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, LineChart, PieChart } from "@/components/ui/charts";

interface Props {
  result: QueryResult;
}

const ResultsRenderer: React.FC<Props> = ({ result }) => {
  const chartConfig = result?.data?.chartConfig;
  const rows = result?.data?.rows;

  if (Array.isArray(rows) && rows.length === 0) {
    return (
      <div className="text-gray-400 text-center mt-4">No data found</div>
    );
  }

  // Helper function to render table
  const renderTable = (data: any[]) => (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {data && data.length > 0 && Object.keys(data[0]).map((key) => (
              <TableHead key={key}>{key}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data?.map((row, index) => (
            <TableRow key={index}>
              {Object.values(row).map((value: any, cellIndex) => (
                <TableCell key={cellIndex}>{String(value)}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  // 1) If backend returns `chartType` in metadata, trust it:
  if (chartConfig?.chartType === "bar") {
    return <BarChart rows={rows} chartConfig={chartConfig} />;
  }
  if (chartConfig?.chartType === "line") {
    return <LineChart rows={rows} chartConfig={chartConfig} />;
  }
  if (chartConfig?.chartType === "pie") {
    return <PieChart rows={rows} chartConfig={chartConfig} />;
  }
  if (chartConfig?.chartType === "table") {
    return renderTable(rows);
  }

  // 2) Otherwise, inspect the shape:
  if (Array.isArray(rows)) {
    // if items are objects with `date` & `value` → line
    if (rows[0] && "date" in rows[0] && "value" in rows[0]) {
      return <LineChart rows={rows} />;
    }
    // if items are objects with `category` & `count` → bar
    if (
      rows[0] &&
      "category" in rows[0] &&
      "count" in rows[0]
    ) {
      return <BarChart rows={rows} />;
    }
    
    // fallback: table for any other data shape
    return renderTable(rows);
  }

  // fallback for primitives
  return <pre>{JSON.stringify(rows, null, 2)}</pre>;
};

export default ResultsRenderer;
