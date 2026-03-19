DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'SavedReply'
      AND column_name = 'message'
  ) THEN
    ALTER TABLE "SavedReply" RENAME COLUMN "message" TO "text";
  END IF;
END $$;
