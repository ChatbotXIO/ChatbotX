import { UNKNOWN_ERROR } from "@chatbotx.io/sdk"
import ky, { isHTTPError, type KyInstance, type ShouldRetryState } from "ky"
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

/**
 * Meta's "Please reduce the amount of data you're asking for, then retry your
 * request" reply. It shares error code 1 with the generic "API Unknown"
 * failure that Meta documents as transient ("wait and retry"), so the code
 * alone is not enough: only the combination of code 1, no subcode and this
 * sentence identifies it. It arrives as a 5xx, but re-sending the identical
 * request never succeeds — only a smaller page does — so it is excluded from
 * the client's status-code retry and left to the caller (`fetchDirectPages`
 * in `apis/auth.ts`) to shrink the page.
 *
 * @see https://developers.facebook.com/docs/graph-api/guides/error-handling
 */
const GRAPH_DATA_TOO_LARGE_CODE = 1
const GRAPH_DATA_TOO_LARGE_MESSAGE = /reduce the amount of data/i

export function isDataTooLargeGraphError(
  source: Pick<ChannelErrorSource, "code" | "subCode" | "message">,
): boolean {
  return (
    Number(source.code) === GRAPH_DATA_TOO_LARGE_CODE &&
    (source.subCode === null || source.subCode === undefined) &&
    GRAPH_DATA_TOO_LARGE_MESSAGE.test(source.message ?? "")
  )
}

/**
 * `false` short-circuits ky's retry; `undefined` defers to its default
 * status-code policy. Only the request shape decides — `error.data` is
 * already populated when ky calls this.
 */
export function shouldRetryGraphRequest({
  error,
}: Pick<ShouldRetryState, "error" | "retryCount">): Promise<
  boolean | undefined
> {
  if (isHTTPError(error) && isDataTooLargeGraphError(parseOriginError(error))) {
    return Promise.resolve(false)
  }
  return Promise.resolve(undefined)
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
        shouldRetry: shouldRetryGraphRequest,
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
  // 60s, not the 30s default: a `/conversations` page is requested at Graph's
  // ~499-per-page ceiling with `participants` expanded (v1 used the same page
  // size against a client with no short timeout), and Graph regularly needs
  // longer than 30s to answer one for a large Page. A genuine hang is bounded
  // per request by this timeout and per run by the handler's own
  // `withInlineRetry` plus the run's capped scheduler attempts; the walk as a
  // whole stays inside its job lock through the handler's chunk budget and
  // BullMQ's lock renewal, not through this value.
  timeout: 60_000,
  retries: 0,
})
