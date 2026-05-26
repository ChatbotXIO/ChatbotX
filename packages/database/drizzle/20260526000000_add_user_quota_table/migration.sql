-- Create UserQuota table for per-user plan limits and usage tracking.
-- Limits are written by the enterprise billing layer on plan purchase.
-- Usage counters are incremented by OSS action handlers.
CREATE TABLE IF NOT EXISTS "UserQuota" (
  "id" bigint PRIMARY KEY,
  "createdAt" timestamptz(6) NOT NULL DEFAULT now(),
  "updatedAt" timestamptz(6) NOT NULL DEFAULT now(),
  "userId" bigint NOT NULL UNIQUE,
  "contactsLimit" integer,
  "contactsUsed" integer NOT NULL DEFAULT 0,
  "workspacesLimit" integer,
  "workspacesUsed" integer NOT NULL DEFAULT 0,
  "channelsLimit" integer,
  "channelsUsed" integer NOT NULL DEFAULT 0,
  "teamMembersLimit" integer,
  "teamMembersUsed" integer NOT NULL DEFAULT 0,
  "whiteLabel" boolean NOT NULL DEFAULT false,
  "ssoSaml" boolean NOT NULL DEFAULT false,
  "saasMode" boolean NOT NULL DEFAULT false,
  "periodStart" timestamptz(6),
  "periodEnd" timestamptz(6),
  "syncedAt" timestamptz(6) NOT NULL DEFAULT now()
);--> statement-breakpoint
ALTER TABLE "UserQuota"
  ADD CONSTRAINT "UserQuota_userId_User_id_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
