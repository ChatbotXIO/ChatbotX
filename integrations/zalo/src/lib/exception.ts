import { SdkException } from "@chatbotx.io/sdk"
import { isHTTPError } from "ky"

const FALLBACK_HTTP_STATUS = 400

function asObject<T>(value: unknown): T | undefined {
  return typeof value === "object" && value !== null ? (value as T) : undefined
}

type ErrorBody = {
  error?: number
  message?: string
}
type OriginShape = { httpStatus?: number; errorBody?: ErrorBody }
type ExplicitShape = { response?: { error?: ErrorBody } }

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
      code: body?.error,
      message: body?.message,
    }
  }

  const shaped = asObject<OriginShape>(originError)
  if (shaped?.httpStatus !== undefined) {
    const body = shaped.errorBody
    return {
      httpStatusCode: shaped.httpStatus,
      code: body?.error,
      message: body?.message,
    }
  }

  const explicit = asObject<ExplicitShape>(originError)
  if (explicit?.response?.error) {
    const body = explicit.response.error
    return {
      httpStatusCode: FALLBACK_HTTP_STATUS,
      code: body.error,
      message: body.message,
    }
  }

  return {
    httpStatusCode: FALLBACK_HTTP_STATUS,
    message: originError instanceof Error ? originError.message : undefined,
  }
}

export class ZaloException extends SdkException {
  constructor(
    message: string,
    httpStatusCode: number = FALLBACK_HTTP_STATUS,
    code: string | number = "zaloError",
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
 * Wraps an async function with standardized error handling
 */
export const handleZaloError = async <T>(
  operation: string,
  fn: () => Promise<T>,
): Promise<T> => {
  try {
    return await fn()
  } catch (error) {
    if (error instanceof ZaloException) {
      throw error
    }
    const sdkException = parseOriginError(error)

    throw new ZaloException(
      sdkException.message ?? `${operation} failed`,
      sdkException.httpStatusCode,
      sdkException.code,
      sdkException.subCode,
      sdkException.type,
      error,
    )
  }
}
