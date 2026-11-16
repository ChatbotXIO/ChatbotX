import {
  type BucUsage,
  estimatedMinutesToMs,
  parseBucHeader,
} from "@chatbotx.io/integration-messenger/apis/usage"
import { readOriginError } from "../shared/http-retry"
import type { ContactScanUsageSignal } from "./adapter"

const BUC_HEADER = "x-business-use-case-usage"

/** The share of quota in use is the highest of the three figures Meta reports. */
export const peakUsagePercent = (figures: {
  callCount?: number
  totalCputime?: number
  totalTime?: number
}): number =>
  Math.max(
    figures.callCount ?? 0,
    figures.totalCputime ?? 0,
    figures.totalTime ?? 0,
  )

/** Business Use Case usage -> neutral signal; Meta's wait estimate is in minutes. */
export const bucUsageToSignal = (
  usage: BucUsage | null | undefined,
): ContactScanUsageSignal | null => {
  if (!usage) {
    return null
  }
  return {
    usagePercent: peakUsagePercent({
      callCount: usage.callCount,
      totalCputime: usage.totalCpuTime,
      totalTime: usage.totalTime,
    }),
    retryAfterMs: estimatedMinutesToMs(usage.estimatedTimeToRegainAccess),
  }
}

type HeaderReader = { get: (name: string) => string | null }

const isHeaderReader = (value: unknown): value is HeaderReader =>
  typeof value === "object" &&
  value !== null &&
  "get" in value &&
  typeof value.get === "function"

/**
 * The quota headers of a FAILED Graph call. They ride the error response, which
 * the integrations keep as the origin error (`getOriginError()`); the error's
 * own fields do not carry them.
 */
export const readBackoffFromErrorResponse = (
  error: unknown,
): ContactScanUsageSignal | null => {
  const origin = readOriginError(error)
  const response =
    typeof origin === "object" && origin !== null && "response" in origin
      ? origin.response
      : undefined
  const headers =
    typeof response === "object" && response !== null && "headers" in response
      ? response.headers
      : undefined
  if (!isHeaderReader(headers)) {
    return null
  }
  return bucUsageToSignal(parseBucHeader(headers.get(BUC_HEADER)))
}
