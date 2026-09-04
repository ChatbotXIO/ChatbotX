import { z } from "zod"

export const workspaceApiTokenPermissions = z.enum(["full", "read_only"])
export type WorkspaceApiTokenPermission = z.infer<
  typeof workspaceApiTokenPermissions
>

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
