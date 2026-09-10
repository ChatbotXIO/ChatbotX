import { index, jsonb, pgTable, primaryKey } from "drizzle-orm/pg-core"
import { bigintAsString } from "../partials/shared"
import { broadcastModel } from "./broadcast"
import { flowModel } from "./flow"
import { inboxModel } from "./inbox"

/**
 * One row per page (inbox) a broadcast sends from. A template broadcast
 * stores the template chosen for that page together with its own params, so
 * every recipient is delivered with the template that belongs to their inbox.
 * A flow broadcast keeps `templateId` / `templateData` null and only uses the
 * row to scope the audience. Legacy single-page broadcasts have no rows here
 * and keep using the `Broadcast.integration*Id` / `templateId` columns.
 */
export const broadcastTargetModel = pgTable(
  "BroadcastTarget",
  {
    broadcastId: bigintAsString()
      .notNull()
      .references(() => broadcastModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    inboxId: bigintAsString()
      .notNull()
      .references(() => inboxModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /**
     * The flow this page sends (a flow's template start step is bound to one
     * page, so a multi-page flow broadcast picks a flow per page). `set null`
     * on delete: the page stays, and its recipients fail with a reason instead
     * of silently being dropped.
     */
    flowId: bigintAsString().references(() => flowModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    templateId: bigintAsString(),
    /** Same shape as `Broadcast.templateData`: template params plus `buttons`. */
    templateData: jsonb(),
  },
  (table) => [
    primaryKey({
      columns: [table.broadcastId, table.inboxId],
      name: "BroadcastTarget_pkey",
    }),
    index("BroadcastTarget_inboxId_idx").using(
      "btree",
      table.inboxId.asc().nullsLast(),
    ),
    index("BroadcastTarget_flowId_idx").using(
      "btree",
      table.flowId.asc().nullsLast(),
    ),
  ],
)
