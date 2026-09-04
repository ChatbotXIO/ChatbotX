import type { EncryptedData } from "@chatbotx.io/encryption"
import { sql } from "drizzle-orm"
import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import type { WorkspaceApiTokenScope } from "../partials/workspace-api-token"
import { workspaceApiTokenPermissions } from "../partials/workspace-api-token"
import { workspaceModel } from "./workspace"

export const workspaceApiTokenPermission = pgEnum(
  "WorkspaceApiTokenPermission",
  workspaceApiTokenPermissions.options as [string, ...string[]],
)

// Multi-token store: a workspace may hold several named, permissioned API
// tokens. Only the SHA-256 digest is persisted for user-created tokens, so
// those are recoverable exactly once, at generation time on the server. New
// tokens are minted as `cbx_ws_<random>` (see generateWorkspaceToken) with
// `tokenPrefix` storing the first 12 chars for display; legacy tokens
// predate the prefix column (`tokenPrefix` is null) and are verified by
// hash lookup only — the format is never parsed.
//
// Exactly one row per workspace may have `isDefault = true` (enforced by the
// partial unique index below). That row backs the `{{api_key}}` system
// field: it additionally carries `encryptedToken`, an AES-GCM blob
// (`encryptUtils`) that can be decrypted back to plaintext server-side,
// mirroring Stripe's model where only the system-generated default key is
// recoverable. It is always `permission: "full"` and is exempt from the
// per-workspace token cap.
//
// `scopes` is the resource-area axis (orthogonal to `permission`). NULL means
// unrestricted ("All scopes") — every existing row and every `isDefault` row
// stays NULL, so this column is zero-behavior-change on introduction. A
// non-null array is an explicit allow-list: a token scoped to `["contacts"]`
// is denied every route outside that scope, and — critically — is frozen at
// that list forever, even after a new scope value ships later (only NULL
// tokens gain a future scope automatically). Plain `text[]`, not a pg enum,
// so adding a scope is a zod enum change, never a migration.
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
    isDefault: boolean().notNull().default(false),
    // AES-GCM ciphertext of the plaintext token, only ever set on the
    // default row. Bound to the workspace via AAD `workspace-api-token:<id>`
    // so a blob can never be decrypted under the wrong workspace.
    encryptedToken: jsonb().$type<EncryptedData>(),
    // NULL = unrestricted ("All scopes"). See the type-level doc above.
    scopes: text().$type<WorkspaceApiTokenScope>().array(),
  },
  (table) => [
    unique("WorkspaceApiToken_tokenHash_key").on(table.tokenHash),
    index("WorkspaceApiToken_workspaceId_idx").on(table.workspaceId),
    uniqueIndex("WorkspaceApiToken_workspaceId_default_key")
      .on(table.workspaceId)
      .where(sql`${table.isDefault}`),
  ],
)
