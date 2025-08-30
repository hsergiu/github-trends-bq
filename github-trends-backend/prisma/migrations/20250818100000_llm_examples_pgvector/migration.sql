-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create query_examples table
CREATE TABLE IF NOT EXISTS query_examples (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  sql_snippet TEXT NOT NULL,
  chart_hint TEXT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  embedding VECTOR(1536) NOT NULL,
  embedding_model TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create IVF Flat index for cosine similarity
CREATE INDEX IF NOT EXISTS query_examples_embedding_idx
ON query_examples USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100); 