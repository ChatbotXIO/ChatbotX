import { boolean, pgTable, text } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { integrationWhatsappModel } from "./integration-whatsapp"

export const whatsappFlowModel = pgTable("WhatsappFlow", {
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
  isCompleted: boolean().notNull(),
})
