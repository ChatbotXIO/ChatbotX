import { SdkException, UNKNOWN_ERROR } from "../exception"
import type { ParsedError } from "../schemas"

export class MessengerSdkException extends SdkException {
  async getErrorData(): Promise<ParsedError> {
    // biome-ignore lint/suspicious/noExplicitAny: <does not care about type>
    const originError = this.originError as any
    if (originError?.response) {
      const body =
        originError.response.error || (await originError.response.json())

      const error = body?.error ?? {}

      if (!error) {
        console.error("MessengerSdkException: No error in response", body)
      }

      return {
        message: error?.message,
        code: error?.code,
        statusCode: error?.statusCode,
        subcode: error?.subcode,
      }
    }

    return UNKNOWN_ERROR
  }
}
