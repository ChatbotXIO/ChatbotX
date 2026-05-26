import {
  boolean,
  index,
  pgTable,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { folderModel } from "./folder"
import { workspaceModel } from "./workspace"

// Cor padrão das etiquetas quando o usuário não escolhe — cinza neutro,
// pra combinar com o design dark do app sem destoar.
const DEFAULT_TAG_COLOR = "#6B7280"

export const tagModel = pgTable(
  "Tag",
  {
    ...sharedColumns,
    name: text().notNull(),
    // Hex 7 chars (#RRGGBB). Não permitimos cores transparentes/HSL pra
    // simplificar o renderer do chip (basta `style={{ backgroundColor }}`).
    color: varchar({ length: 7 }).notNull().default(DEFAULT_TAG_COLOR),
    // Opcional: emoji pequeno prefixando o chip (estilo ZENBOT/Respond.io).
    // Até 8 chars pra cobrir emojis ZWJ (👨‍👩‍👧‍👦 = 25 bytes mas 7 grafemas).
    emoji: varchar({ length: 8 }),
    // Descrição livre — ajuda quem nunca viu a tag entender pra que serve.
    description: text(),
    folderId: bigintAsString().references(() => folderModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    syncToMessenger: boolean().default(false).notNull(),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    uniqueIndex("Tag_workspaceId_name_key").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.name.asc().nullsLast(),
    ),
    index("Tag_folderId_idx").using("btree", table.folderId.asc().nullsLast()),
  ],
)
