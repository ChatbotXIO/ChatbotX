import { UNKNOWN_ERROR } from "@chatbotx.io/sdk"
import ky, { isHTTPError, type KyInstance } from "ky"
import { InstagramAPIException, parseOriginError } from "../exception"
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
  body?: URLSearchParams | string
  searchParams?: Record<string, string>
}

type DeleteOptions = {
  headers?: Record<string, string>
  searchParams?: Record<string, string>
  json?: unknown
}

class InstagramHttpClient {
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

  private toException(error: unknown): InstagramAPIException {
    const sdkException = parseOriginError(error)

    return new InstagramAPIException(
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

  post<T>(url: string, options?: PostOptions): Promise<T> {
    return this.request(() => this.client.post(url, options).json<T>())
  }

  delete<T>(url: string, options?: DeleteOptions): Promise<T> {
    return this.request(() => this.client.delete(url, options).json<T>())
  }
}

export const instagramGraphClient = new InstagramHttpClient({
  baseUrl: "https://graph.facebook.com",
  timeout: 30_000,
  retries: 3,
  retryDelay: 1000,
})

export const instagramAttachmentClient = new InstagramHttpClient({
  baseUrl: "https://graph.facebook.com",
  timeout: 60_000,
  retries: 2,
  retryDelay: 2000,
})
