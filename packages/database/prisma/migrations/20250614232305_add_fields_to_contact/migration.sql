-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "emailOptIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "enableBroadcast" BOOLEAN NOT NULL DEFAULT false;
