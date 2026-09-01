import { index, pgEnum, pgTable, text, unique } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { workspaceApiTokenPermissions } from "../partials/workspace-api-token"
import { workspaceModel } from "./workspace"

export const workspaceApiTokenPermission = pgEnum(
  "WorkspaceApiTokenPermission",
  workspaceApiTokenPermissions.options as [string, ...string[]],
)

// Multi-token store: a workspace may hold several named, permissioned API
// tokens. Only the SHA-256 digest is persisted, so a token is recoverable
// exactly once, at generation time on the server. New tokens are minted as
// `cbx_ws_<random>` (see generateWorkspaceToken) with `tokenPrefix` storing
// the first 12 chars for display; legacy tokens predate the prefix column
// (`tokenPrefix` is null) and are verified by hash lookup only — the format
// is never parsed.
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
    name: text().notNull(),
    permission: workspaceApiTokenPermission().notNull(),
    // SHA-256 hex digest of the workspace API token (`hashToken()` from
    // `apps/builder/src/features/integration-api/lib/token-hash.ts`).
    tokenHash: text().notNull(),
    // First 12 display characters of the plaintext token, null for legacy
    // rows minted before this column existed.
    tokenPrefix: text(),
  },
  (table) => [
    unique("WorkspaceApiToken_tokenHash_key").on(table.tokenHash),
    index("WorkspaceApiToken_workspaceId_idx").on(table.workspaceId),
  ],
)
