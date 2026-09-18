"use client"

import {
  useWorkspaceRealtimeContext,
  type WorkspaceRealtimeConnectionStatus,
} from "./workspace-realtime-provider"

export type WorkspaceRealtimeStatus = {
  status: WorkspaceRealtimeConnectionStatus
  /** Increments only after a PREVIOUS open — the first connect never counts
   * as a reconnect. */
  reconnectCount: number
}

/** Read-only view of the workspace socket's connection lifecycle — for UI
 * that wants to show a "reconnecting…" indicator, never for gating whether
 * a subscription is registered (`useWorkspaceRealtimeEvents` handles that
 * on its own). */
export function useWorkspaceRealtimeStatus(): WorkspaceRealtimeStatus {
  const { status, reconnectCount } = useWorkspaceRealtimeContext()
  return { status, reconnectCount }
}
