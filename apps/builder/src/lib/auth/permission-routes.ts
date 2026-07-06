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

// The `permissions` jsonb column defaults to `{}`, so at runtime any flag can be
// absent even though the type claims every key is present. The `Record` union is
// intentional: it accepts a possibly-partial object, and the strict `=== true`
// checks fail closed on missing/undefined keys.
export function hasWorkspacePermission(
  permissions: WorkspaceMemberPermissions | Record<string, unknown>,
  key: WorkspacePermissionKey,
): boolean {
  return permissions.superAdmin === true || permissions[key] === true
}

// Ordered candidates for the workspace landing route. Each entry maps a path
// segment (relative to `/space/:workspaceId`) to an optional permission gate.
// A `null` gate means the page is always reachable, so the last always-open
// entry guarantees resolution never falls through to a 404. Order reflects the
// sidebar nav priority: prefer analytics/flows-style landing spots, then fall
// back to the ungated inbox.
const WORKSPACE_LANDING_ROUTES = [
  ...Object.entries(PERMISSION_NAV).map(([segment, permission]) => ({
    segment,
    permission,
  })),
  { segment: "inbox", permission: null },
] as const satisfies ReadonlyArray<{
  segment: string
  permission: WorkspacePermissionKey | null
}>

// Resolve the first section the member can access. Used by the workspace root
// page so users without `analytics` don't get redirected into a 404 dashboard.
export function resolveWorkspaceLandingSegment(
  permissions: WorkspaceMemberPermissions | Record<string, unknown>,
): string {
  const target = WORKSPACE_LANDING_ROUTES.find(
    (route) =>
      route.permission === null ||
      hasWorkspacePermission(permissions, route.permission),
  )
  // `inbox` is always ungated, so `find` always resolves; fall back defensively.
  return target?.segment ?? "inbox"
}
