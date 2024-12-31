-- CreateEnum
CREATE TYPE "LogType" AS ENUM ('Error', 'Audit');

-- CreateEnum
CREATE TYPE "ExecutorType" AS ENUM ('User', 'Contact');

-- CreateTable
CREATE TABLE "Log" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chatbotId" TEXT NOT NULL,
    "logType" "LogType" NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "url" TEXT,
    "executorType" "ExecutorType",
    "executorId" TEXT,

    CONSTRAINT "Log_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Log" ADD CONSTRAINT "Log_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
