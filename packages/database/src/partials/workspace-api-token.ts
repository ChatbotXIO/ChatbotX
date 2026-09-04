import { z } from "zod"

export const workspaceApiTokenPermissions = z.enum(["full", "read_only"])
export type WorkspaceApiTokenPermission = z.infer<
  typeof workspaceApiTokenPermissions
>

// Resource-area axis for workspace API tokens, orthogonal to `permission`
// (method-level). Stored as plain `text[]` (see workspace-api-token schema),
// not a pg enum, so a future scope is only an enum value + route
// declarations — never a migration. `null` on the row means unrestricted
// ("All scopes"); see WorkspaceApiToken.scopes for the NULL-vs-array
// semantics that keep existing/future tokens frozen at least privilege.
export const workspaceApiTokenScopes = z.enum([
  "contacts",
  "inbox",
  "automation",
  "broadcasts",
  "analytics",
  "ecommerce",
  "integrations",
  "members",
  "channels",
  "minigames",
  "appointments",
  "media",
  "ads",
])
export type WorkspaceApiTokenScope = z.infer<typeof workspaceApiTokenScopes>

/**
 * SHA-256 hex digest of a workspace API token's plaintext, as produced by
 * `hashToken()` (`apps/builder/src/features/integration-api/lib/token-hash.ts`).
 * Branded so a raw string can't be passed to a hash-only lookup/write by
 * mistake — declared here (not in the builder) because both
 * `packages/business` and `packages/database` need it, and `packages/*` must
 * never import from `apps/builder`. The DB column itself stays `text`; the
 * brand exists only at the type level for write/lookup call sites.
 */
export type TokenHash = string & { readonly __brand: "TokenHash" }
