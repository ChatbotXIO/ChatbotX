-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- Create enum type for AIEmbeddingStatus
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'AIEmbeddingStatus' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."AIEmbeddingStatus" AS ENUM ('pending','success','error');
  END IF;
END $$;

-- CreateTable
CREATE TABLE "public"."AIEmbedding" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector,
    "status" "public"."AIEmbeddingStatus" NOT NULL DEFAULT 'pending',
    "chatbotId" TEXT NOT NULL,
    "aiFileId" TEXT NOT NULL,

    CONSTRAINT "AIEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AIEmbedding_chatbotId_idx" ON "public"."AIEmbedding"("chatbotId");

-- AddForeignKey
ALTER TABLE "public"."AIEmbedding" ADD CONSTRAINT "AIEmbedding_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "public"."Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AIEmbedding" ADD CONSTRAINT "AIEmbedding_aiFileId_fkey" FOREIGN KEY ("aiFileId") REFERENCES "public"."AIFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
