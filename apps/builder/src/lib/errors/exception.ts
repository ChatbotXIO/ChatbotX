export class ChatbotXException extends Error {
  code: string
  httpStatusCode: number

  constructor(message: string, code = "sysmtemError", httpStatusCode = 400) {
    super(message)

    this.name = this.constructor.name
    this.code = code
    this.httpStatusCode = httpStatusCode

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ChatbotXException)
    }
  }
}

export const notFoundException = (message: string) => {
  return new ChatbotXException(message, "notFound", 404)
}
