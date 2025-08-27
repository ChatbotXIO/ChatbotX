/*
  Warnings:

  - You are about to drop the column `messagePrompts` on the `AIAgent` table. All the data in the column will be lost.
  - You are about to drop the column `systemPrompt` on the `AIAgent` table. All the data in the column will be lost.

*/
-- AlterTable

ALTER TABLE "public"."AIAgent"
RENAME COLUMN "systemPrompt" TO "prompt";


ALTER TABLE "public"."AIAgent"
RENAME COLUMN "messagePrompts" TO "messages";
