import {
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { integrationWhatsappModel } from "./integration-whatsapp"
import { miniAppModel } from "./mini-app"
import { whatsappFlowModel } from "./whatsapp-flow"

/** A Mini App published as a WhatsApp Flow on one WhatsApp number. */
export const miniAppPublicationModel = pgTable(
  "MiniAppPublication",
  {
    ...sharedColumns,
    miniAppId: bigintAsString()
      .notNull()
      .references(() => miniAppModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    integrationWhatsappId: bigintAsString()
      .notNull()
      .references(() => integrationWhatsappModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    // The synced `WhatsappFlow` row; nulled if a later sync drops it.
    whatsappFlowId: bigintAsString().references(() => whatsappFlowModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    // Meta's flow id.
    sourceId: text().notNull(),
    status: text().notNull(),
    validationErrors: jsonb().notNull(),
    publishedAt: timestamp(timestampConfig),
  },
  (table) => [
    uniqueIndex("MiniAppPublication_miniAppId_integrationWhatsappId_key").using(
      "btree",
      table.miniAppId.asc().nullsLast(),
      table.integrationWhatsappId.asc().nullsLast(),
    ),
  ],
)
