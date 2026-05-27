-- Unmerge support (#17 — 2026-05-27).
-- Adiciona 3 colunas em Contact pra soft-delete de fusão + 1 index pra
-- lookups "contatos fundidos em X" (UI banner no primary).

ALTER TABLE "Contact"
  ADD COLUMN "mergedIntoId" bigint REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD COLUMN "mergedAt" timestamp with time zone,
  ADD COLUMN "mergedByUserId" bigint REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
--> statement-breakpoint
CREATE INDEX "Contact_mergedIntoId_idx" ON "Contact" ("mergedIntoId");
