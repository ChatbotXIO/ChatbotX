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
import type { z } from "zod"
import {
  type WhatsappCallHoursSnapshot,
  type WhatsappCallRecordingMode,
  type WhatsappCallTranscriptionMode,
  whatsappCallRecordingModes,
  whatsappCallTranscriptionModes,
  type whatsappRegistrationErrorSchema,
  whatsappRegistrationStatuses,
} from "../partials"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { inboxModel } from "./inbox"
import { workspaceModel } from "./workspace"

export type IntegrationWhatsappRegistrationError = z.infer<
  typeof whatsappRegistrationErrorSchema
>

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

export const whatsappCallRecordingMode = pgEnum(
  "whatsappCallRecordingMode",
  whatsappCallRecordingModes.options as [string, ...string[]],
)

export const whatsappCallTranscriptionMode = pgEnum(
  "whatsappCallTranscriptionMode",
  whatsappCallTranscriptionModes.options as [string, ...string[]],
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
    /**
     * Local mirror of Meta's `calling.status`, written only after Meta accepts
     * the change. Meta is still the authority for the customer-facing side, but
     * the webhook path cannot afford a Graph round-trip per `connect`, and Meta
     * can deliver a call from a client whose cached UI has not caught up yet —
     * so inbound ringing is gated on this instead.
     *
     * NULLABLE on purpose: `null` means "never mirrored yet" and defers to
     * Meta, so numbers that already had calling working keep working after this
     * column ships. Only an explicit `false` refuses a call.
     */
    callingEnabled: boolean(),
    /**
     * Mutes only the INBOUND side: calls still ring out from the inbox, but a
     * `connect` webhook is rejected instead of ringing agents. Defaults to on,
     * so only an explicit opt-out disables it.
     */
    inboundCallsEnabled: boolean().notNull().default(true),
    /**
     * Local mirror of Meta's `calling.call_hours`, written only after Meta
     * accepts the change. `null` means no schedule — calls are accepted at any
     * time. Mirrored for the same reason as `callingEnabled`: the webhook path
     * has to decide without a Graph round-trip.
     */
    callHours: jsonb().$type<WhatsappCallHoursSnapshot>(),
    /** Auto-record WhatsApp calls for this number. */
    callRecordingEnabled: boolean().notNull().default(false),
    /** Days a call recording is kept before `purgeExpiredCallRecordings` deletes it. */
    callRecordingRetentionDays: integer().notNull().default(90),
    /** Opt-in: whether recordings for this number are transcribed. */
    callTranscriptionEnabled: boolean().notNull().default(false),
    /** Recording pipeline mode for this number's VoIP calls. */
    callRecordingMode: whatsappCallRecordingMode()
      .$type<WhatsappCallRecordingMode>()
      .notNull()
      .default("metaNative"),
    /** Transcription pipeline mode for this number's VoIP calls. */
    callTranscriptionMode: whatsappCallTranscriptionMode()
      .$type<WhatsappCallTranscriptionMode>()
      .notNull()
      .default("metaNative"),
    /**
     * Meta announcement language code (e.g. `en_US`) played to the customer
     * when `metaNative` recording/transcription is enabled — a value from
     * Meta's supported-announcement-languages table. Null until configured;
     * the caller falls back to `en_US`.
     */
    callAnnouncementLanguage: text(),
    /**
     * The `purpose` string (≤250 chars) sent on Meta's per-call
     * `recording`/`transcription` opt-in objects. A single shared value
     * covers both — when both are enabled, Meta plays one combined
     * announcement built from the `recording` object's `purpose`/
     * `announcement_language`.
     */
    callRecordingPurpose: text(),
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
