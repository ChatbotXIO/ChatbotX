import { sql } from "drizzle-orm"
import {
  foreignKey,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { integrationMessengerModel } from "./integration-messenger"

export const messengerMessageTemplateModel = pgTable(
  "MessengerMessageTemplate",
  {
    ...sharedColumns,
    name: text().notNull(),
    integrationMessengerId: bigintAsString()
      .notNull()
      .references(() => integrationMessengerModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    sourceId: text().notNull(),
    language: text().notNull(),
    category: text().notNull(),
    status: text().notNull(),
    parameterFormat: text().notNull().default("POSITIONAL"),
    components: jsonb().notNull().default(sql`'[]'::jsonb`),
    /** Meta's `rejection_reason` when `status` is REJECTED; null otherwise. */
    rejectionReason: text(),
    /**
     * The template this row was cloned from (cross-page clone). Written as a
     * reservation BEFORE the Meta create call, so the unique index below makes
     * a concurrent clone of the same template onto the same page fail at the
     * database instead of creating a duplicate on Meta.
     */
    clonedFromTemplateId: bigintAsString(),
  },
  (table) => [
    foreignKey({
      columns: [table.clonedFromTemplateId],
      foreignColumns: [table.id],
      name: "MessengerMessageTemplate_clonedFromTemplateId_fkey",
    })
      .onDelete("set null")
      .onUpdate("cascade"),
    uniqueIndex(
      "MessengerMessageTemplate_integrationMessengerId_sourceId_key",
    ).using(
      "btree",
      table.integrationMessengerId.asc().nullsLast(),
      table.sourceId.asc().nullsLast(),
    ),
    uniqueIndex("MessengerMessageTemplate_clone_key")
      .using(
        "btree",
        table.integrationMessengerId.asc().nullsLast(),
        table.clonedFromTemplateId.asc().nullsLast(),
      )
      .where(sql`"clonedFromTemplateId" IS NOT NULL`),
  ],
)
