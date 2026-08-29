import { UNKNOWN_ERROR } from "@chatbotx.io/sdk"
import ky, { isHTTPError, type KyInstance } from "ky"
import {
  type ChannelErrorSource,
  MessengerAPIException,
  parseOriginError,
} from "../exception"
import { logger } from "./logger"

const EXPECTED_POLICY_ERRORS: ReadonlyArray<{
  code: number
  subCode?: number
}> = [{ code: 230 }, { code: 100, subCode: 33 }]

export function isExpectedPolicyError(
  source: Pick<ChannelErrorSource, "code" | "subCode">,
): boolean {
  const code = Number(source.code)
  if (Number.isNaN(code)) {
    return false
  }
  const subCode =
    source.subCode === null || source.subCode === undefined
      ? undefined
      : Number(source.subCode)
  return EXPECTED_POLICY_ERRORS.some(
    (entry) =>
      entry.code === code &&
      (entry.subCode === undefined || entry.subCode === subCode),
  )
}

function sanitizeRequestUrl(url: string | undefined): string | undefined {
  if (!url) {
    return
  }
  try {
    const parsedUrl = new URL(url)
    return `${parsedUrl.origin}${parsedUrl.pathname}`
  } catch {
    return
  }
}

export function logChannelError(
  source: ChannelErrorSource,
  context: { url?: string; method?: string },
): void {
  const payload = {
    url: sanitizeRequestUrl(context.url),
    method: context.method,
    httpStatus: source.httpStatusCode,
    code: source.code,
    subCode: source.subCode,
    type: source.type,
  }

  if (isExpectedPolicyError(source)) {
    logger.warn(
      payload,
      `Messenger API expected policy error: ${source.message ?? "unknown"}`,
    )
    return
  }

  logger.error(payload, `Messenger API error: ${source.message ?? "unknown"}`)
}

type HttpClientConfig = {
  baseUrl: string
  timeout?: number
  retries?: number
  retryDelay?: number
}

type GetOptions = {
  headers?: Record<string, string>
  searchParams?: Record<string, string>
}

type PostOptions = {
  headers?: Record<string, string>
  json?: unknown
  retry?: number
}

type DeleteOptions = {
  headers?: Record<string, string>
  searchParams?: Record<string, string>
  json?: Record<string, unknown>
}

class MessengerHttpClient {
  private readonly client: KyInstance

  constructor(config: HttpClientConfig) {
    this.client = ky.create({
      baseUrl: config.baseUrl,
      timeout: config.timeout ?? 30_000,
      retry: {
        limit: config.retries ?? 3,
        methods: ["get", "post", "put", "delete"],
        statusCodes: [408, 413, 429, 500, 502, 503, 504],
        backoffLimit: config.retryDelay ?? 1000,
      },
    })
  }

  private toException(error: unknown): MessengerAPIException {
    const sdkException = parseOriginError(error)

    logChannelError(sdkException, {
      url: isHTTPError(error) ? error.request.url : undefined,
      method: isHTTPError(error) ? error.request.method : undefined,
    })

    return new MessengerAPIException(
      sdkException.message ?? UNKNOWN_ERROR.message,
      sdkException.httpStatusCode,
      sdkException.code,
      sdkException.subCode,
      sdkException.type,
      error,
    )
  }

  private async request<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call()
    } catch (error) {
      throw this.toException(error)
    }
  }

  get<T>(url: string, options?: GetOptions): Promise<T> {
    return this.request(() => this.client.get(url, options).json<T>())
  }

  /**
   * Like `get` but also returns the response `Headers`. Used for inspecting
   * Meta's `X-Business-Use-Case-Usage` quota header in the Coexist historical
   * sync to drive adaptive concurrency.
   */
  getWithHeaders<T>(
    url: string,
    options?: GetOptions,
  ): Promise<{ data: T; headers: Headers }> {
    return this.request(async () => {
      const response = await this.client.get(url, options)
      const data = await response.json<T>()
      return { data, headers: response.headers }
    })
  }

  post<T>(url: string, options?: PostOptions): Promise<T> {
    return this.request(() => this.client.post(url, options).json<T>())
  }

  delete<T>(url: string, options?: DeleteOptions): Promise<T> {
    return this.request(() => this.client.delete(url, options).json<T>())
  }
}

export const facebookGraphClient = new MessengerHttpClient({
  baseUrl: "https://graph.facebook.com",
  timeout: 30_000,
  retries: 3,
  retryDelay: 1000,
})

export const facebookAttachmentClient = new MessengerHttpClient({
  baseUrl: "https://graph.facebook.com",
  timeout: 60_000,
  retries: 2,
  retryDelay: 2000,
})

/**
 * Coexist historical sync client: ky-level retry disabled. The handler owns
 * retry via `withInlineRetry` + BUC-driven pause; doubling retries here pushes
 * worst-case attempts past CHUNK_BUDGET_MS and triggers BullMQ lock expiry.
 */
export const facebookCoexistGraphClient = new MessengerHttpClient({
  baseUrl: "https://graph.facebook.com",
  timeout: 30_000,
  retries: 0,
})
