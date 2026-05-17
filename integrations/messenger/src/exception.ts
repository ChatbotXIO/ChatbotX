import { SdkException } from "@chatbotx.io/sdk"
import { isHTTPError } from "ky"
import { logger } from "./lib/logger"

function asObject<T>(value: unknown): T | undefined {
  return typeof value === "object" && value !== null ? (value as T) : undefined
}

const FALLBACK_HTTP_STATUS = 400

type ErrorBody = {
  error?: {
    code?: number
    type?: string
    message?: string
    error_subcode?: number | string
    subcode?: number | string
  }
}
type OriginShape = { httpStatus?: number; errorBody?: ErrorBody }
type ExplicitShape = { response?: { error?: ErrorBody["error"] } }

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
    const err = body?.error
    return {
      httpStatusCode: originError.response.status,
      code: err?.code,
      subCode: err?.error_subcode ?? err?.subcode,
      type: err?.type,
      message: err?.message,
    }
  }

  const shaped = asObject<OriginShape>(originError)
  if (shaped?.httpStatus !== undefined) {
    const err = shaped.errorBody?.error
    return {
      httpStatusCode: shaped.httpStatus,
      code: err?.code,
      subCode: err?.error_subcode ?? err?.subcode,
      type: err?.type,
      message: err?.message,
    }
  }

  const explicit = asObject<ExplicitShape>(originError)

  if (explicit?.response?.error) {
    const err = explicit.response.error
    return {
      httpStatusCode: FALLBACK_HTTP_STATUS,
      code: err.code,
      subCode: err.error_subcode ?? err.subcode,
      type: err.type,
      message: err.message,
    }
  }
  return {
    httpStatusCode: FALLBACK_HTTP_STATUS,
    message: originError instanceof Error ? originError.message : undefined,
  }
}

export class MessengerException extends SdkException {
  constructor(
    message: string,
    httpStatusCode: number = FALLBACK_HTTP_STATUS,
    code: string | number = "messengerError",
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

export class MessengerAttachmentException extends MessengerException {
  readonly attachmentUrl?: string

  constructor(message: string, attachmentUrl?: string) {
    super(`Attachment error: ${message}`)
    this.attachmentUrl = attachmentUrl
  }
}

export class MessengerWebhookException extends MessengerException {
  readonly webhookData?: unknown

  constructor(message: string, webhookData?: unknown) {
    super(`Webhook error: ${message}`)
    this.webhookData = webhookData
  }
}

export class MessengerAPIException extends MessengerException {}

/**
 * Wraps an async API call with standardized Messenger error handling.
 * Unwraps typed exceptions one level so the raw FB Graph error body is
 * preserved on `originError` for the mapToChannelError() step.
 */
export const rescue = async <T>(
  endpoint: string,
  fn: () => Promise<T>,
): Promise<T> => {
  try {
    return await fn()
  } catch (error) {
    logger.error(error, `Messenger API call failed: ${endpoint}`)

    let originError: unknown = error
    if (error instanceof MessengerException) {
      originError = error.getOriginError() ?? error
    }

    const sdkException = parseOriginError(originError)

    throw new MessengerAPIException(
      sdkException.message ?? endpoint,
      sdkException.httpStatusCode,
      sdkException.code,
      sdkException.subCode,
      sdkException.type,
      originError,
    )
  }
}
