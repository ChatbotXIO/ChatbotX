export class ChatbotXException extends Error {
  code = "systemError"
  httpStatusCode = 400

  constructor(message: string, code?: string, httpStatusCode?: number) {
    super(message)

    this.name = this.constructor.name
    if (code) {
      this.code = "systemError"
    }
    if (httpStatusCode) {
      this.httpStatusCode = httpStatusCode
    }

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ChatbotXException)
    }
  }
}

export const notFoundException = (message: string) => {
  return new ChatbotXException(message, "notFound", 404)
}
