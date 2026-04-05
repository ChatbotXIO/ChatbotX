import { sql } from "drizzle-orm"
import { jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { integrationWhatsappModel } from "./integration-whatsapp"

export const whatsappMessageTemplateModel = pgTable(
  "WhatsappMessageTemplate",
  {
    ...sharedColumns,
    name: text().notNull(),
    integrationWhatsappId: bigintAsString()
      .notNull()
      .references(() => integrationWhatsappModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    sourceId: text().notNull(),
    language: text().notNull(),
    category: text().notNull(),
    status: text().notNull(),
    components: jsonb().notNull().default(sql`'[]'::jsonb`),
  },
  (table) => [
    uniqueIndex(
      "WhatsappMessageTemplate_integrationWhatsappId_sourceId_key",
    ).using(
      "btree",
      table.integrationWhatsappId.asc().nullsLast(),
      table.sourceId.asc().nullsLast(),
    ),
  ],
)
