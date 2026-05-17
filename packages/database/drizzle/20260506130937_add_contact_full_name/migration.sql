ALTER TABLE "Contact" ADD COLUMN "fullName" text GENERATED ALWAYS AS ("firstName" || ' ' || "lastName") STORED;
