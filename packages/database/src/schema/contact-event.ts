import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { bigintAsString } from "../partials/shared"
import { contactModel } from "./contact"
import { workspaceModel } from "./workspace"

/**
 * Audit log de mudanças do contato.
 * Atualmente registra mudanças de lifecycleStageId via trigger SQL.
 */
export const contactEventModel = pgTable(
  "ContactEvent",
  {
    id: bigintAsString().primaryKey(),
    createdAt: timestamp({ precision: 3, mode: "date" }).defaultNow().notNull(),
    contactId: bigintAsString()
      .notNull()
      .references(() => contactModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    eventType: text().notNull(),
    meta: jsonb().$type<Record<string, unknown> | null>(),
    actorUserId: bigintAsString(),
  },
  (table) => [
    index("ContactEvent_contactId_createdAt_idx").using(
      "btree",
      table.contactId.asc().nullsLast(),
      table.createdAt.desc().nullsLast(),
    ),
    index("ContactEvent_workspaceId_createdAt_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.createdAt.desc().nullsLast(),
    ),
  ],
)
