-- Paridade Respond.io Camada 2 (gap #15 — 2026-05-27): Closing Notes.
-- 2 tabelas novas + 1 coluna no Workspace.

-- 1) Workspace ganha closingNotesMode (default disabled = comportamento atual).
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "closingNotesMode" text DEFAULT 'disabled' NOT NULL;--> statement-breakpoint

-- 2) Tabela ConversationCategory — admin CRUD em /settings/closing-notes.
CREATE TABLE IF NOT EXISTS "ConversationCategory" (
  "id" bigint PRIMARY KEY NOT NULL,
  "createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "position" integer DEFAULT 0 NOT NULL,
  "workspaceId" bigint NOT NULL,
  CONSTRAINT "ConversationCategory_workspaceId_Workspace_id_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
    ON UPDATE CASCADE ON DELETE CASCADE
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "ConversationCategory_workspaceId_name_key"
  ON "ConversationCategory" USING btree ("workspaceId", "name");--> statement-breakpoint

-- 3) Tabela ConversationClosingNote — 1-1 com Conversation (unique).
CREATE TABLE IF NOT EXISTS "ConversationClosingNote" (
  "id" bigint PRIMARY KEY NOT NULL,
  "createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
  "conversationId" bigint NOT NULL,
  "categoryId" bigint,
  "summary" text,
  "closedByUserId" bigint,
  "workspaceId" bigint NOT NULL,
  CONSTRAINT "ConversationClosingNote_conversationId_Conversation_id_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id")
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "ConversationClosingNote_categoryId_ConversationCategory_id_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "ConversationCategory"("id")
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "ConversationClosingNote_closedByUserId_User_id_fkey"
    FOREIGN KEY ("closedByUserId") REFERENCES "User"("id")
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "ConversationClosingNote_workspaceId_Workspace_id_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
    ON UPDATE CASCADE ON DELETE CASCADE
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "ConversationClosingNote_conversationId_key"
  ON "ConversationClosingNote" USING btree ("conversationId");
