// Imported from the `workspace-member/permissions` subpath, NOT the
// top-level `@chatbotx.io/business` barrel — that barrel transitively pulls
// in `packages/database`'s `db` client and breaks in a client-flavored
// test/bundle environment. Re-exported unchanged for existing callers.
import {
  hasContactsAccess,
  hasWorkspacePermission,
  type PermissionsInput,
} from "@chatbotx.io/business/workspace-member/permissions"
import type { WorkspaceMemberPermissions } from "@chatbotx.io/database/partials"

export {
  hasContactsAccess,
  hasWorkspacePermission,
  type PermissionsInput,
  type WorkspacePermissionKey,
} from "@chatbotx.io/business/workspace-member/permissions"

export const PERMISSION_NAV = {
  dashboard: "analytics",
  flows: "flows",
  contacts: "contacts",
  broadcasts: "broadcast",
  sequences: "broadcast",
  products: "ecommerce",
} as const satisfies Record<string, keyof WorkspaceMemberPermissions>

// Landing candidates in sidebar nav priority order: every PERMISSION_NAV
// segment plus `inbox`, which shares the contacts-access rule. Deriving the
// gates from PERMISSION_NAV keeps a new section added there from silently
// missing landing resolution.
const WORKSPACE_LANDING_SEGMENTS = [
  "dashboard",
  "inbox",
  "flows",
  "contacts",
  "broadcasts",
  "sequences",
  "products",
] as const satisfies ReadonlyArray<keyof typeof PERMISSION_NAV | "inbox">

function canAccessLandingSegment(
  segment: (typeof WORKSPACE_LANDING_SEGMENTS)[number],
  permissions: PermissionsInput,
): boolean {
  // `inbox` and `contacts` use the shared contacts-access rule, so members
  // with only `onlyAssignedContacts` still land there.
  if (segment === "inbox" || segment === "contacts") {
    return hasContactsAccess(permissions)
  }
  return hasWorkspacePermission(permissions, PERMISSION_NAV[segment])
}

// Resolve the first section the member can access. Used by the workspace root
// page so users without `analytics` don't get redirected into a 404 dashboard.
// Returns null when the member can access no section; the caller turns that
// into notFound() so we fail closed instead of redirecting into a 404 loop.
export function resolveWorkspaceLandingSegment(
  permissions: PermissionsInput,
): string | null {
  return (
    WORKSPACE_LANDING_SEGMENTS.find((segment) =>
      canAccessLandingSegment(segment, permissions),
    ) ?? null
  )
}
