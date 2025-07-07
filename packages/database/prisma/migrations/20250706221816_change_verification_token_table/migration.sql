/*
  Warnings:

  - The `accessTokenExpiresAt` column on the `Account` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "Account" DROP COLUMN "accessTokenExpiresAt",
ADD COLUMN     "accessTokenExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Verification" RENAME CONSTRAINT "VerificationToken_pkey" TO "Verification_pkey";
