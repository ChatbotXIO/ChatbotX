import {
  boolean,
  index,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import {
  type WhatsappCallPermissionResponse,
  whatsappCallPermissionResponses,
} from "../partials/whatsapp-call"
import { contactInboxModel } from "./contact-inbox"
import { workspaceModel } from "./workspace"

export const whatsappCallPermissionResponse = pgEnum(
  "whatsappCallPermissionResponse",
  whatsappCallPermissionResponses.options as [string, ...string[]],
)

/**
 * Latest business-calling permission state for one WhatsApp contact
 * (`call_permission_reply` webhook). One row per contact inbox — each new
 * reply replaces the previous state, mirroring Meta's "newest response wins"
 * semantics.
 */
export const whatsappCallPermissionModel = pgTable(
  "WhatsappCallPermission",
  {
    ...sharedColumns,
    response: whatsappCallPermissionResponse()
      .$type<WhatsappCallPermissionResponse>()
      .notNull(),
    isPermanent: boolean().notNull().default(false),
    /** Unix `expiration_timestamp` from Meta; null for permanent grants. */
    expiresAt: timestamp(timestampConfig),
    respondedAt: timestamp(timestampConfig).notNull(),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    contactInboxId: bigintAsString()
      .notNull()
      .references(() => contactInboxModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    uniqueIndex("WhatsappCallPermission_contactInboxId_key").using(
      "btree",
      table.contactInboxId.asc().nullsLast(),
    ),
    index("WhatsappCallPermission_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
  ],
)
