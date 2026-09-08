import type { EncryptedData } from "@chatbotx.io/encryption"
import {
  integer,
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
import { workspaceModel } from "./workspace"

export const whatsappBusinessAccountModel = pgTable(
  "WhatsappBusinessAccount",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    wabaId: text().notNull(),
    businessId: text().notNull(),
    credential: jsonb().$type<EncryptedData>().notNull(),
    grantedScopes: text().array().notNull().default([]),
    scopeCheckedAt: timestamp(timestampConfig),
    provisionedAt: timestamp(timestampConfig),
    creditLineId: text(),
    revision: integer().notNull().default(0),
  },
  (table) => [
    uniqueIndex("WhatsappBusinessAccount_workspaceId_wabaId_key").on(
      table.workspaceId,
      table.wabaId,
    ),
  ],
)
