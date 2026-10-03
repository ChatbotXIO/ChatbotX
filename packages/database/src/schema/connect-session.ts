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
import type {
  ConnectSessionErrorCode,
  ConnectSessionPurpose,
  ConnectSessionStatus,
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
  ],
)
