import { SdkException, UNKNOWN_ERROR } from "../exception"
import { sdkLogger } from "../logger"
import type { ParsedError } from "../schemas"

export class MessengerSdkException extends SdkException {
  getErrorData(): Promise<ParsedError> {
    // biome-ignore lint/suspicious/noExplicitAny: <does not care about type>
    const originError = this.originError as any
    if (originError?.response) {
      const body = originError.response.error || originError.data

      const error = body?.error ?? {}

      if (!error) {
        sdkLogger.error("MessengerSdkException: No error in response", body)
      }

      return Promise.resolve({
        message: error?.message,
        code: error?.code,
        statusCode: error?.statusCode,
        subcode: error?.subcode || error.error_subcode,
      })
    }

    return Promise.resolve(UNKNOWN_ERROR)
  }
}
