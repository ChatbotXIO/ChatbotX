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

/**
 * Thrown when an OAuth2 token refresh has failed terminally — the refresh
 * token is revoked, the integration is misconfigured, or all retry attempts
 * have been exhausted. Callers should surface this as a "reconnect required"
 * state to the user; the SDK will also call `ctx.authStore.markOffline` when
 * available.
 */
export class AuthRefreshException extends SdkException {
  constructor(message: string, originError?: Error | unknown) {
    super(message, "authRefreshFailed", 401)
    if (originError) {
      this.setOriginError(originError)
    }
  }
}
