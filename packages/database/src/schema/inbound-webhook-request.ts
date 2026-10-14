import { sql } from "drizzle-orm"
import {
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
  type InboundWebhookActionResult,
  type InboundWebhookFieldError,
  inboundWebhookRequestStatusValues,
} from "../partials/inbound-webhook"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { contactModel } from "./contact"
import { inboundWebhookModel } from "./inbound-webhook"
import { inboxModel } from "./inbox"
import { workspaceModel } from "./workspace"

export const inboundWebhookRequestStatus = pgEnum(
  "inboundWebhookRequestStatus",
  inboundWebhookRequestStatusValues,
)

/**
 * One accepted delivery. `createdAt` is the receive time. The row is also the
 * outbox: the route stores it before enqueueing, and a cron re-dispatches rows
 * stuck in `received` or in `processing` past their lease.
 */
export const inboundWebhookRequestModel = pgTable(
  "InboundWebhookRequest",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    inboundWebhookId: bigintAsString()
      .notNull()
      .references(() => inboundWebhookModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    // Sender-supplied `Idempotency-Key`; NULL when none was sent (every delivery is accepted on its own).
    idempotencyKey: text(),
    // Who sent it, kept for support and abuse tracing. Never shown in the
    // builder or returned by the public API; deleted with the row (30 days).
    clientIp: text(),
    userAgent: text(),
    status: inboundWebhookRequestStatus().notNull().default("received"),
    // Fences every write of the worker that owns the claim.
    claimToken: text(),
    claimedAt: timestamp(timestampConfig),
    attempts: integer().notNull().default(0),
    skipReason: text(),
    errorCode: text(),
    errorMessage: text(),
    inboxId: bigintAsString().references(() => inboxModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    contactId: bigintAsString().references(() => contactModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    // The connection the actions run on. No foreign key: `ContactInbox` is a
    // high-write table and this is only a pointer a resumed attempt re-validates.
    contactInboxId: bigintAsString(),
    // The full accepted body (bounded by `INBOUND_WEBHOOK_LIMITS.maxPayloadBytes`).
    payload: jsonb().$type<unknown>().notNull(),
    fieldErrors: jsonb().$type<InboundWebhookFieldError[]>(),
    actionResults: jsonb().$type<InboundWebhookActionResult[]>(),
    processedAt: timestamp(timestampConfig),
  },
  (table) => [
    uniqueIndex("InboundWebhookRequest_inboundWebhookId_idempotencyKey_key")
      .on(table.inboundWebhookId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
    index("InboundWebhookRequest_inboundWebhookId_createdAt_idx").using(
      "btree",
      table.inboundWebhookId.asc().nullsLast(),
      table.createdAt.desc().nullsLast(),
    ),
    index("InboundWebhookRequest_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    // Foreign keys with ON DELETE SET NULL: without these a contact/inbox
    // delete would scan the whole table.
    index("InboundWebhookRequest_contactId_idx").using(
      "btree",
      table.contactId.asc().nullsLast(),
    ),
    index("InboundWebhookRequest_inboxId_idx").using(
      "btree",
      table.inboxId.asc().nullsLast(),
    ),
    // Predicate-aligned scans of the re-dispatch cron.
    index("InboundWebhookRequest_createdAt_received_idx")
      .on(table.createdAt)
      .where(sql`${table.status} = 'received'`),
    index("InboundWebhookRequest_claimedAt_processing_idx")
      .on(table.claimedAt)
      .where(sql`${table.status} = 'processing'`),
    // Retention purge.
    index("InboundWebhookRequest_createdAt_idx").using(
      "btree",
      table.createdAt.asc().nullsLast(),
    ),
  ],
)
