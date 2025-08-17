import React from "react";
import * as Recharts from "recharts";
import colors from "tailwindcss/colors";

interface ChartEncoding {
  x?: { field: string };
  y?: Array<{ field: string }>;
  category?: { field: string };
  value?: { field: string };
  series?: { field: string };
}

interface ChartConfig {
  chartType?: string;
  encoding?: ChartEncoding;
}

const AXIS_COLOR = colors.gray[300];
const GRID_COLOR = colors.gray[700];
const LEGEND_COLOR = colors.gray[200];
const TOOLTIP_BG = colors.gray[900];
const TOOLTIP_BORDER = colors.gray[700];
const TOOLTIP_TEXT = colors.gray[200];

const SERIES_PRIMARY = colors.blue[400];
const SERIES_LINE = SERIES_PRIMARY;

const PIE_COLORS = [
  colors.blue[400],
  colors.amber[500],
  colors.emerald[400],
  colors.pink[400],
  colors.violet[400],
  colors.red[400],
  colors.cyan[400],
  colors.amber[400],
  colors.green[400],
  colors.purple[400],
];

/** BarChart using encoding directly */
export const BarChart: React.FC<{ rows: any[]; chartConfig?: ChartConfig }> = ({ rows, chartConfig }) => {
  const enc = chartConfig?.encoding || {};
  const xField = enc.x?.field || "category";
  const yField = enc.y?.[0]?.field || "count";
  return (
    <Recharts.ResponsiveContainer width="100%" height={300}>
      <Recharts.BarChart data={rows} margin={{ top: 16, right: 16, left: 16, bottom: 16 }}>
        <Recharts.CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
        <Recharts.XAxis dataKey={xField} tick={{ fill: AXIS_COLOR }} axisLine={{ stroke: AXIS_COLOR }} tickLine={{ stroke: AXIS_COLOR }} />
        <Recharts.YAxis tick={{ fill: AXIS_COLOR }} axisLine={{ stroke: AXIS_COLOR }} tickLine={{ stroke: AXIS_COLOR }} />
        <Recharts.Tooltip contentStyle={{ backgroundColor: TOOLTIP_BG, borderColor: TOOLTIP_BORDER, color: TOOLTIP_TEXT }} itemStyle={{ color: TOOLTIP_TEXT }} labelStyle={{ color: TOOLTIP_TEXT }} />
        <Recharts.Legend wrapperStyle={{ color: LEGEND_COLOR }} />
        <Recharts.Bar dataKey={yField} fill={SERIES_PRIMARY} />
      </Recharts.BarChart>
    </Recharts.ResponsiveContainer>
  );
};

/** LineChart using encoding directly */
export const LineChart: React.FC<{ rows: any[]; chartConfig?: ChartConfig }> = ({ rows, chartConfig }) => {
  const enc = chartConfig?.encoding || {};
  const xField = enc.x?.field || "date";
  const yField = enc.y?.[0]?.field || "value";
  return (
    <Recharts.ResponsiveContainer width="100%" height={300}>
      <Recharts.LineChart data={rows} margin={{ top: 16, right: 16, left: 16, bottom: 16 }}>
        <Recharts.CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
        <Recharts.XAxis dataKey={xField} tick={{ fill: AXIS_COLOR }} axisLine={{ stroke: AXIS_COLOR }} tickLine={{ stroke: AXIS_COLOR }} />
        <Recharts.YAxis tick={{ fill: AXIS_COLOR }} axisLine={{ stroke: AXIS_COLOR }} tickLine={{ stroke: AXIS_COLOR }} />
        <Recharts.Tooltip contentStyle={{ backgroundColor: TOOLTIP_BG, borderColor: TOOLTIP_BORDER, color: TOOLTIP_TEXT }} itemStyle={{ color: TOOLTIP_TEXT }} labelStyle={{ color: TOOLTIP_TEXT }} />
        <Recharts.Legend wrapperStyle={{ color: LEGEND_COLOR }} />
        <Recharts.Line type="monotone" dataKey={yField} stroke={SERIES_LINE} strokeWidth={2} dot={{ r: 2, fill: SERIES_LINE }} activeDot={{ r: 4 }} />
      </Recharts.LineChart>
    </Recharts.ResponsiveContainer>
  );
};

/** PieChart using encoding directly */
export const PieChart: React.FC<{ rows: any[]; chartConfig?: ChartConfig }> = ({ rows, chartConfig }) => {
  const enc = chartConfig?.encoding || {};
  const nameKey = enc.category?.field || "category";
  const valueKey = enc.value?.field || "value";
  return (
    <Recharts.ResponsiveContainer width="100%" height={300}>
      <Recharts.PieChart>
        <Recharts.Pie
          data={rows}
          dataKey={valueKey}
          nameKey={nameKey}
          outerRadius={100}
          label
        >
          {Array.isArray(rows) && rows.map((_, index) => (
            <Recharts.Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
          ))}
        </Recharts.Pie>
        <Recharts.Tooltip contentStyle={{ backgroundColor: TOOLTIP_BG, borderColor: TOOLTIP_BORDER, color: TOOLTIP_TEXT }} itemStyle={{ color: TOOLTIP_TEXT }} labelStyle={{ color: TOOLTIP_TEXT }} />
        <Recharts.Legend wrapperStyle={{ color: LEGEND_COLOR }} />
      </Recharts.PieChart>
    </Recharts.ResponsiveContainer>
  );
};
