import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { whatsappRegistrationStatuses } from "../partials"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { inboxModel } from "./inbox"
import { workspaceModel } from "./workspace"

export type IntegrationWhatsappRegistrationError = {
  code: string | number
  subCode: string | number | null
  message: string
  type?: string
  userTitle?: string
  userMessage?: string
  fbtraceId?: string
  at: string
}

export const whatsappRegistrationStatus = pgEnum(
  "whatsappRegistrationStatus",
  whatsappRegistrationStatuses.options as [string, ...string[]],
)

export const integrationWhatsappModel = pgTable(
  "IntegrationWhatsapp",
  {
    ...sharedColumns,
    auth: jsonb().notNull(),
    phoneNumberId: text().notNull(),
    wabaId: text().notNull(),
    businessId: text().notNull(),
    name: text().notNull(),
    displayPhoneNumber: text().notNull().default(""),
    coexistEnabled: boolean().notNull().default(false),
    isCoexist: boolean().notNull().default(false),
    platformType: text().notNull().default(""),
    historyDeclined: boolean().notNull().default(false),
    registrationStatus: whatsappRegistrationStatus()
      .notNull()
      .default("pending_verification"),
    registrationError: jsonb().$type<IntegrationWhatsappRegistrationError>(),
    verificationCodeRequestedAt: timestamp(timestampConfig),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    inboxId: bigintAsString()
      .notNull()
      .references(() => inboxModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    uniqueIndex("IntegrationWhatsapp_inboxId_key").using(
      "btree",
      table.inboxId.asc().nullsLast(),
    ),
    check(
      "IntegrationWhatsapp_registrationStatus_error_consistent",
      sql`("registrationStatus" <> 'failed' OR "registrationError" IS NOT NULL)
      AND ("registrationStatus" <> 'registered' OR "registrationError" IS NULL)`,
    ),
  ],
)
