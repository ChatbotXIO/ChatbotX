import { index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { contactModel } from "./contact"
import { facebookLeadAdsAutomationModel } from "./facebook-lead-ads-automation"

export const facebookLeadAdsLeadModel = pgTable(
  "FacebookLeadAdsLead",
  {
    ...sharedColumns,
    automationId: bigintAsString()
      .notNull()
      .references(() => facebookLeadAdsAutomationModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    leadgenId: text().notNull(),
    contactId: bigintAsString().references(() => contactModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
  },
  (table) => [
    // Natural dedup key: Facebook re-delivers leadgen webhooks, so the worker
    // claims each (automation, lead) once via onConflictDoNothing.
    uniqueIndex("FacebookLeadAdsLead_automationId_leadgenId_key").using(
      "btree",
      table.automationId.asc().nullsLast(),
      table.leadgenId.asc().nullsLast(),
    ),
    index("FacebookLeadAdsLead_leadgenId_idx").on(table.leadgenId),
  ],
)
