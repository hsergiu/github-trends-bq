# GitHub Trends — Monorepo Documentation

This repository contains both the frontend (React + Vite + Tailwind) and the backend (Fastify + TypeScript) for the GitHub Trends Analyzer.

## Overview
- `github-trends-frontend/`: React app that lets users enter natural language questions and view charts/results
- `github-trends-backend/`: API that converts natural language to BigQuery SQL, executes jobs, and streams updates

## Quick Start

### Prerequisites
- Node.js 18+ and npm
- PostgreSQL 14+ running locally
- Redis running locally (default port 6379)
- Google Cloud project with BigQuery access (to run real queries)
- OpenAI API key

### 1) Install dependencies
```bash
# from repo root
cd github-trends-frontend && npm install
cd ../github-trends-backend && npm install
```

### 2) Configure environment
Create `.env` in `github-trends-backend/` from `.env.example`:

Notes:
- If `GOOGLE_APPLICATION_CREDENTIALS` is set, it should point to a valid GCP service account JSON with BigQuery permissions.
- If `DATABASE_URL` is omitted, the app will use a local default.

### 3) Initialize backend database
```bash
cd github-trends-backend
npm run db:setup  # runs migrations and generates Prisma client
```

### 4) Run the stack
- Start Redis: `redis-server` (or via Docker/Homebrew/etc.)
- Start backend (in one terminal):
```bash
cd github-trends-backend
npm run dev
```
Backend is available at `http://localhost:3000` with API under `/api`.

- Start frontend (in another terminal):
```bash
cd github-trends-frontend
npm run dev
```
Frontend is available at the Vite dev server URL (typically `http://localhost:8080`). It calls the backend at `http://localhost:3000/api`.

## Backend Details

### Key Tech
- Fastify, TypeScript
- Bull + Redis for background jobs and SSE updates
- Prisma + Postgres for persistence
- OpenAI for LLM planning and chart config suggestions
- BigQuery gateway with dry-run size checks (default 3 GB limit)

### API Endpoints (prefixed with `/api`)
- `GET /api/questions`
  - Returns `{ suggestedQuestions, userQuestions }`
- `POST /api/questions`
  - Body: `{ "userPrompt": string }`
  - Returns: `{ questionId, jobId }`
- `GET /api/questions/:questionId`
  - Returns: `{ id, title, status: "in_progress"|"done", result }`
- `GET /api/questions/:questionId/updates` (SSE)
  - Streams job status updates

### LLM + Query Planning
- OpenAI models: `gpt-4o-2024-08-06` (planning), `gpt-4o-mini` (title)
- JSON Schema-constrained responses
- GitHub Archive schema context (base + type schemas + examples)
- SQL built from structured plan with guardrails (no `*`, limited operators)

### BigQuery Plan (effective shape)
```typescript
{
  ctes?: Array<{ name: string, query: QueryPlan }>,
  main_query: QueryPlan
}

interface QueryPlan {
  table: string,
  columns: string[],            // cannot include '*'
  filters?: (Filter | FilterGroup)[],
  groupBy?: string[],
  orderBy?: Array<{ column: string; direction?: 'ASC' | 'DESC' }>,
  limit?: number                // default 20, max 50
}
```

## Frontend Details

### Key Tech
- React 18, Vite, TypeScript
- TailwindCSS + Radix UI components
- React Query/SWR hooks for data fetching
- Recharts for visualizations

### Scripts
From `github-trends-frontend/`:
- `npm run dev` — Start Vite dev server
- `npm run build` — Build production assets
- `npm run preview` — Preview built app

### Backend Base URL
- The frontend uses `http://localhost:3000/api` in `src/services/QuestionsService.ts`.
- If you change backend host/port, update that file or use a simple environment-driven config.

## Testing

### Backend
- Unit tests: `cd github-trends-backend && npm run test:unit`
- Integration tests (require .env, Postgres, and Redis):
```bash
cd github-trends-backend
npm run test:integration
```

### Frontend
- Lint: `cd github-trends-frontend && npm run lint`

## Troubleshooting
- Missing OpenAI key: ensure `OPENAI_API_KEY` is present in backend `.env`.
- BigQuery failures: set `GOOGLE_CLOUD_PROJECT` and `GOOGLE_APPLICATION_CREDENTIALS` or configure ADC.
- Database errors: ensure Postgres is running and `DATABASE_URL` is correct; re-run `npm run db:setup`.
- CORS/dev issues: backend enables CORS. Ensure frontend calls `http://localhost:3000/api`. 