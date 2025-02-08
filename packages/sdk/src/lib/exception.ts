export class SdkException extends Error {
  constructor(messages: string) {
    super(messages)

    Object.setPrototypeOf(this, SdkException.prototype)
  }

  static methodNotImplemented() {
    return new SdkException("Method is not implemented")
  }
}

export class IntegrationException extends SdkException {}

export class AuthException extends SdkException {}
