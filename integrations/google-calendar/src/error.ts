import { SdkException } from "@chatbotx.io/sdk"
import type { Common as GoogleApisCommon } from "googleapis"
import { normalizeError } from "universal-error-normalizer"
import { googleCalendarLogger } from "./logger"

export const handleError = (error: unknown, context: string): never => {
  if (!(error instanceof Error)) {
    throw new SdkException(
      `Unknown Google Calendar API error: ${String(error)}`,
    )
  }

  const googleError = extractGoogleApiError(error)
  const finalMessage = googleError ?? error.message

  googleCalendarLogger.error(
    { err: normalizeError(error), context },
    "Google Calendar API error: %s",
    finalMessage,
  )

  throw new SdkException(`Google Calendar API error: ${finalMessage}`)
}

const extractGoogleApiError = (error: Error) =>
  isGaxiosError(error)
    ? error.errors
        .map((err) => err.message)
        .filter(Boolean)
        .join(", ")
    : null

type AggregateGaxiosError = GoogleApisCommon.GaxiosError & {
  errors: { message?: string }[]
}

const isGaxiosError = (error: Error): error is AggregateGaxiosError =>
  "errors" in error && Array.isArray(error.errors)
