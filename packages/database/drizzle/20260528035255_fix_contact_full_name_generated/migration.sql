ALTER TABLE "Contact" DROP COLUMN "fullName";--> statement-breakpoint
ALTER TABLE "Contact" ADD COLUMN "fullName" text GENERATED ALWAYS AS (CASE
      WHEN "firstName" IS NULL AND "lastName" IS NULL THEN NULL
      WHEN "firstName" IS NULL THEN "lastName"
      WHEN "lastName" IS NULL THEN "firstName"
      ELSE "firstName" || ' ' || "lastName"
    END) STORED;--> statement-breakpoint
-- ALTER TABLE "CustomDomain" ADD CONSTRAINT IF NOT EXISTS "CustomDomain_userId_User_id_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
