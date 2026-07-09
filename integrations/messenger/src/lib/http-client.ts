import { UNKNOWN_ERROR } from "@chatbotx.io/sdk"
import ky, { isHTTPError, type KyInstance } from "ky"
import { MessengerAPIException, parseOriginError } from "../exception"
import { logger } from "./logger"

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
      hooks: {
        beforeError: [
          ({ error, request }) => {
            if (isHTTPError(error)) {
              logger.error(
                {
                  url: request.url,
                  method: request.method,
                },
                `HTTP ${error.response.status}: ${error.response.statusText}`,
              )
            }
            return error
          },
        ],
      },
    })
  }

  private toException(error: unknown): MessengerAPIException {
    const sdkException = parseOriginError(error)

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
