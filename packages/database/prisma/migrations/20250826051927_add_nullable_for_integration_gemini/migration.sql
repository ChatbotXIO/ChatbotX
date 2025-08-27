-- AlterTable
ALTER TABLE "public"."IntegrationGemini" ALTER COLUMN "auth" DROP NOT NULL;

-- Insert IntegrationGemini records for existing chatbots that don't have them
INSERT INTO "public"."IntegrationGemini" ("id", "createdAt", "updatedAt", "auth", "aiAutoReply", "chatbotId")
SELECT 
  gen_random_uuid()::text,
  NOW(),
  NOW(),
  NULL,
  false,
  c.id
FROM "public"."Chatbot" c
LEFT JOIN "public"."IntegrationGemini" ig ON c.id = ig."chatbotId"
WHERE ig.id IS NULL;


