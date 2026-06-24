ALTER TABLE "MessageShard" ADD COLUMN IF NOT EXISTS "isMain" boolean DEFAULT false;
