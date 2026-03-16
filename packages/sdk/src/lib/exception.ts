export class SdkException extends Error {
  code: string
  httpStatusCode: number

  constructor(message: string, code = "sysmtemError", httpStatusCode = 400) {
    super(message)

    this.name = this.constructor.name
    this.code = code
    this.httpStatusCode = httpStatusCode

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SdkException)
    }
  }

  static methodNotImplemented() {
    return new SdkException("Method is not implemented")
  }
}

export class IntegrationException extends SdkException {}

export class AuthException extends SdkException {}
