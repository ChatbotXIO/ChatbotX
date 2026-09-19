import { SdkException } from "@chatbotx.io/sdk"
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
    if (error instanceof TiktokAPIException) {
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
