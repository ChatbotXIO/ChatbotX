/**
 * Channel-agnostic provider account lifecycle events. A channel adapter maps
 * its provider's webhook onto one of these kinds; the strategy table below
 * says how each kind moves a `Connection`, and `decideProviderEventOrder`
 * tells the state service whether a delivery is new, late or a duplicate.
 */

import {
  type ConnectionStatusReason,
  type ConnectionStatusState,
  isProviderOffboardedConnection,
  type ProviderAccountEventKind,
} from "@chatbotx.io/database/partials"
import type { ConnectionEvent } from "./state"

type ProviderAccountEventStrategy = {
  connectionEvent: ConnectionEvent
  reason?: ConnectionStatusReason
  /**
   * Wins a same-timestamp tie. Provider timestamps have one-second resolution,
   * and a reconnect can only follow an offboard, so a tie between the two means
   * the reconnect came last: revoke > reconnect > offboard.
   */
  precedence: number
  /** The event resolves the error recorded on the row. */
  clearsLastError?: true
}

export const PROVIDER_ACCOUNT_EVENT_STRATEGY: Record<
  ProviderAccountEventKind,
  ProviderAccountEventStrategy
> = {
  revoked: {
    connectionEvent: "auth.revoked",
    reason: "provider_revoked",
    precedence: 3,
  },
  offboarded: {
    connectionEvent: "provider.offboarded",
    reason: "provider_offboarded",
    precedence: 1,
  },
  reconnected: {
    connectionEvent: "provider.reconnected",
    precedence: 2,
    clearsLastError: true,
  },
}

/** What a send does about the provider's account state. */
export type ConnectionSendDecision = "send" | "defer"

/**
 * Only a provider-driven offboard holds sends back: while the account is being
 * re-onboarded the provider rejects them. Every other state keeps today's
 * behaviour, where the channel handler succeeds or records its own failure.
 */
export const resolveConnectionSendDecision = (
  connection: ConnectionStatusState | null,
): ConnectionSendDecision =>
  isProviderOffboardedConnection(connection) ? "defer" : "send"

type StoredProviderEvent = {
  at: Date | null
  kind: ProviderAccountEventKind | null
}

type IncomingProviderEvent = {
  at: Date
  kind: ProviderAccountEventKind
}

export type ProviderEventOrder = "apply" | "stale" | "duplicate"

/**
 * Compares a delivery against the newest event already applied to the row.
 * Providers retry and reorder webhooks, so an older event must not undo a
 * newer one and an exact repeat must not run its side effects twice.
 */
export const decideProviderEventOrder = (
  stored: StoredProviderEvent,
  incoming: IncomingProviderEvent,
): ProviderEventOrder => {
  if (!(stored.at && stored.kind)) {
    return "apply"
  }
  const storedMs = stored.at.getTime()
  const incomingMs = incoming.at.getTime()
  if (incomingMs > storedMs) {
    return "apply"
  }
  if (incomingMs < storedMs) {
    return "stale"
  }
  if (incoming.kind === stored.kind) {
    return "duplicate"
  }
  return PROVIDER_ACCOUNT_EVENT_STRATEGY[incoming.kind].precedence >
    PROVIDER_ACCOUNT_EVENT_STRATEGY[stored.kind].precedence
    ? "apply"
    : "stale"
}
