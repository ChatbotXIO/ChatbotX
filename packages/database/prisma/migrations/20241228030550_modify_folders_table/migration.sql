/*
  Warnings:

  - Added the required column `syncToMessenger` to the `Tag` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Folder" ADD COLUMN     "paths" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Tag" ADD COLUMN     "syncToMessenger" BOOLEAN NOT NULL;
