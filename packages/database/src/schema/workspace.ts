import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import {
  type DefaultReplyFrequency,
  defaultReplyFrequencies,
} from "../partials"
import {
  bigintAsString,
  ROOT_TENANT_ID,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { userModel } from "./auth-user"
import { tenantModel } from "./enterprise/tenant"

// Cast to the (non-empty) literal-union tuple — not `.enum` and not widened to
// `[string, ...string[]]` — so the column's `enumValues` stays a literal
// union. That's needed for `createSelectSchema(workspaceModel)`
// (drizzle-orm/zod) to type this column as a real `z.enum(...)` instead of
// widening it to `z.string()`.
export const defaultReplyFrequency = pgEnum(
  "defaultReplyFrequency",
  defaultReplyFrequencies.options as [
    DefaultReplyFrequency,
    ...DefaultReplyFrequency[],
  ],
)

export const workspaceModel = pgTable(
  "Workspace",
  {
    ...sharedColumns,
    name: text().notNull(),
    defaultReply: text(),
    defaultReplyFrequency: defaultReplyFrequency().notNull().default("allTime"),
    targetCountry: text(),
    language: text().notNull().default("en"),
    timezone: text().notNull().default("UTC"),
    brandColor: text().notNull().default("#016DFF"),
    developmentMode: boolean().default(false).notNull(),
    smartResponseDelaySeconds: integer(),
    isActive: boolean().notNull().default(true),
    startTime: text(),
    endTime: text(),
    logo: text(),
    scheduledDeletionAt: timestamp(timestampConfig),
    ownerId: bigintAsString()
      .notNull()
      .references(() => userModel.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    // Owner-derived tenant stamp (set by the workspace create service, never
    // request-derived). Lets a reseller's whole tenant be scanned by tenantId
    // regardless of which host created the workspace.
    tenantId: bigintAsString()
      .notNull()
      .default(ROOT_TENANT_ID)
      .references(() => tenantModel.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    token: text(),
  },
  (table) => [
    index("Workspace_tenantId_idx").on(table.tenantId),
    index("Workspace_scheduledDeletionAt_idx").on(table.scheduledDeletionAt),
  ],
)
