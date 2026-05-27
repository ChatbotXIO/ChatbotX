import { jsonb, pgTable, text } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { workspaceModel } from "./workspace"

// Paridade Respond.io (gap #12 — 2026-05-27):
// Cada arquivo anexo armazena name+url+size+type pra render no popover
// do composer e ao enviar junto da mensagem.
export type SavedReplyFile = {
  name: string
  url: string
  size: number
  mimeType: string
}

export const savedReplyModel = pgTable("SavedReply", {
  ...sharedColumns,
  // Nome descritivo (paridade Respond.io). Diferente do shortcut — fica
  // visível na tabela de gestão pra usuário identificar o snippet sem
  // precisar decifrar o comando curto.
  name: text(),
  shortcut: text().notNull(),
  text: text().notNull(),
  // Tags pra organizar (Respond.io: máx 10 por snippet). Filtro no popover
  // do composer e tabela. Armazena array simples de strings.
  topics: jsonb().$type<string[]>().default([]).notNull(),
  // Anexos (Respond.io: máx 5 por snippet). Cada arquivo expande junto da
  // mensagem ao usar o snippet no composer.
  files: jsonb().$type<SavedReplyFile[]>().default([]).notNull(),
  workspaceId: bigintAsString()
    .notNull()
    .references(() => workspaceModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
})
