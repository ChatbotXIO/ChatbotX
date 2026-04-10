import ky, { type KyInstance, type Options } from "ky"
import { ZALO_API_BASE_URL, ZALO_OAUTH_BASE_URL } from "../constants"
import { ZaloException } from "./exception"
import { logger } from "./logger"

type ZaloApiErrorResponse = {
  error: number
  message: string
}

type ZaloClientConfig = {
  accessToken?: string
  version?: string
  timeout?: number
  retries?: number
  prefixUrl?: string
}

export class ZaloHttpClient {
  private readonly client: KyInstance
  private readonly accessToken?: string

  constructor(config: ZaloClientConfig = {}) {
    const {
      accessToken,
      timeout = 30_000,
      retries = 2,
      prefixUrl = ZALO_API_BASE_URL,
    } = config

    this.accessToken = accessToken

    this.client = ky.create({
      prefixUrl,
      timeout,
      retry: retries,
      headers: {
        "Content-Type": "application/json",
        ...(accessToken && { access_token: accessToken }),
      },
      hooks: {
        beforeRequest: [
          (request) => {
            logger.debug(
              {
                url: request.url,
                method: request.method,
              },
              "Zalo OA API request",
            )
          },
        ],
        afterResponse: [
          async (request, _options, response) => {
            if (!response.ok) {
              const errorText = await response.text()
              logger.error(
                {
                  url: request.url,
                  status: response.status,
                  error: errorText,
                },
                "Zalo OA API error response",
              )

              throw new ZaloException(
                `API request failed: ${response.status} ${errorText}`,
              )
            }

            return response
          },
        ],
      },
    })
  }

  private async handleResponse<T>(
    responsePromise: Promise<Response>,
  ): Promise<T> {
    try {
      const response = await responsePromise
      const data = (await response.json()) as T & ZaloApiErrorResponse

      if (typeof data === "object" && data !== null && "error" in data) {
        const apiError = data as ZaloApiErrorResponse
        if (apiError.error !== 0) {
          throw new ZaloException(`Zalo OA API error: ${apiError.message}`)
        }
      }

      return data
    } catch (error) {
      if (error instanceof ZaloException) {
        throw error
      }

      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred"

      logger.error({ error: errorMessage }, "Zalo OA HTTP client error")
      throw new ZaloException(`HTTP request failed: ${errorMessage}`)
    }
  }

  private mergeOptions(options: Options): Options {
    return {
      ...options,
      headers: {
        ...options.headers,
        ...(this.accessToken && { access_token: this.accessToken }),
      },
    }
  }

  get<T>(url: string, options: Options = {}): Promise<T> {
    return this.handleResponse<T>(
      this.client.get(url, this.mergeOptions(options)),
    )
  }

  post<T>(url: string, options: Options = {}): Promise<T> {
    return this.handleResponse<T>(
      this.client.post(url, this.mergeOptions(options)),
    )
  }

  delete<T>(url: string, options: Options = {}): Promise<T> {
    return this.handleResponse<T>(
      this.client.delete(url, this.mergeOptions(options)),
    )
  }

  static createOAuthClient(
    config: Omit<ZaloClientConfig, "accessToken"> = {},
  ): ZaloHttpClient {
    return new ZaloHttpClient({
      ...config,
      accessToken: undefined,
      prefixUrl: ZALO_OAUTH_BASE_URL,
    })
  }

  static createAuthenticatedClient(
    accessToken: string,
    config: Omit<ZaloClientConfig, "accessToken"> = {},
  ): ZaloHttpClient {
    return new ZaloHttpClient({
      ...config,
      accessToken,
      prefixUrl: ZALO_API_BASE_URL,
    })
  }
}
