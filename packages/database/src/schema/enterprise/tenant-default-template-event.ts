import { index, pgEnum, pgTable } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../../partials/shared"
import {
  type TenantDefaultTemplateAction,
  tenantDefaultTemplateActions,
} from "../../partials/template"
import { userModel } from "../auth-user"
import { tenantModel } from "./tenant"

export const tenantDefaultTemplateAction = pgEnum(
  "tenantDefaultTemplateAction",
  tenantDefaultTemplateActions.options as [
    TenantDefaultTemplateAction,
    ...TenantDefaultTemplateAction[],
  ],
)

/**
 * Append-only history of a tenant's default template: who set or cleared it,
 * and which template, when. `TenantDefaultTemplate` keeps only the current
 * choice. `templateId` is a plain id (no foreign key) so the history outlives
 * a deleted template; the actor is nulled if their user is deleted.
 */
export const tenantDefaultTemplateEventModel = pgTable(
  "TenantDefaultTemplateEvent",
  {
    ...sharedColumns,
    tenantId: bigintAsString()
      .notNull()
      .references(() => tenantModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    action: tenantDefaultTemplateAction().notNull(),
    templateId: bigintAsString().notNull(),
    actorUserId: bigintAsString().references(() => userModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
  },
  (table) => [
    index("TenantDefaultTemplateEvent_tenantId_createdAt_idx").using(
      "btree",
      table.tenantId.asc(),
      table.createdAt.desc(),
    ),
    index("TenantDefaultTemplateEvent_actorUserId_idx").using(
      "btree",
      table.actorUserId.asc(),
    ),
  ],
)
