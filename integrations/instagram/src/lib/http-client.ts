import ky, { type KyInstance } from "ky"
import { InstagramAPIException } from "../exception"
import { logger } from "./logger"

type HttpClientConfig = {
  baseURL: string
  timeout?: number
  retries?: number
  retryDelay?: number
}

class InstagramHttpClient {
  private readonly client: KyInstance

  constructor(config: HttpClientConfig) {
    this.client = ky.create({
      prefixUrl: config.baseURL,
      timeout: config.timeout ?? 30_000,
      retry: {
        limit: config.retries ?? 3,
        methods: ["get", "post", "put", "delete"],
        statusCodes: [408, 413, 429, 500, 502, 503, 504],
        backoffLimit: config.retryDelay ?? 1000,
      },
      hooks: {
        beforeError: [
          (error) => {
            const { response } = error
            if (response) {
              logger.error(
                {
                  url: error.request?.url,
                  method: error.request?.method,
                },
                `HTTP ${response.status}: ${response.statusText}`,
              )
            }
            return error
          },
        ],
        afterResponse: [
          (_request, _options, response) => {
            logger.debug(`HTTP ${response.status} ${response.statusText}`)
            return response
          },
        ],
      },
    })
  }

  async get<T>(
    url: string,
    options?: {
      headers?: Record<string, string>
      searchParams?: Record<string, string>
    },
  ): Promise<T> {
    try {
      return await this.client.get(url, options).json<T>()
    } catch (error) {
      throw new InstagramAPIException(
        `GET request failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        url,
      )
    }
  }

  async post<T>(
    url: string,
    options?: {
      headers?: Record<string, string>
      json?: unknown
      body?: URLSearchParams | string
      searchParams?: Record<string, string>
    },
  ): Promise<T> {
    try {
      return await this.client.post(url, options).json<T>()
    } catch (error) {
      throw new InstagramAPIException(
        `POST request failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        url,
      )
    }
  }

  async delete<T>(
    url: string,
    options?: {
      headers?: Record<string, string>
      searchParams?: Record<string, string>
      json?: unknown
    },
  ): Promise<T> {
    try {
      return await this.client.delete(url, options).json<T>()
    } catch (error) {
      throw new InstagramAPIException(
        `DELETE request failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        url,
      )
    }
  }
}

// Create singleton instances for different API endpoints
export const instagramGraphClient = new InstagramHttpClient({
  baseURL: "https://graph.facebook.com",
  timeout: 30_000,
  retries: 3,
  retryDelay: 1000,
})

export const instagramAttachmentClient = new InstagramHttpClient({
  baseURL: "https://graph.facebook.com",
  timeout: 60_000,
  retries: 2,
  retryDelay: 2000,
})
