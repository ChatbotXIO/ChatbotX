import ky, { type KyInstance, type Options } from "ky"
import { ZALO_API_BASE_URL, ZALO_OAUTH_BASE_URL } from "../constants"
import { parseOriginError, ZaloException } from "./exception"
import { logger } from "./logger"

type ZaloApiErrorResponse = {
  error?: number
  message?: string
  // The OAuth endpoints (/v4/oa/access_token) report failures with these
  // fields instead of the numeric error/message pair — and may do so with
  // HTTP 200, so status-based handling never sees them.
  error_name?: string
  error_reason?: string
  error_description?: string
}

type ZaloClientConfig = {
  accessToken?: string
  version?: string
  timeout?: number
  retries?: number
  baseUrl?: string
}

export class ZaloHttpClient {
  private readonly client: KyInstance
  private readonly accessToken?: string

  constructor(config: ZaloClientConfig = {}) {
    const {
      accessToken,
      timeout = 30_000,
      retries = 2,
      baseUrl = ZALO_API_BASE_URL,
    } = config

    this.accessToken = accessToken

    this.client = ky.create({
      baseUrl,
      timeout,
      retry: retries,
      headers: {
        "Content-Type": "application/json",
        ...(accessToken && { access_token: accessToken }),
      },
      hooks: {
        beforeRequest: [
          ({ request }) => {
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
          async ({ request, response }) => {
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
                response.status,
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

      if (typeof data === "object" && data !== null) {
        const apiError = data as ZaloApiErrorResponse
        const hasNumericError =
          "error" in apiError && Number(apiError.error) !== 0
        const hasOauthError = typeof apiError.error_name === "string"

        if (hasNumericError || hasOauthError) {
          const message =
            apiError.message ??
            apiError.error_description ??
            apiError.error_reason ??
            apiError.error_name
          const wrapped = {
            response: { error: { error: apiError.error, message } },
          }
          const sdkException = parseOriginError(wrapped)

          throw new ZaloException(
            sdkException.message ??
              `Zalo OA API error: ${JSON.stringify(data)}`,
            sdkException.httpStatusCode,
            sdkException.code,
            sdkException.subCode,
            sdkException.type,
            wrapped,
          )
        }
      }

      return data
    } catch (error) {
      logger.error(error, "Zalo OA HTTP client error")

      if (error instanceof ZaloException) {
        throw error
      }

      const sdkException = parseOriginError(error)

      throw new ZaloException(
        sdkException.message ?? "HTTP request failed",
        sdkException.httpStatusCode,
        sdkException.code,
        sdkException.subCode,
        sdkException.type,
        error,
      )
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
      baseUrl: ZALO_OAUTH_BASE_URL,
    })
  }

  static createAuthenticatedClient(
    accessToken: string,
    config: Omit<ZaloClientConfig, "accessToken"> = {},
  ): ZaloHttpClient {
    return new ZaloHttpClient({
      ...config,
      accessToken,
      baseUrl: ZALO_API_BASE_URL,
    })
  }
}
