import { HTTPError } from "ky"
import { sanitizeSensitiveText } from "./lib/error-sanitizer"

type ThreadsExceptionOptions = {
  code?: string | number
  httpStatusCode?: number
  subCode?: string | number | null
  type?: string
}

type ThreadsApiErrorBody = {
  error?: {
    message?: string
    code?: string | number
    error_subcode?: string | number
    type?: string
  }
}

export class ThreadsException extends Error {
  code?: string | number
  httpStatusCode?: number
  subCode?: string | number | null
  type?: string
  originError?: unknown

  constructor(message: string, options: ThreadsExceptionOptions = {}) {
    super(message)
    this.name = "ThreadsException"
    this.code = options.code
    this.httpStatusCode = options.httpStatusCode
    this.subCode = options.subCode
    this.type = options.type
  }

  setOriginError(originError: unknown) {
    this.originError = originError
    return this
  }
}

async function normalizeThreadsError(
  error: unknown,
): Promise<ThreadsExceptionOptions & { message: string }> {
  if (error instanceof HTTPError) {
    let body: ThreadsApiErrorBody | undefined

    try {
      const rawBody = await error.response.clone().json()
      body = rawBody as ThreadsApiErrorBody
    } catch {
      body = undefined
    }

    const apiError = body?.error
    return {
      message: sanitizeSensitiveText(apiError?.message ?? error.message),
      code: apiError?.code,
      subCode: apiError?.error_subcode,
      type: apiError?.type,
      httpStatusCode: error.response.status,
    }
  }

  const message = sanitizeSensitiveText(
    error instanceof Error ? error.message : String(error),
  )
  return { message }
}

export async function rescue<T>(
  endpoint: string,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof ThreadsException) {
      throw error
    }

    const normalized = await normalizeThreadsError(error)
    throw new ThreadsException(
      `Threads API error at ${endpoint}: ${normalized.message}`,
      normalized,
    ).setOriginError(error)
  }
}
