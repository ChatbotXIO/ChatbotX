const FALLBACK_HTTP_STATUS = 400

type MetaErrorData = { details?: string }
type MetaError = {
  code?: number
  status?: number
  type?: string
  message?: string
  error_subcode?: number | string
  error_data?: MetaErrorData | number | string
  error_user_title?: string
  error_user_msg?: string
  fbtrace_id?: string
}
type ErrorBody = { error?: MetaError }
type KyHttpErrorShape = {
  response: { status: number }
  data?: unknown
}
type OriginShape = { httpStatus?: number; errorBody?: ErrorBody }
type ExplicitShape = { response?: { error?: MetaError } }

export type MetaConversionsErrorSource = {
  httpStatusCode: number
  code?: number | string
  subCode?: number | string | null
  type?: string
  message?: string
  userTitle?: string
  userMessage?: string
  fbtraceId?: string
}

const asObject = <T>(value: unknown): T | undefined =>
  typeof value === "object" && value !== null ? (value as T) : undefined

const isKyHttpError = (value: unknown): value is KyHttpErrorShape => {
  const candidate = asObject<{ response?: { status?: unknown } }>(value)
  return typeof candidate?.response?.status === "number"
}

const readErrorDetails = (
  errorData: MetaError["error_data"],
): string | undefined =>
  typeof errorData === "object" && errorData !== null
    ? errorData.details
    : undefined

const isMetaError = (value: MetaError | undefined): value is MetaError =>
  value !== undefined &&
  (value.code !== undefined ||
    value.type !== undefined ||
    value.error_subcode !== undefined)

const parseErrorBody = (
  err: MetaError | undefined,
): Omit<MetaConversionsErrorSource, "httpStatusCode"> => ({
  code: err?.code,
  subCode: err?.error_subcode ?? null,
  type: err?.type,
  message: err?.message,
  userTitle: err?.error_user_title,
  userMessage: err?.error_user_msg ?? readErrorDetails(err?.error_data),
  fbtraceId: err?.fbtrace_id,
})

export const parseMetaConversionsOriginError = (
  originError: unknown,
): MetaConversionsErrorSource => {
  if (isKyHttpError(originError)) {
    const body = asObject<ErrorBody>(originError.data)
    const err = body?.error

    return {
      httpStatusCode: err?.status ?? originError.response.status,
      ...parseErrorBody(err),
    }
  }

  const shaped = asObject<OriginShape>(originError)
  if (shaped?.httpStatus !== undefined) {
    const err = shaped.errorBody?.error
    return {
      httpStatusCode: err?.status ?? shaped.httpStatus,
      ...parseErrorBody(err),
    }
  }

  const explicit = asObject<ExplicitShape>(originError)
  if (explicit?.response?.error) {
    const err = explicit.response.error
    return {
      httpStatusCode: err.status ?? FALLBACK_HTTP_STATUS,
      ...parseErrorBody(err),
    }
  }

  const bareError = asObject<MetaError>(originError)
  if (isMetaError(bareError)) {
    return {
      httpStatusCode: bareError.status ?? FALLBACK_HTTP_STATUS,
      ...parseErrorBody(bareError),
    }
  }

  return {
    httpStatusCode: FALLBACK_HTTP_STATUS,
    message: originError instanceof Error ? originError.message : undefined,
  }
}

export const isRetryableMetaConversionsStatus = (status: number): boolean =>
  status === 408 || status === 409 || status === 429 || status >= 500

export class MetaConversionsException extends Error {
  readonly httpStatusCode: number
  readonly code?: string | number
  readonly retryable: boolean
  readonly subCode?: string | number | null
  readonly type?: string
  readonly userTitle?: string
  readonly userMessage?: string
  readonly fbTraceId?: string
  private readonly originError?: unknown

  constructor(
    source: MetaConversionsErrorSource,
    retryable: boolean = isRetryableMetaConversionsStatus(
      source.httpStatusCode,
    ),
    originError?: unknown,
  ) {
    super(source.message ?? "Meta Conversions API call failed")
    this.name = "MetaConversionsException"
    this.httpStatusCode = source.httpStatusCode
    this.code = source.code ?? "metaConversionsError"
    this.retryable = retryable
    this.subCode = source.subCode
    this.type = source.type
    this.userTitle = source.userTitle
    this.userMessage = source.userMessage
    this.fbTraceId = source.fbtraceId

    if (originError !== undefined) {
      this.originError = originError
    }
  }

  getOriginError(): unknown {
    return this.originError
  }
}

export const rescueMetaConversions = async <T>(
  fn: () => Promise<T>,
): Promise<T> => {
  try {
    return await fn()
  } catch (error) {
    const origin =
      error instanceof MetaConversionsException
        ? (error.getOriginError() ?? error)
        : error
    const source = parseMetaConversionsOriginError(origin)
    throw new MetaConversionsException(
      source,
      isRetryableMetaConversionsStatus(source.httpStatusCode),
      origin,
    )
  }
}
