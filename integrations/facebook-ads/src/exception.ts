import { SdkException, UNKNOWN_ERROR } from "@chatbotx.io/sdk"
import { formatGraphError } from "@chatbotx.io/utils/graph-error"
import { isHTTPError } from "ky"
import { facebookAdsLogger } from "./logger"

const FALLBACK_HTTP_STATUS = 400

type GraphErrorBody = {
  error?: {
    code?: number
    type?: string
    message?: string
    error_user_title?: string
    error_user_msg?: string
    error_subcode?: number | string
  }
}

function asObject<T>(value: unknown): T | undefined {
  return typeof value === "object" && value !== null ? (value as T) : undefined
}

export class FacebookAdsException extends SdkException {
  constructor(
    message: string,
    httpStatusCode: number = FALLBACK_HTTP_STATUS,
    code: string | number = "facebookAdsError",
    subCode?: string | number | null,
    type?: string,
    originError?: unknown,
  ) {
    super(message, code, httpStatusCode, subCode, type)
    if (originError !== undefined) {
      this.setOriginError(originError)
    }
  }
}

/**
 * The numeric Graph API error code of a failed call, if the error carries one
 * (e.g. 190 = expired/invalidated token).
 */
export function getGraphErrorCode(error: unknown): number | undefined {
  if (error instanceof FacebookAdsException && typeof error.code === "number") {
    return error.code
  }
  return
}

/** Wraps an async Graph API call with standardized error handling. */
export const rescue = async <T>(
  endpoint: string,
  fn: () => Promise<T>,
): Promise<T> => {
  try {
    return await fn()
  } catch (error) {
    // Never pass Ky's raw HTTPError to Pino: its enumerable options can include
    // the JSON request body and therefore the Meta access token. Log only the
    // safe, structured fields below.
    facebookAdsLogger.error(
      {
        endpoint,
        status: isHTTPError(error) ? error.response.status : undefined,
      },
      "Facebook Ads API call failed",
    )

    if (error instanceof FacebookAdsException) {
      throw error
    }

    if (isHTTPError(error)) {
      const err = asObject<GraphErrorBody>(error.data)?.error
      throw new FacebookAdsException(
        formatGraphError(err) ?? UNKNOWN_ERROR.message,
        error.response.status,
        err?.code ?? "facebookAdsError",
        err?.error_subcode,
        err?.type,
      )
    }

    throw new FacebookAdsException(
      error instanceof Error ? error.message : UNKNOWN_ERROR.message,
      FALLBACK_HTTP_STATUS,
      "facebookAdsError",
      undefined,
      undefined,
    )
  }
}
