import { appendRedirectSearchParams } from "@/lib/channel-reconnect"

/** Channels whose Conversions API connect is a Facebook OAuth round trip (WhatsApp uses a popup instead). */
export const CAPI_OAUTH_CHANNELS = ["messenger", "instagram"] as const

export type CapiOAuthChannel = (typeof CAPI_OAUTH_CHANNELS)[number]

const CAPI_CONNECT_ERROR_REASONS = [
  "cancelled",
  "notFound",
  "pageNotFound",
  "accountNotFound",
  "datasetFailed",
  "sessionExpired",
  "failed",
] as const

export type CapiConnectErrorReason = (typeof CAPI_CONNECT_ERROR_REASONS)[number]

/**
 * Outcome of the dedicated Conversions API connect. Handlers return it instead
 * of redirecting so a try/catch around Graph calls can never swallow the
 * NEXT_REDIRECT control-flow error — the OAuth callback owns every redirect.
 */
export type CapiConnectResult =
  | { status: "success" }
  | { status: "error"; reason: CapiConnectErrorReason }

const CAPI_CONNECT_RESULT_PARAM = "capiConnect"
const CAPI_CONNECT_REASON_PARAM = "capiReason"

/** Where the OAuth callback sends the admin back to: the Ads tab, carrying the outcome. */
export function buildCapiConnectRedirectUrl(
  safeReferer: string,
  result: CapiConnectResult,
): string {
  return appendRedirectSearchParams(
    safeReferer,
    result.status === "success"
      ? { [CAPI_CONNECT_RESULT_PARAM]: "success" }
      : {
          [CAPI_CONNECT_RESULT_PARAM]: "error",
          [CAPI_CONNECT_REASON_PARAM]: result.reason,
        },
  )
}

/** Reads the outcome back off the Ads tab URL; `null` when the page was not reached from a connect. */
export function readCapiConnectResult(
  searchParams: Pick<URLSearchParams, "get">,
): CapiConnectResult | null {
  const result = searchParams.get(CAPI_CONNECT_RESULT_PARAM)
  if (result === "success") {
    return { status: "success" }
  }
  if (result !== "error") {
    return null
  }
  const reason = searchParams.get(CAPI_CONNECT_REASON_PARAM)
  return {
    status: "error",
    reason:
      CAPI_CONNECT_ERROR_REASONS.find((candidate) => candidate === reason) ??
      "failed",
  }
}
