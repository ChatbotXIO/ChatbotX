import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import {
  type WhatsappCallDirection,
  type WhatsappCallStatus,
  whatsappCallDirections,
  whatsappCallStatuses,
} from "../partials/whatsapp-call"
import { contactInboxModel } from "./contact-inbox"
import { conversationModel } from "./conversation"
import { inboxModel } from "./inbox"
import { workspaceModel } from "./workspace"

export const whatsappCallDirection = pgEnum(
  "whatsappCallDirection",
  whatsappCallDirections.options as [string, ...string[]],
)

export const whatsappCallStatus = pgEnum(
  "whatsappCallStatus",
  whatsappCallStatuses.options as [string, ...string[]],
)

/**
 * One row per WhatsApp Business call, keyed by Meta's call id (`wacid`).
 * Rows are created on the Call Connect webhook and finalized on the Call
 * Terminate webhook; interim Call Status webhooks only advance `status`.
 */
export const whatsappCallModel = pgTable(
  "WhatsappCall",
  {
    ...sharedColumns,
    /** Meta call id ("wacid...."), globally unique per call. */
    wacid: text().notNull(),
    direction: whatsappCallDirection().$type<WhatsappCallDirection>().notNull(),
    status: whatsappCallStatus()
      .$type<WhatsappCallStatus>()
      .notNull()
      .default("ringing"),
    startedAt: timestamp(timestampConfig),
    endedAt: timestamp(timestampConfig),
    durationSeconds: integer(),
    /**
     * The call-activity message rendered into the conversation on terminate.
     * Plain column, no FK — `Message` is a sharded hypertable without inbound
     * foreign keys by design.
     */
    messageId: bigintAsString(),
    /** LiveKit room carrying this call's audio (in-app calling, beta). */
    livekitRoomName: text(),
    /** Object-storage path of the call recording (LiveKit egress output). */
    recordingPath: text(),
    recordedAt: timestamp(timestampConfig),
    /** Speech-to-text transcript of the recording. */
    transcript: text(),
    transcribedAt: timestamp(timestampConfig),
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
    contactInboxId: bigintAsString()
      .notNull()
      .references(() => contactInboxModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    conversationId: bigintAsString()
      .notNull()
      .references(() => conversationModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    uniqueIndex("WhatsappCall_wacid_key").using(
      "btree",
      table.wacid.asc().nullsLast(),
    ),
    index("WhatsappCall_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    index("WhatsappCall_conversationId_idx").using(
      "btree",
      table.conversationId.asc().nullsLast(),
    ),
    index("WhatsappCall_contactInboxId_idx").using(
      "btree",
      table.contactInboxId.asc().nullsLast(),
    ),
  ],
)
