import { SdkException } from "@chatbotx.io/sdk"
import { isHTTPError } from "ky"
import { logger } from "./lib/logger"

function asObject<T>(value: unknown): T | undefined {
  return typeof value === "object" && value !== null ? (value as T) : undefined
}

const FALLBACK_HTTP_STATUS = 400

type ErrorBody = {
  error_code?: number
  description?: string
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
      code: body?.error_code,
      message: body?.description,
    }
  }

  const shaped = asObject<OriginShape>(originError)
  if (shaped?.httpStatus !== undefined) {
    const body = shaped.errorBody
    return {
      httpStatusCode: shaped.httpStatus,
      code: body?.error_code,
      message: body?.description,
    }
  }

  return {
    httpStatusCode: FALLBACK_HTTP_STATUS,
    message: originError instanceof Error ? originError.message : undefined,
  }
}

export class TelegramException extends SdkException {
  constructor(
    message: string,
    httpStatusCode: number = FALLBACK_HTTP_STATUS,
    code: string | number = "telegramError",
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

export class TelegramWebhookException extends TelegramException {
  readonly webhookData?: unknown

  constructor(message: string, webhookData?: unknown) {
    super(`Webhook error: ${message}`)
    this.webhookData = webhookData
  }
}

export class TelegramAPIException extends TelegramException {}

/**
 * Wraps an async API call with standardized Telegram error handling.
 * Unwraps typed exceptions one level so the raw Telegram error body is
 * preserved on `originError` for the mapToChannelError() step.
 */
export const rescue = async <T>(
  endpoint: string,
  fn: () => Promise<T>,
): Promise<T> => {
  try {
    return await fn()
  } catch (error) {
    logger.error(error, `Telegram API call failed: ${endpoint}`)

    let originError: unknown = error
    if (error instanceof TelegramException) {
      originError = error.getOriginError() ?? error
    }

    const sdkException = parseOriginError(originError)

    throw new TelegramAPIException(
      sdkException.message ?? endpoint,
      sdkException.httpStatusCode,
      sdkException.code,
      sdkException.subCode,
      sdkException.type,
      originError,
    )
  }
}
