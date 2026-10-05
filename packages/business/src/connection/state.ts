/**
 * Pure Connection status state machine. It depends only on status types and
 * the standard `ChatbotXException`, so it can be unit-tested without a
 * database and reused by both `ConnectionStateService.transition` (DB writes
 * + audit) and any future dry-run/preview caller.
 *
 * Families: ACTIVE = `connected | degraded` (quota held, `Inbox.status =
 * connected`). INACTIVE = `needs_reauth | paused | disconnected` (quota
 * released, `Inbox.status = disconnected`).
 *
 * Invariant: quota transitions are calculated at active/inactive edges.
 * `quotaEdge` is the single source of truth callers use to decide whether to
 * consume or best-effort release quota — never re-derive it ad hoc.
 */

import {
  ACTIVE_CONNECTION_STATUSES,
  type ConnectionStatus,
  type ConnectionStatusReason,
} from "@chatbotx.io/database/partials"
import { ChatbotXException } from "../errors"

export type ConnectionEvent =
  | "connect.completed"
  | "auth.saved"
  | "refresh.transient_failure"
  | "verify.failed_non_auth"
  | "verify.ok"
  | "auth.revoked"
  | "user.disconnect"
  | "teardown.pause"
  | "teardown.resume"
  | "teardown.disconnect"

type ConnectionTransitionInput = {
  /** `undefined` when no `Connection` row exists yet (first `connect.completed`). */
  from: ConnectionStatus | undefined
  event: ConnectionEvent
  reason?: ConnectionStatusReason
}

type ConnectionTransitionResult = {
  to: ConnectionStatus
  reason: ConnectionStatusReason | null
  /** `null` = no quota change; `"consume"`/`"release"` = the edge callers must act on exactly once. */
  quotaEdge: "consume" | "release" | null
  /** Idempotent no-op: `to === from`, event carried no real state change. */
  noop: boolean
}

export const isActiveConnectionStatus = (status: ConnectionStatus): boolean =>
  (ACTIVE_CONNECTION_STATUSES as readonly ConnectionStatus[]).includes(status)

export class InvalidConnectionTransitionException extends ChatbotXException {
  constructor(from: ConnectionStatus | undefined, event: ConnectionEvent) {
    super(
      `Connection cannot handle event "${event}" from status "${from ?? "∅"}"`,
      "connectionInactive",
      409,
    )
  }
}

const quotaEdgeFor = (
  from: ConnectionStatus | undefined,
  to: ConnectionStatus,
): "consume" | "release" | null => {
  const wasActive = from !== undefined && isActiveConnectionStatus(from)
  const isActive = isActiveConnectionStatus(to)
  if (!wasActive && isActive) {
    return "consume"
  }
  if (wasActive && !isActive) {
    return "release"
  }
  return null
}

const result = (
  from: ConnectionStatus | undefined,
  to: ConnectionStatus,
  reason: ConnectionStatusReason | null,
): ConnectionTransitionResult => ({
  to,
  reason,
  quotaEdge: quotaEdgeFor(from, to),
  noop: from === to,
})

/**
 * Resolve one event against the current status. Throws
 * {@link InvalidConnectionTransitionException} only for `auth.saved`,
 * `refresh.transient_failure`, `verify.failed_non_auth`, and `verify.ok`
 * against an INACTIVE status (`connectionInactive`, HTTP 409). Every other
 * unmodeled combination is an idempotent no-op that returns the current status.
 */
export const transitionConnection = (
  input: ConnectionTransitionInput,
): ConnectionTransitionResult => {
  const { from, event, reason } = input

  switch (event) {
    case "connect.completed": {
      if (from === "connected") {
        return result(from, from, null)
      }
      return result(from, "connected", null)
    }
    case "auth.saved": {
      if (from === undefined || !isActiveConnectionStatus(from)) {
        throw new InvalidConnectionTransitionException(from, event)
      }
      return result(from, "connected", null)
    }
    case "refresh.transient_failure":
    case "verify.failed_non_auth": {
      if (from === undefined || !isActiveConnectionStatus(from)) {
        throw new InvalidConnectionTransitionException(from, event)
      }
      return result(from, "degraded", reason ?? "refresh_failed")
    }
    case "verify.ok": {
      if (from === undefined || !isActiveConnectionStatus(from)) {
        throw new InvalidConnectionTransitionException(from, event)
      }
      return result(from, "connected", null)
    }
    case "auth.revoked": {
      if (from === undefined || !isActiveConnectionStatus(from)) {
        return result(from, from ?? "needs_reauth", null)
      }
      return result(from, "needs_reauth", reason ?? "token_revoked")
    }
    case "user.disconnect": {
      if (from === undefined) {
        return result(from, "disconnected", "manual")
      }
      // Already disconnected: a no-op re-assertion must preserve whatever
      // reason/`disconnectedAt` is already stored (M-2), not overwrite it
      // with `manual` just because this event fired again.
      if (from === "disconnected") {
        return result(from, from, null)
      }
      return result(from, "disconnected", reason ?? "manual")
    }
    case "teardown.pause": {
      if (from === undefined || !isActiveConnectionStatus(from)) {
        return result(from, from ?? "paused", null)
      }
      return result(from, "paused", reason ?? "trial_expired")
    }
    case "teardown.resume": {
      if (from !== "paused") {
        return result(from, from ?? "paused", null)
      }
      return result(from, "connected", null)
    }
    case "teardown.disconnect": {
      // Already disconnected: same preserve-on-no-op rule as user.disconnect
      // above (M-2) — repeated teardown must not stomp the stored reason.
      if (from === "disconnected") {
        return result(from, from, null)
      }
      return result(from, "disconnected", reason ?? "workspace_purge")
    }
    default: {
      const _exhaustive: never = event
      throw new InvalidConnectionTransitionException(from, _exhaustive)
    }
  }
}
