import { sql } from "drizzle-orm"
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
    // Form and ad attribution of the lead. `formId`/`adgroupId` come from the
    // leadgen webhook; `formName` from the automation, or the page's form list
    // for an all-forms automation. Null on leads that predate these columns.
    formId: text(),
    formName: text(),
    adgroupId: text(),
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
    index("FacebookLeadAdsLead_contactId_idx")
      .on(table.contactId)
      .where(sql`${table.contactId} IS NOT NULL`),
    // Latest lead of a contact (`{{last_lead_id}}` and friends). `nullsFirst()`
    // so the index order equals a plain `ORDER BY "createdAt" DESC`.
    index("FacebookLeadAdsLead_contactId_createdAt_idx").using(
      "btree",
      table.contactId.asc().nullsLast(),
      table.createdAt.desc().nullsFirst(),
    ),
  ],
)
