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
  TERMINAL_CONNECT_SESSION_STATUSES,
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

const terminalConnectSessionStatusesSql = sql.join(
  TERMINAL_CONNECT_SESSION_STATUSES.map((status) => sql`${status}`),
  sql`, `,
)
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
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    // Exactly one actor provenance field is required at session creation; FK
    // deletion may null either field later.
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
    // `returnUrl` is sanitized with `sanitizeReferer`
    // (`apps/builder/src/lib/oauth-referer.ts`).
    returnUrl: text(),
    // SHA-256 hex digest of a 32-byte nonce; plaintext appears once inside `authorizeUrl`.
    stateNonceHash: text().notNull(),
    status: text().$type<ConnectSessionStatus>().notNull().default("pending"),
    // Provider-defined step name (`authorize`, `select`, `verify_code`, …).
    step: text().notNull().default("authorize"),
    nextAction: jsonb().$type<ConnectSessionNextAction>(),
    encryptedAuth: jsonb().$type<EncryptedData>(),
    targets: jsonb()
      .$type<ConnectSessionTarget[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    claimedTargetIds: text().array().default(sql`ARRAY[]::text[]`).notNull(),
    resultConnectionIds: text().array().default(sql`ARRAY[]::text[]`).notNull(),
    results: jsonb()
      .$type<ConnectSessionOutcome[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    errorCode: text().$type<ConnectSessionErrorCode>(),
    // Pending sessions expire after 10 minutes; authorized sessions expire
    // after 30. Reads treat `expiresAt <= now()` as `expired` regardless of
    // the stored `status`.
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
      sql`(${table.status} IN (${terminalConnectSessionStatusesSql})) = (${table.consumedAt} IS NOT NULL)`,
    ),
    check(
      "ConnectSession_terminal_clears_encryptedAuth_check",
      sql`${table.status} NOT IN (${terminalConnectSessionStatusesSql}) OR ${table.encryptedAuth} IS NULL`,
    ),
    // Deleting a reconnect target intentionally removes every session bound to
    // it. Any remaining active reconnect must still retain its target.
    check(
      "ConnectSession_active_reconnect_requires_target_check",
      sql`${table.purpose} <> 'reconnect' OR ${table.status} IN (${terminalConnectSessionStatusesSql}) OR ${table.targetConnectionId} IS NOT NULL`,
    ),
  ],
)
