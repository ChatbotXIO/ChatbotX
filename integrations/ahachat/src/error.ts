import { SdkException } from "@chatbotx.io/sdk"

/**
 * Why an AhaChat call failed, classified once here so callers branch on a
 * code instead of HTTP details. The message never carries a key, a signature,
 * request headers or the response body.
 */
export const ahachatErrorCodes = [
  "notConfigured",
  "unauthorized",
  "notFound",
  "rateLimited",
  "invalidRequest",
  "serverError",
  "network",
  "timeout",
  "redirect",
  "invalidResponse",
  "responseTooLarge",
] as const
export type AhachatErrorCode = (typeof ahachatErrorCodes)[number]

export class AhachatApiError extends SdkException {
  readonly code: AhachatErrorCode
  readonly statusCode: number
  readonly retryAfterSeconds?: number

  constructor(props: {
    code: AhachatErrorCode
    statusCode: number
    retryAfterSeconds?: number
  }) {
    super(
      `AhaChat API request failed: ${props.code}`,
      props.statusCode,
      props.statusCode,
    )
    this.name = "AhachatApiError"
    this.code = props.code
    this.statusCode = props.statusCode
    this.retryAfterSeconds = props.retryAfterSeconds
  }
}

export const isAhachatApiError = (error: unknown): error is AhachatApiError =>
  error instanceof AhachatApiError

/**
 * The shared keys were refused: a configuration error of the operator, never
 * of the workspace's channel (nothing the user can fix by reconnecting).
 */
export const isAhachatUnauthorizedError = (error: unknown): boolean =>
  isAhachatApiError(error) && error.code === "unauthorized"
