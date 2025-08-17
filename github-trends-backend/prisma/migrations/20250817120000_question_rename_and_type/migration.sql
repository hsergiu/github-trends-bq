-- Rename column userQuestion -> questionContent
ALTER TABLE "questions" RENAME COLUMN "userQuestion" TO "questionContent";

-- Add new column type with default 'user'
ALTER TABLE "questions" ADD COLUMN "type" VARCHAR NOT NULL DEFAULT 'user'; 