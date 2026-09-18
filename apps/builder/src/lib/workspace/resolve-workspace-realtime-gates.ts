import {
  hasContactsAccess,
  hasWorkspacePermission,
  type PermissionsInput,
} from "@/lib/auth/permission-routes"

export type WorkspaceRealtimeGates = {
  /** Any resolved workspace access mints the realtime token — the
   * platform is authenticated by the connect-token endpoint, not gated by
   * a feature permission. Each feature still gates its own
   * subscription/UI on top of this. */
  realtimeEnabled: boolean
  /** Call control (ringing, answering, dialing, permission requests,
   * calling configuration) — off during a support session, scheduled
   * deletion, or a blocked cloud owner (D8). */
  callingEnabled: boolean
  /** The Calls page / call history and artifacts (D4). */
  callHistoryEnabled: boolean
}

export type ResolveWorkspaceRealtimeGatesInput = {
  permissions: PermissionsInput
  isSupportSession: boolean
  scheduledForDeletion: boolean
  cloud: boolean
  blocked: boolean
}

/**
 * Pure gate contract computed once, server-side, from data the workspace
 * layout already has — see `app/space/[workspaceId]/layout.tsx`. Kept
 * side-effect-free and framework-agnostic so it is unit-testable without a
 * request/response cycle.
 */
export function resolveWorkspaceRealtimeGates({
  permissions,
  isSupportSession,
  scheduledForDeletion,
  cloud,
  blocked,
}: ResolveWorkspaceRealtimeGatesInput): WorkspaceRealtimeGates {
  return {
    realtimeEnabled: true,
    callingEnabled:
      hasContactsAccess(permissions) &&
      !isSupportSession &&
      !scheduledForDeletion &&
      !(cloud && blocked),
    callHistoryEnabled:
      hasContactsAccess(permissions) ||
      hasWorkspacePermission(permissions, "analytics"),
  }
}
