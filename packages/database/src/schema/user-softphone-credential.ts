import type { EncryptedData } from "@chatbotx.io/encryption"
import {
  jsonb,
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
import { userModel } from "./auth-user"
import { workspaceModel } from "./workspace"

/**
 * One FreeSWITCH SIP softphone credential per (workspace, user) — the agent
 * browser's `SimpleUser` registers with these against the `agents` profile
 * on the workspace's pinned FreeSWITCH node.
 *
 * `sipUsername` is `ag-<workspaceId>-<userId>` (minted by the business
 * layer): globally unique and self-describing, so presence rows
 * (`AgentSipPresence`) and dialplan targets never need a join back to this
 * table to resolve which workspace/user registered.
 */
export const userSoftphoneCredentialModel = pgTable(
  "UserSoftphoneCredential",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    userId: bigintAsString()
      .notNull()
      .references(() => userModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    sipUsername: text().notNull(),
    /**
     * Encrypted (not hashed) with `encryptUtils` — FreeSWITCH digest auth
     * needs the clear-text password to challenge the softphone.
     */
    passwordEncrypted: jsonb().$type<EncryptedData>().notNull(),
    expiresAt: timestamp(timestampConfig).notNull(),
    revokedAt: timestamp(timestampConfig),
  },
  (table) => [
    uniqueIndex("UserSoftphoneCredential_sipUsername_key").using(
      "btree",
      table.sipUsername.asc().nullsLast(),
    ),
    uniqueIndex("UserSoftphoneCredential_workspaceId_userId_key").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.userId.asc().nullsLast(),
    ),
  ],
)
