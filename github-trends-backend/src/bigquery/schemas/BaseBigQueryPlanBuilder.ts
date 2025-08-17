const QUERY_LIMIT_CONSTANTS = {
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 50,
} as const;

export interface Filter {
  column: string;
  op: string;
  value: any;
}

export interface FilterGroup {
  logic: 'AND' | 'OR';
  filters: Array<Filter | FilterGroup>;
}

export interface QueryPlan {
  table: string;
  columns: string[];
  filters?: Array<Filter | FilterGroup>;
  limit?: number;
  groupBy?: string[];
  orderBy?: Array<{ column: string; direction?: 'ASC' | 'DESC' }>;
}

export interface CTEPlan {
  name: string;
  query: QueryPlan;
}

export interface RootQueryPlan {
  ctes?: CTEPlan[];
  main_query: QueryPlan;
}

export abstract class BaseBigQueryPlanBuilder {
  protected abstract get allowedOperators(): string[];
  abstract get bigQueryPlanSchema(): any;

  buildQuery(root: RootQueryPlan): string {
    const cteNames = (root.ctes || []).map(cte => cte.name);
    const ctes = root.ctes?.length
      ? `WITH ${root.ctes.map(cte => `${cte.name} AS (${this.buildSingleQuery(cte.query, cteNames, true)})`).join(", ")}`
      : '';
    const main = this.buildSingleQuery(root.main_query, cteNames);
    return ctes ? `${ctes}\n${main}` : main;
  }

  buildSingleQuery(plan: QueryPlan, _cteNames: string[] = [], hasOptionalLimit = false): string {
    if (!plan.columns.length || plan.columns.includes("*")) throw new Error("Invalid columns");

    const select = plan.columns.join(", ");
    const where = plan.filters?.length ? this.buildFilterClause(plan.filters) : "1=1";
    const groupBy = plan.groupBy?.length ? ` GROUP BY ${plan.groupBy.join(", ")}` : '';
    const orderBy = plan.orderBy?.length ? ` ORDER BY ${plan.orderBy.map(o => `${o.column}${o.direction ? ` ${o.direction}` : ''}`).join(", ")}` : '';

    if (hasOptionalLimit) {
      const limitQuery = plan.limit && plan.limit > 0 ? ` LIMIT ${Math.min(plan.limit, QUERY_LIMIT_CONSTANTS.MAX_LIMIT)}` : '';
      return `SELECT ${select} FROM ${plan.table} WHERE ${where}${groupBy}${orderBy}${limitQuery}`;
    }

    const limit = Math.min(plan.limit || QUERY_LIMIT_CONSTANTS.DEFAULT_LIMIT, QUERY_LIMIT_CONSTANTS.MAX_LIMIT);
    return `SELECT ${select} FROM ${plan.table} WHERE ${where}${groupBy}${orderBy} LIMIT ${limit}`;
  }

  private buildFilterClause(filters: Array<Filter | FilterGroup>): string {
    const buildClause = (item: Filter | FilterGroup): string => {
      if ('logic' in item) return `(${item.filters.map(buildClause).join(` ${item.logic} `)})`;
      if (!this.allowedOperators.includes(item.op)) throw new Error(`Operator not allowed: ${item.op}`);
      if (item.op === 'BETWEEN') {
        if (!Array.isArray(item.value) || item.value.length !== 2) throw new Error("BETWEEN operator requires an array value of length 2");
        const [l, r] = item.value;
        return `${item.column} BETWEEN ${this.formatExpressionValue(l)} AND ${this.formatExpressionValue(r)}`;
      }
      if (item.op === "IN" && !Array.isArray(item.value)) throw new Error("IN operator requires array value");
      return `${item.column} ${item.op} ${this.formatValue(item.value)}`;
    };
    return filters.map(buildClause).join(" AND ");
  }

  private isVariableReference(value: any): value is { var: string } {
    return value && typeof value === 'object' && typeof value.var === 'string';
  }

  private formatExpressionValue(value: any): string {
    return this.isVariableReference(value) ? value.var : this.formatValue(value);
  }

  private formatValue(value: any): string {
    if (this.isVariableReference(value)) return value.var;
    if (typeof value === "string") return `'${value.replace(/'/g, "''")}'`;
    if (Array.isArray(value)) {
      const formatted = value.map(v => this.isVariableReference(v) ? v.var : typeof v === "string" ? `'${v.replace(/'/g, "''")}'` : v);
      return `(${formatted.join(", ")})`;
    }
    return value;
  }
}