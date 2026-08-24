import type { WorkspaceMemberPermissions } from "@chatbotx.io/database/partials"

export const PERMISSION_NAV = {
  dashboard: "analytics",
  flows: "flows",
  contacts: "contacts",
  broadcasts: "broadcast",
  sequences: "broadcast",
  products: "ecommerce",
} as const satisfies Record<string, keyof WorkspaceMemberPermissions>

export type WorkspacePermissionKey = keyof WorkspaceMemberPermissions

type PermissionsInput = WorkspaceMemberPermissions | Record<string, unknown>

// The `permissions` jsonb column defaults to `{}`, so at runtime any flag can be
// absent even though the type claims every key is present. The `Record` union is
// intentional: it accepts a possibly-partial object, and the strict `=== true`
// checks fail closed on missing/undefined keys.
export function hasWorkspacePermission(
  permissions: PermissionsInput,
  key: WorkspacePermissionKey,
): boolean {
  return permissions.superAdmin === true || permissions[key] === true
}

// Shared "Contacts / Inbox" access rule used by both the /contacts and /inbox
// sections: full contacts access OR assigned-only access; superAdmin bypasses
// via hasWorkspacePermission.
export function hasContactsAccess(permissions: PermissionsInput): boolean {
  return (
    hasWorkspacePermission(permissions, "contacts") ||
    hasWorkspacePermission(permissions, "onlyAssignedContacts")
  )
}

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
