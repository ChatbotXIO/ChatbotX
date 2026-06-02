ALTER TABLE "Reflink" ADD COLUMN "qrStyles" jsonb;
CREATE TYPE "ReflinkType" AS ENUM('refLink', 'qrCode');
ALTER TABLE "Reflink" ADD COLUMN "type" "ReflinkType";
UPDATE "Reflink" SET "type" = 'qrCode' WHERE "qrStyles" IS NOT NULL;
UPDATE "Reflink" SET "type" = 'refLink' WHERE "qrStyles" IS NULL;
ALTER TABLE "Reflink" ALTER COLUMN "type" SET NOT NULL;
ALTER TABLE "Reflink" ALTER COLUMN "type" SET DEFAULT 'refLink'::"ReflinkType";
