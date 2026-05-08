import { sql } from "drizzle-orm"
import { jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { integrationWhatsappModel } from "./integration-whatsapp"

export const whatsappFlowModel = pgTable(
  "WhatsappFlow",
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
    status: text().notNull(),
    categories: jsonb().notNull().default(sql`'[]'::jsonb`),
    validationErrors: jsonb().notNull().default(sql`'[]'::jsonb`),
    completedCount: bigintAsString().notNull().default("0"),
    screens: jsonb().notNull().default(sql`'[]'::jsonb`),
  },
  (table) => [
    uniqueIndex("WhatsappFlow_integrationWhatsappId_sourceId_key").using(
      "btree",
      table.integrationWhatsappId.asc().nullsLast(),
      table.sourceId.asc().nullsLast(),
    ),
  ],
)
