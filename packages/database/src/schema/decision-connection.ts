import type { EncryptedData } from "@chatbotx.io/encryption"
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import {
  decisionConnectionStatuses,
  decisionConnectionTestStatuses,
  decisionProviderKinds,
  type DecisionConnectionStatus,
  type DecisionConnectionTestStatus,
  type DecisionProviderKind,
} from "../partials/decision"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { workspaceModel } from "./workspace"

export const decisionProviderKind = pgEnum(
  "DecisionProviderKind",
  decisionProviderKinds.options as [DecisionProviderKind, ...DecisionProviderKind[]],
)

export const decisionConnectionStatus = pgEnum(
  "DecisionConnectionStatus",
  decisionConnectionStatuses.options as [
    DecisionConnectionStatus,
    ...DecisionConnectionStatus[],
  ],
)

export const decisionConnectionTestStatus = pgEnum(
  "DecisionConnectionTestStatus",
  decisionConnectionTestStatuses.options as [
    DecisionConnectionTestStatus,
    ...DecisionConnectionTestStatus[],
  ],
)

/**
 * A workspace-owned, write-only credentialed Decision provider connection.
 * `credential` is always an AES-GCM envelope; services are responsible for
 * encryption/decryption and must never expose it in a DTO.
 */
export const decisionConnectionModel = pgTable(
  "DecisionConnection",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text().notNull(),
    providerKind: decisionProviderKind().notNull(),
    // TypeSafe Direct has a provider-owned fixed endpoint. Compatible
    // connections persist their canonical, SSRF-validated HTTPS endpoint.
    endpoint: text(),
    credential: jsonb().$type<EncryptedData>().notNull(),
    modelCatalog: jsonb().$type<string[]>().notNull(),
    defaultModel: text(),
    status: decisionConnectionStatus().notNull().default("enabled"),
    lastTestStatus: decisionConnectionTestStatus(),
    lastTestedAt: timestamp(timestampConfig),
  },
  (table) => [
    index("DecisionConnection_workspaceId_idx").on(table.workspaceId),
    uniqueIndex("DecisionConnection_workspaceId_name_key").on(
      table.workspaceId,
      table.name,
    ),
  ],
)
