import { SdkException } from "@chatbotx.io/sdk"
import { isHTTPError } from "ky"

const FALLBACK_HTTP_STATUS = 400

type ErrorBody = {
  message?: string
  error?: string
  error_description?: string
}

export type ChannelErrorSource = {
  httpStatusCode: number
  code?: number | string
  subCode?: number | string | null
  type?: string
  message?: string
}

function asObject<T>(value: unknown): T | undefined {
  return typeof value === "object" && value !== null ? (value as T) : undefined
}

export class LineException extends SdkException {
  constructor(
    message: string,
    httpStatusCode: number = FALLBACK_HTTP_STATUS,
    code: string | number = "lineError",
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

export class LineAPIException extends LineException {}

export function parseOriginError(originError: unknown): ChannelErrorSource {
  if (isHTTPError(originError)) {
    const body = asObject<ErrorBody>(originError.data)
    return {
      httpStatusCode: originError.response.status,
      message: body?.message ?? body?.error_description,
      type: body?.error,
    }
  }
  return {
    httpStatusCode: FALLBACK_HTTP_STATUS,
    message: originError instanceof Error ? originError.message : undefined,
  }
}
