import { index, pgTable, text, unique } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { workspaceModel } from "./workspace"

// One row per workspace today (replace-write on regeneration — see
// `workspaceApiTokenService.replaceToken`). Track D adds `name`, `scopes`,
// `prefix`, `expiresAt`, `createdBy`, `lastUsedAt` as additive columns and
// drops the single-row invariant.
export const workspaceApiTokenModel = pgTable(
  "WorkspaceApiToken",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    // SHA-256 hex digest of the workspace API token (`hashToken()` from
    // `apps/builder/src/features/integration-api/lib/token-hash.ts`).
    tokenHash: text().notNull(),
  },
  (table) => [
    unique("WorkspaceApiToken_tokenHash_key").on(table.tokenHash),
    index("WorkspaceApiToken_workspaceId_idx").on(table.workspaceId),
  ],
)
