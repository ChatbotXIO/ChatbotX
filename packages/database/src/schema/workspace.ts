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
    // Meta Conversions API Limited Data Use (plan #3) — a workspace-level
    // toggle only; there is no per-contact opt_out in v1 (needs a dedicated,
    // auditable ads-consent field/policy first — `Contact.blockedAt` is a
    // MESSAGING block and must never be treated as ads consent). Read via
    // `workspaceService` in both CAPI send handlers; default off so existing
    // workspaces are unaffected until a user opts in.
    capiLimitedDataUse: boolean().default(false).notNull(),
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
    // Deprecated: legacy plaintext token, superseded by `WorkspaceApiToken`.
    // `workspaceTokenAuthMidddleware` falls back to this column only for rows
    // created between deploying the hashing code and backfilling the new
    // table — remove once that fallback's warn log has been silent for a
    // release.
    token: text(),
  },
  (table) => [
    index("Workspace_tenantId_idx").on(table.tenantId),
    index("Workspace_scheduledDeletionAt_idx").on(table.scheduledDeletionAt),
  ],
)
