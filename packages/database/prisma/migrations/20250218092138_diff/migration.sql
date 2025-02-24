/*
  Warnings:

  - Made the column `file` on table `Attachment` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Attachment" ALTER COLUMN "file" SET NOT NULL;
