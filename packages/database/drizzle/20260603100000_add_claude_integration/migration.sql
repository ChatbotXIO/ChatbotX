CREATE TABLE IF NOT EXISTS "IntegrationClaude" (
  "id" bigint PRIMARY KEY NOT NULL,
  "createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" timestamp(3) DEFAULT now() NOT NULL,
  "auth" jsonb NOT NULL,
  "autoReply" boolean DEFAULT false NOT NULL,
  "workspaceId" bigint NOT NULL,
  "integrationId" bigint NOT NULL,
  "maxOutputTokens" integer NOT NULL,
  "model" text NOT NULL,
  "prompt" text,
  "temperature" double precision
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IntegrationClaude_workspaceId_Workspace_id_fk') THEN
    ALTER TABLE "IntegrationClaude"
      ADD CONSTRAINT "IntegrationClaude_workspaceId_Workspace_id_fk"
      FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IntegrationClaude_integrationId_Integration_id_fk') THEN
    ALTER TABLE "IntegrationClaude"
      ADD CONSTRAINT "IntegrationClaude_integrationId_Integration_id_fk"
      FOREIGN KEY ("integrationId") REFERENCES "public"."Integration"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "IntegrationClaude_workspaceId_key" ON "IntegrationClaude" USING btree ("workspaceId" ASC NULLS LAST);
CREATE UNIQUE INDEX IF NOT EXISTS "IntegrationClaude_integrationId_key" ON "IntegrationClaude" USING btree ("integrationId" ASC NULLS LAST);
