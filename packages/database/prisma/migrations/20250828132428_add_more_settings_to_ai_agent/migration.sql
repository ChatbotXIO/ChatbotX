/*
  Warnings:

  - You are about to drop the `_AIAgentToAIFile` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_AIAgentToAIFunction` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_AIAgentToAIMCPServer` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `maxTokens` to the `AIAgent` table without a default value. This is not possible if the table is not empty.
  - Added the required column `temperature` to the `AIAgent` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."_AIAgentToAIFile" DROP CONSTRAINT "_AIAgentToAIFile_A_fkey";

-- DropForeignKey
ALTER TABLE "public"."_AIAgentToAIFile" DROP CONSTRAINT "_AIAgentToAIFile_B_fkey";

-- DropForeignKey
ALTER TABLE "public"."_AIAgentToAIFunction" DROP CONSTRAINT "_AIAgentToAIFunction_A_fkey";

-- DropForeignKey
ALTER TABLE "public"."_AIAgentToAIFunction" DROP CONSTRAINT "_AIAgentToAIFunction_B_fkey";

-- DropForeignKey
ALTER TABLE "public"."_AIAgentToAIMCPServer" DROP CONSTRAINT "_AIAgentToAIMCPServer_A_fkey";

-- DropForeignKey
ALTER TABLE "public"."_AIAgentToAIMCPServer" DROP CONSTRAINT "_AIAgentToAIMCPServer_B_fkey";

-- AlterTable
ALTER TABLE "public"."AIAgent" ADD COLUMN     "maxTokens" INTEGER NOT NULL,
ADD COLUMN     "models" JSONB[],
ADD COLUMN     "temperature" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "tools" TEXT[];

-- DropTable
DROP TABLE "public"."_AIAgentToAIFile";

-- DropTable
DROP TABLE "public"."_AIAgentToAIFunction";

-- DropTable
DROP TABLE "public"."_AIAgentToAIMCPServer";
