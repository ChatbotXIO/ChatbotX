import type { ParsedError } from "./schemas"

export const UNKNOWN_ERROR: ParsedError = {
  message: "Unknown error. Please contact support team for assistance.",
  code: -1,
  statusCode: -1,
  subcode: -1,
}

export class SdkException extends Error {
  code: string | number
  httpStatusCode: number
  subCode?: string | number | null
  originError?: Error

  constructor(
    message: string,
    code = "sysmtemError",
    httpStatusCode = 400,
    subCode = null,
  ) {
    super(message)

    this.name = this.constructor.name
    this.code = code
    this.httpStatusCode = httpStatusCode
    this.subCode = subCode

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SdkException)
    }
  }

  static methodNotImplemented() {
    return new SdkException("Method is not implemented")
  }

  setOriginError(originError: Error | unknown) {
    this.originError = originError as Error

    return this
  }

  async getErrorData(): Promise<ParsedError> {
    return await Promise.resolve({
      message: this.message,
      code: this.code,
      statusCode: this.httpStatusCode,
      subcode: this.subCode,
    } as ParsedError)
  }
}

export class IntegrationException extends SdkException {}

export class AuthException extends SdkException {}
