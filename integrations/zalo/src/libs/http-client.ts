import ky, { type KyInstance, type Options } from "ky"
import { ZaloException } from "../libs/exception"
import { logger } from "../libs/logger"

type ZaloApiErrorResponse = {
  error: number
  message: string
}

type ZaloClientConfig = {
  accessToken?: string
  version?: string
  timeout?: number
  retries?: number
}

export class ZaloHttpClient {
  private readonly client: KyInstance
  private readonly accessToken?: string

  constructor(config: ZaloClientConfig = {}) {
    const { accessToken, timeout = 30_000, retries = 2 } = config

    this.accessToken = accessToken

    this.client = ky.create({
      prefixUrl: "https://openapi.zalo.me",
      timeout,
      retry: retries,
      headers: {
        "Content-Type": "application/json",
        ...(accessToken && { access_token: accessToken }),
      },
      hooks: {
        beforeRequest: [
          (request) => {
            logger.debug("Zalo API request", {
              url: request.url,
              method: request.method,
            })
          },
        ],
        afterResponse: [
          async (request, _options, response) => {
            if (!response.ok) {
              const errorText = await response.text()
              logger.error("Zalo API error response", {
                url: request.url,
                status: response.status,
                error: errorText,
              })

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
          throw new ZaloException(`Zalo API error: ${apiError.message}`)
        }
      }

      return data
    } catch (error) {
      if (error instanceof ZaloException) {
        throw error
      }

      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred"

      logger.error("Zalo HTTP client error", { error: errorMessage })
      throw new ZaloException(`HTTP request failed: ${errorMessage}`)
    }
  }

  get<T>(url: string, options: Options = {}): Promise<T> {
    const mergedOptions: Options = {
      ...options,
      headers: {
        ...options.headers,
        ...(this.accessToken && { access_token: this.accessToken }),
      },
    }

    const responsePromise = this.client.get(url, mergedOptions)
    return this.handleResponse<T>(responsePromise)
  }

  post<T>(url: string, options: Options = {}): Promise<T> {
    const mergedOptions: Options = {
      ...options,
      headers: {
        ...options.headers,
        ...(this.accessToken && { access_token: this.accessToken }),
      },
    }

    const responsePromise = this.client.post(url, mergedOptions)
    return this.handleResponse<T>(responsePromise)
  }

  delete<T>(url: string, options: Options = {}): Promise<T> {
    const mergedOptions: Options = {
      ...options,
      headers: {
        ...options.headers,
        ...(this.accessToken && { access_token: this.accessToken }),
      },
    }

    const responsePromise = this.client.delete(url, mergedOptions)
    return this.handleResponse<T>(responsePromise)
  }

  static createOAuthClient(
    config: Omit<ZaloClientConfig, "accessToken"> = {},
  ): ZaloHttpClient {
    return new ZaloHttpClient({
      ...config,
      accessToken: undefined,
    })
  }

  static createAuthenticatedClient(
    accessToken: string,
    config: Omit<ZaloClientConfig, "accessToken"> = {},
  ): ZaloHttpClient {
    return new ZaloHttpClient({
      ...config,
      accessToken,
    })
  }
}
