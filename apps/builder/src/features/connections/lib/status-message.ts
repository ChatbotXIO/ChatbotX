import {
  type ConnectionStatusReason,
  type ConnectionStatusState,
  isProviderOffboardedConnection,
} from "@chatbotx.io/database/partials"
import type { MessageKey } from "@/features/channel-connect/lib/message-key"

/**
 * Operator-facing copy for why a connection is not simply "connected". One
 * entry per reason, so adding a `ConnectionStatusReason` fails to type-check
 * here until it has a message; several reasons share a message on purpose.
 */
export const CONNECTION_STATUS_REASON_MESSAGE_KEYS = {
  provider_offboarded: "connectionStatus.reconnecting",
  provider_revoked: "connectionStatus.accessRemoved",
  token_revoked: "connectionStatus.accessRemoved",
  refresh_failed: "connectionStatus.needsReconnect",
  verify_failed: "connectionStatus.needsReconnect",
  orphaned_webhook: "connectionStatus.needsReconnect",
  manual: "connectionStatus.inactive",
  workspace_purge: "connectionStatus.inactive",
  trial_expired: "connectionStatus.inactive",
  tenant_suspended: "connectionStatus.inactive",
  quota_exceeded: "connectionStatus.inactive",
} as const satisfies Record<ConnectionStatusReason, MessageKey>

/**
 * A connection the operator can fix by connecting the account again: access is
 * gone, or a refresh/health check is failing. A provider-driven offboard heals
 * by itself, so it offers no action.
 */
const canReconnectConnection = (connection: ConnectionStatusState): boolean =>
  connection.status === "needs_reauth" ||
  (connection.status === "degraded" &&
    !isProviderOffboardedConnection(connection))

/** What the channel list shows next to a connection; `null` when it is healthy. */
export type ConnectionStatusNotice = {
  messageKey: (typeof CONNECTION_STATUS_REASON_MESSAGE_KEYS)[ConnectionStatusReason]
  /** The operator can act on it with a Reconnect button. */
  canReconnect: boolean
}

export const resolveConnectionStatusNotice = (
  connection: ConnectionStatusState | null | undefined,
): ConnectionStatusNotice | null => {
  if (!connection?.statusReason) {
    return null
  }
  return {
    messageKey: CONNECTION_STATUS_REASON_MESSAGE_KEYS[connection.statusReason],
    canReconnect: canReconnectConnection(connection),
  }
}
