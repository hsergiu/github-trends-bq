# GitHub Trends — Monorepo

This repo contains the frontend (React + Vite) and backend (Fastify + TypeScript) for the GitHub Trends Analyzer.

## Prerequisites
- Node.js 18+ and npm
- PostgreSQL running locally
- Redis running locally
- OpenAI API key (and a GCP BigQuery project if you want to run github archive queries)

## 1) Install dependencies
```bash
# from the repo root
cd github-trends-frontend && npm install
cd ../github-trends-backend && npm install
```

## 2) Configure environment
In `github-trends-backend/`, start from `.env.example` and create your `.env`.
```bash
# from the repo root
cp github-trends-backend/.env.example github-trends-backend/.env
# then open github-trends-backend/.env and fill in values
```

## 3) Initialize the database (backend)
```bash
cd github-trends-backend
npm run db:setup   # runs migrations and generates Prisma client
```

## 4) Run the apps
- Ensure Redis is running (e.g., `redis-server`)
- Start the backend:
```bash
cd github-trends-backend
npm run dev
```
- Start the frontend in a separate terminal:
```bash
cd github-trends-frontend
npm run dev
```

## Tests
- Backend unit tests: `cd github-trends-backend && npm run test:unit`
- Backend integration tests: `cd github-trends-backend && npm run test:integration` (requires a working `.env`, Postgres, and Redis)

## Troubleshooting
- Missing keys/credentials: ensure you created `.env` from `.env.example` in `github-trends-backend/`.
- Postgres/Redis issues: verify services are running and connection settings in `.env` are correct.
- CORS or dev URL mismatches: backend runs on `http://localhost:3000`, frontend on Vite port (e.g., `8080`). Update frontend service base URL if needed. 