import { SdkException } from "@chatbotx.io/sdk"
import { isHTTPError } from "ky"
import { logger } from "./lib/logger"

const FALLBACK_HTTP_STATUS = 400

function asObject<T>(value: unknown): T | undefined {
  return typeof value === "object" && value !== null ? (value as T) : undefined
}

// Meta Cloud API nests the human-readable reason under `error_data.details`,
// e.g. "Parameter name is missing or empty" for a (#100) named-template error.
type MetaErrorData = { messaging_product?: string; details?: string }
type MetaError = {
  code?: number
  status?: number
  type?: string
  message?: string
  error_subcode?: number | string
  error_data?: MetaErrorData | number | string
  error_user_title?: string
  error_user_msg?: string
  fbtrace_id?: string
}
type ErrorBody = { error?: MetaError }
type OriginShape = { httpStatus?: number; errorBody?: ErrorBody }
type ExplicitShape = { response?: { error?: MetaError } }

function readErrorDetails(
  errorData: MetaError["error_data"],
): string | undefined {
  return typeof errorData === "object" && errorData !== null
    ? errorData.details
    : undefined
}

/** True for a bare Meta error object ({ code, type, ... }) — the shape the raw
 * send path throws directly, which the wrapper branches below do not match. */
function isMetaError(value: MetaError | undefined): value is MetaError {
  return (
    value !== undefined &&
    (value.code !== undefined ||
      value.type !== undefined ||
      value.error_subcode !== undefined)
  )
}

export type ChannelErrorSource = {
  httpStatusCode: number
  code?: number | string
  subCode?: number | string | null
  type?: string
  message?: string
  userTitle?: string
  userMessage?: string
  fbtraceId?: string
}

function parseErrorBody(
  err: MetaError | undefined,
): Omit<ChannelErrorSource, "httpStatusCode"> {
  return {
    code: err?.code,
    subCode: err?.error_subcode ?? null,
    type: err?.type,
    message: err?.message,
    userTitle: err?.error_user_title,
    userMessage: err?.error_user_msg ?? readErrorDetails(err?.error_data),
    fbtraceId: err?.fbtrace_id,
  }
}

export function parseOriginError(originError: unknown): ChannelErrorSource {
  if (isHTTPError(originError)) {
    const body = asObject<ErrorBody>(originError.data)
    const err = body?.error

    return {
      httpStatusCode: err?.status ?? originError.response.status,
      ...parseErrorBody(err),
    }
  }

  const shaped = asObject<OriginShape>(originError)
  if (shaped?.httpStatus !== undefined) {
    const err = shaped.errorBody?.error
    return {
      httpStatusCode: err?.status ?? shaped.httpStatus,
      ...parseErrorBody(err),
    }
  }

  const explicit = asObject<ExplicitShape>(originError)
  if (explicit?.response?.error) {
    const err = explicit.response.error
    return {
      httpStatusCode: err.status ?? FALLBACK_HTTP_STATUS,
      ...parseErrorBody(err),
    }
  }

  // The raw send path throws Meta's error object directly (not wrapped), so
  // read it here rather than dropping its code/message into the fallback.
  const bareError = asObject<MetaError>(originError)
  if (isMetaError(bareError)) {
    return {
      httpStatusCode: bareError.status ?? FALLBACK_HTTP_STATUS,
      ...parseErrorBody(bareError),
    }
  }

  return {
    httpStatusCode: FALLBACK_HTTP_STATUS,
    message: originError instanceof Error ? originError.message : undefined,
  }
}

export class WhatsappException extends SdkException {
  constructor(
    message: string,
    httpStatusCode: number = FALLBACK_HTTP_STATUS,
    code: string | number = "whatsappError",
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
 * Wraps an async API call with standardized WhatsApp error handling.
 * Unwraps typed exceptions one level so the raw WA Cloud API error body is
 * preserved on `originError` for the mapToChannelError() step.
 */
export const rescue = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn()
  } catch (error) {
    logger.error(error, "WhatsApp API call failed")

    let originError: unknown = error
    if (error instanceof WhatsappException) {
      originError = error.getOriginError() ?? error
    }

    const sdkException = parseOriginError(originError)

    throw new WhatsappException(
      sdkException.message ?? "WhatsApp API call failed",
      sdkException.httpStatusCode,
      sdkException.code,
      sdkException.subCode,
      sdkException.type,
      originError,
    )
  }
}
