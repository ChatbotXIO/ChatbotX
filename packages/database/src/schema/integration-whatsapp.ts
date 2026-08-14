import type { EncryptedData } from "@chatbotx.io/encryption"
import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  index,
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

/**
 * Enforces that a Meta phone number backs exactly one integration.
 *
 * Exported so callers can recognise this specific collision: the table has
 * more than one unique index, and this one means "already connected" rather
 * than a bug.
 */
export const WHATSAPP_PHONE_NUMBER_UNIQUE_CONSTRAINT =
  "IntegrationWhatsapp_phoneNumberId_key"

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
    hasCapiScope: boolean().notNull().default(false),
    capiScopeCheckedAt: timestamp(timestampConfig),
    datasetId: text(),
    capiAccessToken: jsonb().$type<EncryptedData>(),
    capiDisconnectedAt: timestamp(timestampConfig),
    registrationStatus: whatsappRegistrationStatus()
      .notNull()
      .default("pending_verification"),
    registrationError: jsonb().$type<IntegrationWhatsappRegistrationError>(),
    verificationCodeRequestedAt: timestamp(timestampConfig),
    tokenRefreshError: text(),
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
    index("IntegrationWhatsapp_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    // A Meta phone number can back exactly one integration platform-wide.
    // The application already enforces this before insert, but that check and
    // the insert are separated by network calls, so only the database can close
    // the race. Doubles as the lookup index for `findConnectedPhoneNumberIds`.
    uniqueIndex(WHATSAPP_PHONE_NUMBER_UNIQUE_CONSTRAINT).using(
      "btree",
      table.phoneNumberId.asc().nullsLast(),
    ),
    check(
      "IntegrationWhatsapp_registrationStatus_error_consistent",
      sql`("registrationStatus" <> 'failed' OR "registrationError" IS NOT NULL)
      AND ("registrationStatus" <> 'registered' OR "registrationError" IS NULL)`,
    ),
  ],
)
