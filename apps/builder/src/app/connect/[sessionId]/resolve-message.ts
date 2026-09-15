import type { ConnectSessionStatus } from "@chatbotx.io/database/partials"

/**
 * Which message block `/connect/{sessionId}` shows for a given
 * `ConnectSession.status` (or `null` when the session id resolved to
 * nothing at all). `"pending"`/`"awaiting_selection"` are still-in-flight
 * states, mapped to `"processing"` (auto-refreshing), never `"failed"`.
 * `"authorized"` is a declared `ConnectSessionStatus` value with no writer
 * today — `attachAuthorization` (`packages/business/src/connect-session/service.ts`)
 * goes straight from `pending` to `awaiting_selection`, skipping it — kept
 * here (mapped the same as the other in-flight states) only so a future
 * intermediate step that DOES write it doesn't silently fall through to
 * `"failed"`. Every other value (including a genuinely unknown future
 * status) falls back to `"failed"` rather than silently misreporting
 * progress as success.
 *
 * Extracted as a pure function so this mapping — the one behavior in this
 * page with real branching to get wrong — is unit-testable without
 * `@testing-library/react` (not a dependency of this app) or a React
 * render harness.
 */
export type ConnectSessionMessageKind =
  | "invalid"
  | "processing"
  | "completed"
  | "cancelled"
  | "expired"
  | "failed"

export function resolveConnectSessionMessageKind(
  status: ConnectSessionStatus | null,
): ConnectSessionMessageKind {
  if (!status) {
    return "invalid"
  }
  switch (status) {
    case "pending":
    case "authorized":
    case "awaiting_selection":
      return "processing"
    case "completed":
      return "completed"
    case "cancelled":
      return "cancelled"
    case "expired":
      return "expired"
    default:
      return "failed"
  }
}
