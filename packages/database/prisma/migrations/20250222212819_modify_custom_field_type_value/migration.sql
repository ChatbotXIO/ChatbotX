/*
  Warnings:

  - The values [SHORT_TEXT,LONG_TEXT] on the enum `CustomFieldType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "CustomFieldType_new" AS ENUM ('SHORTTEXT', 'NUMBER', 'DATE', 'DATETIME', 'BOOLEAN', 'LONGTEXT');
ALTER TABLE "Field" ALTER COLUMN "customFieldType" TYPE "CustomFieldType_new" USING ("customFieldType"::text::"CustomFieldType_new");
ALTER TYPE "CustomFieldType" RENAME TO "CustomFieldType_old";
ALTER TYPE "CustomFieldType_new" RENAME TO "CustomFieldType";
DROP TYPE "CustomFieldType_old";
COMMIT;
