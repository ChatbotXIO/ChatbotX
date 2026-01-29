import { SdkException } from "@aha.chat/sdk"
import type { Common as GoogleApisCommon } from "googleapis"
import { googleSheetsLogger } from "./logger"

export const handleError = (error: unknown) => {
  if (!(error instanceof Error)) {
    throw new SdkException(`Unknown error: ${error}`)
  }

  const googleError = _extractGoogleApiError(error)
  const finalMessage = googleError ?? error.message

  googleSheetsLogger.error(
    { err: error },
    "client.getToken failed: %s",
    finalMessage,
  )

  throw new SdkException(`Google Sheets API error: ${finalMessage}`)
}

const _extractGoogleApiError = (error: Error) =>
  _isGaxiosError(error)
    ? error.errors
        .map((err: { message: string }) => err.message)
        .join(", ")
        .replaceAll(/Invalid requests\[0\].[a-zA-Z]+:/g, "")
    : null

type AggregateGAxiosError = GoogleApisCommon.GaxiosError & { errors: Error[] }

const _isGaxiosError = (error: Error): error is AggregateGAxiosError =>
  "errors" in error && Array.isArray(error.errors)
