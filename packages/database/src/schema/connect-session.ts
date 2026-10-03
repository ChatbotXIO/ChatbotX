import type { EncryptedData } from "@chatbotx.io/encryption"
import { sql } from "drizzle-orm"
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import type {
  ConnectSessionNextAction,
  ConnectSessionOutcome,
  ConnectSessionTarget,
} from "../partials/connect-session"
import {
  type ConnectSessionErrorCode,
  type ConnectSessionPurpose,
  type ConnectSessionStatus,
  connectSessionErrorCodes,
  connectSessionPurposes,
  connectSessionStatuses,
} from "../partials/connection"
import type { IntegrationType } from "../partials/integration"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { userModel } from "./auth-user"
import { connectionModel } from "./connection"
import { workspaceModel } from "./workspace"
import { workspaceApiTokenModel } from "./workspace-api-token"

/** Strategy-agnostic, multi-step connection flow. */
export const connectSessionModel = pgTable(
  "ConnectSession",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    provider: text().$type<IntegrationType>().notNull(),
    purpose: text().$type<ConnectSessionPurpose>().notNull(),
    // For `reconnect`: identity must match the existing Connection on completion.
    targetConnectionId: bigintAsString().references(() => connectionModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    // Creation requires exactly one actor; the database permits neither after actor deletion.
    actorUserId: bigintAsString().references(() => userModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    actorTokenId: bigintAsString().references(() => workspaceApiTokenModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    // White-label: the credential owner and host that started the flow.
    platformOwnerId: text(),
    originHost: text(),
    // Validated with `sanitizeReferer` (`apps/builder/src/lib/oauth-referer.ts`).
    returnUrl: text(),
    // SHA-256 hex digest of a 32-byte nonce; plaintext appears once inside `authorizeUrl`.
    stateNonceHash: text().notNull(),
    status: text().$type<ConnectSessionStatus>().notNull().default("pending"),
    // Provider-defined step name (`authorize`, `select`, `verify_code`, …).
    step: text().notNull().default("authorize"),
    nextAction: jsonb().$type<ConnectSessionNextAction>(),
    encryptedAuth: jsonb().$type<EncryptedData>(),
    targets: jsonb().$type<ConnectSessionTarget[]>().default(sql`[]`).notNull(),
    claimedTargetIds: text().array().default(sql`[]`).notNull(),
    resultConnectionIds: text().array().default(sql`[]`).notNull(),
    results: jsonb()
      .$type<ConnectSessionOutcome[]>()
      .default(sql`[]`)
      .notNull(),
    errorCode: text().$type<ConnectSessionErrorCode>(),
    // 10 min while pending, 30 min once authorized. Reads treat
    // `expiresAt <= now()` as `expired` regardless of the stored `status`.
    expiresAt: timestamp(timestampConfig).notNull(),
    consumedAt: timestamp(timestampConfig),
  },
  (table) => [
    index("ConnectSession_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    index("ConnectSession_expiresAt_idx").using(
      "btree",
      table.expiresAt.asc().nullsLast(),
    ),
    index("ConnectSession_consumedAt_idx")
      .using("btree", table.consumedAt.asc().nullsLast())
      .where(sql`${table.consumedAt} IS NOT NULL`),
    uniqueIndex("ConnectSession_stateNonceHash_key").using(
      "btree",
      table.stateNonceHash.asc().nullsLast(),
    ),
    // Actor deletion may null either FK; creation still requires exactly one actor.
    check(
      "ConnectSession_actor_at_most_one",
      sql`(("actorUserId" IS NOT NULL)::int + ("actorTokenId" IS NOT NULL)::int) <= 1`,
    ),
    check(
      "ConnectSession_status_check",
      sql`${table.status} IN (${sql.join(
        connectSessionStatuses.options.map((status) => sql`${status}`),
        sql`, `,
      )})`,
    ),
    check(
      "ConnectSession_purpose_check",
      sql`${table.purpose} IN (${sql.join(
        connectSessionPurposes.options.map((purpose) => sql`${purpose}`),
        sql`, `,
      )})`,
    ),
    check(
      "ConnectSession_errorCode_check",
      sql`${table.errorCode} IN (${sql.join(
        connectSessionErrorCodes.options.map((errorCode) => sql`${errorCode}`),
        sql`, `,
      )})`,
    ),
    check(
      "ConnectSession_errorCode_terminal_failure_check",
      sql`${table.errorCode} IS NULL OR ${table.status} IN ('failed', 'expired', 'cancelled')`,
    ),
    // Purge keys off `consumedAt`; a terminal row missing it would keep its
    // ciphertext forever. Active rows must not carry it either, so a
    // terminal-only transition (`expireDue`, `appendResults`) can't be
    // skipped by a partial update.
    check(
      "ConnectSession_terminal_consumedAt_check",
      sql`(${table.status} IN ('completed', 'failed', 'expired', 'cancelled')) = (${table.consumedAt} IS NOT NULL)`,
    ),
    check(
      "ConnectSession_terminal_clears_encryptedAuth_check",
      sql`${table.status} NOT IN ('completed', 'failed', 'expired', 'cancelled') OR ${table.encryptedAuth} IS NULL`,
    ),
    // `targetConnectionId` is nullable only so a terminal (historical) row can
    // survive its target `Connection` being deleted (`onDelete: "set null"`
    // above). An active reconnect losing its target mid-flow is a bug, not a
    // valid state — this CHECK makes that `SET NULL` fail instead of
    // silently orphaning the flow, so deleting a `Connection` with an active
    // reconnect session still pointed at it is rejected by the database.
    check(
      "ConnectSession_active_reconnect_requires_target_check",
      sql`${table.purpose} <> 'reconnect' OR ${table.status} IN ('completed', 'failed', 'expired', 'cancelled') OR ${table.targetConnectionId} IS NOT NULL`,
    ),
  ],
)
