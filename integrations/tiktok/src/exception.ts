import { AuthException, SdkException } from "@chatbotx.io/sdk"
import { isHTTPError } from "ky"
import { logger } from "./lib/logger"

function asObject<T>(value: unknown): T | undefined {
  return typeof value === "object" && value !== null ? (value as T) : undefined
}

const FALLBACK_HTTP_STATUS = 400

type ErrorBody = {
  error?: {
    code?: string | number
    message?: string
    log_id?: string
  }
}

type OriginShape = { httpStatus?: number; errorBody?: ErrorBody }

export type ChannelErrorSource = {
  httpStatusCode: number
  code?: number | string
  subCode?: number | string | null
  type?: string
  message?: string
}

export function parseOriginError(originError: unknown): ChannelErrorSource {
  if (isHTTPError(originError)) {
    const body = asObject<ErrorBody>(originError.data)
    return {
      httpStatusCode: originError.response.status,
      code: body?.error?.code,
      message: body?.error?.message,
    }
  }

  const shaped = asObject<OriginShape>(originError)
  if (shaped?.httpStatus !== undefined) {
    const body = shaped.errorBody
    return {
      httpStatusCode: shaped.httpStatus,
      code: body?.error?.code,
      message: body?.error?.message,
    }
  }

  return {
    httpStatusCode: FALLBACK_HTTP_STATUS,
    message: originError instanceof Error ? originError.message : undefined,
  }
}

export class TiktokException extends SdkException {
  constructor(
    message: string,
    httpStatusCode: number = FALLBACK_HTTP_STATUS,
    code: string | number = "tiktokError",
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

export class TiktokWebhookException extends TiktokException {
  readonly webhookData?: unknown

  constructor(message: string, webhookData?: unknown) {
    super(`Webhook error: ${message}`)
    this.webhookData = webhookData
  }
}

export class TiktokAPIException extends TiktokException {}

/**
 * TikTok rejected the access token itself — it expired (they live 24 hours) or
 * was replaced by a newer one.
 *
 * An `AuthException`, not a `TiktokAPIException`, because that is the one
 * error the SDK's `invokeWithRefresh` answers by refreshing the token and
 * retrying. Before this existed every TikTok failure was a
 * `TiktokAPIException`, so an expired token was never refreshed on demand and
 * comment automation stayed silent until the scheduled refresh ran (#1754).
 *
 * Never thrown by the refresh call itself: a refresh that fails means the
 * refresh token is bad, which no further refresh can fix.
 */
export class TiktokAuthException extends AuthException {
  constructor(
    message: string,
    httpStatusCode: number,
    code: string | number,
    originError?: unknown,
  ) {
    super(message, code, httpStatusCode)
    this.name = "TiktokAuthException"
    if (originError !== undefined) {
      this.setOriginError(originError)
    }
  }
}

/**
 * Business API `code` for "Access token is incorrect or has been revoked."
 * — the answer an expired token gets (#1754). The message patterns below catch
 * it too, so a wrong number here costs nothing but the second signal.
 */
const TIKTOK_BUSINESS_INVALID_ACCESS_TOKEN_CODE = 40_105

const ACCESS_TOKEN_REJECTED_PATTERNS = [
  // Business API (business-api.tiktok.com)
  "access token is incorrect",
  "access token has expired",
  "access token is expired",
  // Open API (open.tiktokapis.com) error codes
  "access_token_invalid",
  "access_token_expired",
]

const HTTP_UNAUTHORIZED = 401

/** Whether TikTok refused the call because of the access token. */
export function isAccessTokenRejection(source: ChannelErrorSource): boolean {
  if (source.httpStatusCode === HTTP_UNAUTHORIZED) {
    return true
  }
  if (Number(source.code) === TIKTOK_BUSINESS_INVALID_ACCESS_TOKEN_CODE) {
    return true
  }
  const text = `${source.code ?? ""} ${source.message ?? ""}`.toLowerCase()
  return ACCESS_TOKEN_REJECTED_PATTERNS.some((pattern) =>
    text.includes(pattern),
  )
}

/**
 * Throws for a Business API answer whose `code` is not 0.
 *
 * The Business API answers HTTP 200 even when it rejects the call, so the
 * verdict and TikTok's own error number live in the body. Both are kept on the
 * thrown error, and a rejected access token becomes a `TiktokAuthException`.
 */
export function throwBusinessApiError(
  response: { code: number; message?: string },
  fallbackMessage: string,
): never {
  const message = response.message || fallbackMessage
  const source: ChannelErrorSource = {
    httpStatusCode: FALLBACK_HTTP_STATUS,
    code: response.code,
    message,
  }
  if (isAccessTokenRejection(source)) {
    throw new TiktokAuthException(message, HTTP_UNAUTHORIZED, response.code)
  }
  throw new TiktokAPIException(message, FALLBACK_HTTP_STATUS, response.code)
}

/** The `code` the OAuth callback matches on to turn this into a toast. */
export const TIKTOK_MISSING_SCOPES_CODE = "tiktokMissingScopes"

/**
 * The user completed the authorize flow but withheld a scope the channel
 * cannot work without.
 *
 * TikTok's consent screen lets each permission be unticked individually, so
 * this is an ordinary outcome, not an attack or a bug — the connection is
 * refused before anything is persisted and the caller is sent back with a
 * toast asking them to accept every permission.
 *
 * Thrown from `handlers/callback.ts` OUTSIDE `rescue()`, which would otherwise
 * re-wrap it into a `TiktokAPIException` and lose both the code and the list.
 */
export class TiktokMissingScopesError extends TiktokException {
  readonly missingScopes: string[]

  constructor(missingScopes: string[]) {
    super(
      `TikTok authorization is missing required scopes: ${missingScopes.join(", ")}`,
      FALLBACK_HTTP_STATUS,
      TIKTOK_MISSING_SCOPES_CODE,
    )
    this.name = "TiktokMissingScopesError"
    this.missingScopes = missingScopes
  }
}

export const rescue = async <T>(
  endpoint: string,
  fn: () => Promise<T>,
): Promise<T> => {
  try {
    return await fn()
  } catch (error) {
    // A `TiktokAuthException` must reach the SDK as-is: re-wrapping it would
    // turn "refresh and retry" back into a plain failure.
    if (
      error instanceof TiktokAPIException ||
      error instanceof TiktokAuthException
    ) {
      throw error
    }

    logger.error(error, `TikTok API call failed: ${endpoint}`)

    let originError: unknown = error
    if (error instanceof TiktokException) {
      originError = error.getOriginError() ?? error
    }

    const sdkException = parseOriginError(originError)

    throw new TiktokAPIException(
      sdkException.message ?? endpoint,
      sdkException.httpStatusCode,
      sdkException.code,
      sdkException.subCode,
      sdkException.type,
      originError,
    )
  }
}
