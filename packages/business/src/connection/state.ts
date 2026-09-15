/**
 * Pure Connection status state machine — zero imports beyond the enum types,
 * so it can be unit-tested without a database and reused by both
 * `ConnectionStateService.transition` (DB writes + audit) and any future
 * dry-run/preview caller.
 *
 * Families: ACTIVE = `connected | degraded` (quota held, `Inbox.status =
 * connected`). INACTIVE = `needs_reauth | paused | disconnected` (quota
 * released, `Inbox.status = disconnected`).
 *
 * Invariant: quota is consumed exactly on an INACTIVE/absent → ACTIVE edge
 * and released exactly on ACTIVE → INACTIVE, nowhere else. `quotaEdge` below
 * is the single source of truth callers use to decide whether to
 * consume/release quota — never re-derive it ad hoc.
 */
import {
  ACTIVE_CONNECTION_STATUSES,
  type ConnectionStatus,
  type ConnectionStatusReason,
} from "@chatbotx.io/database/partials"

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

export type ConnectionTransitionInput = {
  /** `undefined` when no `Connection` row exists yet (first `connect.completed`). */
  from: ConnectionStatus | undefined
  event: ConnectionEvent
  reason?: ConnectionStatusReason
}

export type ConnectionTransitionResult = {
  to: ConnectionStatus
  reason: ConnectionStatusReason | null
  /** `null` = no quota change; `"consume"`/`"release"` = the edge callers must act on exactly once. */
  quotaEdge: "consume" | "release" | null
  /** Idempotent no-op: `to === from`, event carried no real state change. */
  noop: boolean
}

export const isActiveConnectionStatus = (status: ConnectionStatus): boolean =>
  (ACTIVE_CONNECTION_STATUSES as readonly ConnectionStatus[]).includes(status)

class InvalidConnectionTransitionException extends Error {
  constructor(from: ConnectionStatus | undefined, event: ConnectionEvent) {
    super(
      `Connection cannot handle event "${event}" from status "${from ?? "∅"}"`,
    )
    this.name = "InvalidConnectionTransitionException"
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
 * {@link InvalidConnectionTransitionException} only for `refresh`/`verify`
 * events fired against an INACTIVE status (409 `CONNECTION_INACTIVE` at the
 * API layer) — every other unmodeled combination is an idempotent no-op that
 * returns the current status unchanged.
 */
export const transitionConnection = (
  input: ConnectionTransitionInput,
): ConnectionTransitionResult => {
  const { from, event, reason } = input

  switch (event) {
    case "connect.completed": {
      if (
        from !== undefined &&
        from !== "disconnected" &&
        from !== "needs_reauth"
      ) {
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
      return result(from, "disconnected", reason ?? "workspace_purge")
    }
    default: {
      const _exhaustive: never = event
      throw new InvalidConnectionTransitionException(from, _exhaustive)
    }
  }
}
