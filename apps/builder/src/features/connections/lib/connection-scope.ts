import { CONNECTION_REGISTRY } from "@chatbotx.io/connections"
import type {
  ConnectionKind,
  IntegrationType,
  WorkspaceApiTokenScope,
} from "@chatbotx.io/database/partials"
import { ORPCError } from "@orpc/server"

/** The resource-area scope a connection of this kind falls under — `channel` connections are gated by `channels`, everything else (`integration`) by `integrations`. */
export const requiredScopeForKind = (
  kind: ConnectionKind,
): WorkspaceApiTokenScope => (kind === "channel" ? "channels" : "integrations")

/**
 * Throws the same `FORBIDDEN` shape `requireTokenScope` (`@/orpc`) throws,
 * scoped to one `IntegrationType`'s own kind instead of the router-wide
 * `channels`-or-`integrations` OR check `workspaceTokenAuthAPIForScope`
 * already applied. `scopes === null` means unrestricted ("All scopes"), same
 * convention as `requireTokenScope`.
 */
export const assertTokenScopeForProvider = (
  scopes: WorkspaceApiTokenScope[] | null | undefined,
  provider: IntegrationType,
): void => {
  if (scopes === null || scopes === undefined) {
    return
  }
  const kind = CONNECTION_REGISTRY[provider]?.provider.kind ?? "integration"
  const required = requiredScopeForKind(kind)
  if (!scopes.includes(required)) {
    throw new ORPCError("FORBIDDEN", {
      message: `Token is not authorized for the '${required}' scope`,
    })
  }
}

/** Every `ConnectionKind` this token's scopes permit, or `null` for an unrestricted token. */
export const allowedKindsForScopes = (
  scopes: WorkspaceApiTokenScope[] | null | undefined,
): ConnectionKind[] | null => {
  if (scopes === null || scopes === undefined) {
    return null
  }
  const kinds: ConnectionKind[] = []
  if (scopes.includes("channels")) {
    kinds.push("channel")
  }
  if (scopes.includes("integrations")) {
    kinds.push("integration")
  }
  return kinds
}

/**
 * Resolves the effective `kind` filter a list/catalog route should query
 * with: an explicit `requestedKind` outside the token's allowed kinds is a
 * 403 (same enforcement style as `assertTokenScopeForProvider`); otherwise a
 * token restricted to exactly one kind has that kind forced onto the query
 * even with no `kind` filter requested, so a channels-only token's list can
 * never incidentally include integration rows.
 */
export const resolveListKind = (
  scopes: WorkspaceApiTokenScope[] | null | undefined,
  requestedKind: ConnectionKind | undefined,
): ConnectionKind | undefined => {
  const allowedKinds = allowedKindsForScopes(scopes)
  if (!allowedKinds) {
    return requestedKind
  }
  if (requestedKind) {
    if (!allowedKinds.includes(requestedKind)) {
      throw new ORPCError("FORBIDDEN", {
        message: `Token is not authorized for the '${requiredScopeForKind(requestedKind)}' scope`,
      })
    }
    return requestedKind
  }
  return allowedKinds.length === 1 ? allowedKinds[0] : undefined
}
