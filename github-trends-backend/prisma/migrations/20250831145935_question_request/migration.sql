-- CreateTable
CREATE TABLE "question_requests" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "source" VARCHAR,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "question_requests_questionId_createdAt_idx" ON "question_requests"("questionId", "createdAt");

-- AddForeignKey
ALTER TABLE "question_requests" ADD CONSTRAINT "question_requests_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
