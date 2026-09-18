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
  /**
   * Whether the sidebar offers the Calls page at all. Narrower than
   * {@link callHistoryEnabled} by design: that flag also mounts
   * `WhatsappCallInfoSheet`, which any call card's Transcript / AI Summary
   * button opens — gating the sheet on the workspace's channels would leave
   * those buttons inert for anyone who reached `/calls` by URL. So the
   * channel check narrows the NAV ENTRY only; the page itself stays
   * reachable and renders its empty state.
   */
  callHistoryNavVisible: boolean
}

export type ResolveWorkspaceRealtimeGatesInput = {
  permissions: PermissionsInput
  isSupportSession: boolean
  scheduledForDeletion: boolean
  cloud: boolean
  blocked: boolean
  /**
   * Whether the workspace has ever connected a channel that can produce
   * calls (`CALL_CAPABLE_CHANNELS`, resolved by the caller via
   * `inboxService.hasAnyChannel`). Passed in as plain data to keep this
   * function pure and channel-agnostic.
   */
  hasCallCapableChannel: boolean
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
  hasCallCapableChannel,
}: ResolveWorkspaceRealtimeGatesInput): WorkspaceRealtimeGates {
  const callHistoryEnabled =
    hasContactsAccess(permissions) ||
    hasWorkspacePermission(permissions, "analytics")

  return {
    realtimeEnabled: true,
    callingEnabled:
      hasContactsAccess(permissions) &&
      !isSupportSession &&
      !scheduledForDeletion &&
      !(cloud && blocked),
    callHistoryEnabled,
    callHistoryNavVisible: callHistoryEnabled && hasCallCapableChannel,
  }
}
