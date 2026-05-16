import {
  type ChannelErrorCategory,
  PERMANENT_CATEGORIES,
  RETRYABLE_CATEGORIES,
} from "./channel-error-codes"
import { SdkException, UNKNOWN_ERROR } from "./exception"

export type ChannelErrorOptions = {
  code?: string | number
  httpStatusCode?: number
  subCode?: string | number | null
  type?: string
}

export class ChannelError extends SdkException {
  readonly category: ChannelErrorCategory
  readonly isRetryable: boolean
  readonly isPermanent: boolean

  constructor(
    message: string,
    category: ChannelErrorCategory,
    options: ChannelErrorOptions = {},
  ) {
    const {
      code = UNKNOWN_ERROR.code,
      httpStatusCode = 400,
      subCode = null,
      type,
    } = options

    super(message, "channelError", httpStatusCode, null, type)
    this.code = code
    this.subCode = subCode
    this.category = category
    this.isRetryable = RETRYABLE_CATEGORIES.has(category)
    this.isPermanent = PERMANENT_CATEGORIES.has(category)
  }
}
