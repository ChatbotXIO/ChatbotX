import type { EncryptedData } from "@chatbotx.io/encryption"
import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import {
  sipProvisioningStatuses,
  whatsappRegistrationStatuses,
} from "../partials"
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

export const sipProvisioningStatus = pgEnum(
  "sipProvisioningStatus",
  sipProvisioningStatuses.options as [string, ...string[]],
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
    /** Auto-record WhatsApp calls (FreeSWITCH `record_session`) for this number. */
    callRecordingEnabled: boolean().notNull().default(false),
    /** Days a call recording is kept before `purgeExpiredCallRecordings` deletes it. */
    callRecordingRetentionDays: integer().notNull().default(90),
    /** Opt-in: whether recordings for this number are transcribed. */
    callTranscriptionEnabled: boolean().notNull().default(false),
    coexistAiReadsSyncedHistory: boolean().notNull().default(false),
    isCoexist: boolean().notNull().default(false),
    platformType: text().notNull().default(""),
    historyDeclined: boolean().notNull().default(false),
    hasCapiScope: boolean().notNull().default(false),
    capiScopeCheckedAt: timestamp(timestampConfig),
    datasetId: text(),
    capiAccessToken: jsonb().$type<EncryptedData>(),
    capiDisconnectedAt: timestamp(timestampConfig),
    // Meta Events Manager "test_event_code": while set, every CAPI event for
    // this integration is routed to the dataset's Test Events view.
    capiTestEventCode: text(),
    registrationStatus: whatsappRegistrationStatus()
      .notNull()
      .default("pending_verification"),
    registrationError: jsonb().$type<IntegrationWhatsappRegistrationError>(),
    verificationCodeRequestedAt: timestamp(timestampConfig),
    tokenRefreshError: text(),
    /**
     * FreeSWITCH SIP provisioning state machine (WhatsApp calling).
     * `none` until a provisioning attempt starts.
     */
    sipProvisioningStatus: sipProvisioningStatus().notNull().default("none"),
    /** Opaque lease owner id; cleared once the claim is released. */
    sipProvisioningClaim: text(),
    /** Lease expiry for the current provisioning claim (5-min lease). */
    sipProvisioningLeaseUntil: timestamp(timestampConfig),
    /** When `sofia status gateway wa-<id>` first confirmed the gateway. */
    sipProvisionedAt: timestamp(timestampConfig),
    /** Last provisioning/deprovisioning error, surfaced on the Calls card. */
    sipLastError: text(),
    /**
     * Meta SIP password for this business number, encrypted with
     * `encryptUtils` (same as `capiAccessToken`). FreeSWITCH digest auth
     * needs the clear-text password, so this is encrypted, not hashed.
     */
    sipPasswordEncrypted: jsonb().$type<EncryptedData>(),
    /** FreeSWITCH gateway name (`wa-<integrationId>`), globally unique. */
    sipGatewayName: text(),
    /** FreeSWITCH node this number's gateway is provisioned on. */
    sipNodeId: text(),
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
    // Partial: only integrations that have actually been provisioned carry a
    // gateway name, and the xml_curl responder looks gateways up by this
    // name (`findByGatewayName`), so it must stay globally unique.
    uniqueIndex("IntegrationWhatsapp_sipGatewayName_key")
      .using("btree", table.sipGatewayName.asc().nullsLast())
      .where(sql`"sipGatewayName" IS NOT NULL`),
    check(
      "IntegrationWhatsapp_registrationStatus_error_consistent",
      sql`("registrationStatus" <> 'failed' OR "registrationError" IS NOT NULL)
      AND ("registrationStatus" <> 'registered' OR "registrationError" IS NULL)`,
    ),
  ],
)
