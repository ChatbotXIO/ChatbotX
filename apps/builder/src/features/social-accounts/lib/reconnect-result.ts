import {
  RECONNECT_ERROR_REASONS,
  type ReconnectErrorReason,
} from "@/lib/channel-reconnect"

export type ReconnectOutcome =
  | { ok: true }
  | { ok: false; reason: ReconnectErrorReason }

/** Reads `?reconnect=success|error&reason=` off the URL a reconnect callback returned to. */
export const readReconnectOutcome = (
  searchParams: Pick<URLSearchParams, "get">,
): ReconnectOutcome | null => {
  const result = searchParams.get("reconnect")
  if (result === "success") {
    return { ok: true }
  }
  if (result !== "error") {
    return null
  }
  const reason = searchParams.get("reason")
  return {
    ok: false,
    reason:
      RECONNECT_ERROR_REASONS.find((candidate) => candidate === reason) ??
      "failed",
  }
}

/** Reconnect failure text, by reason. */
export const RECONNECT_ERROR_KEYS = {
  accountNotFound: "channels.reconnect.errors.accountNotFound",
  cancelled: "channels.reconnect.errors.cancelled",
  failed: "channels.reconnect.errors.failed",
  notFound: "channels.reconnect.errors.notFound",
  pageNotFound: "channels.reconnect.errors.pageNotFound",
} as const satisfies Record<ReconnectErrorReason, string>
