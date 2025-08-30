/*
  Warnings:

  - Made the column `created_at` on table `query_examples` required. This step will fail if there are existing NULL values in that column.
  - Made the column `updated_at` on table `query_examples` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "query_examples_embedding_idx";

-- AlterTable
ALTER TABLE "query_examples" ALTER COLUMN "tags" DROP DEFAULT,
ALTER COLUMN "created_at" SET NOT NULL,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" SET NOT NULL,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);
