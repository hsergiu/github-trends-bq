-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "userQuestion" TEXT NOT NULL,
    "title" VARCHAR NOT NULL,
    "bigQuerySql" TEXT NOT NULL,
    "sqlHash" TEXT NOT NULL,
    "structuredQueryPlanSchema" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_metadata" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "bullJobId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "failedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_results" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "questions_sqlHash_key" ON "questions"("sqlHash");

-- CreateIndex
CREATE UNIQUE INDEX "job_metadata_bullJobId_key" ON "job_metadata"("bullJobId");

-- CreateIndex
CREATE UNIQUE INDEX "question_results_questionId_key" ON "question_results"("questionId");

-- AddForeignKey
ALTER TABLE "job_metadata" ADD CONSTRAINT "job_metadata_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_results" ADD CONSTRAINT "question_results_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
