import ky, { isHTTPError, type KyInstance, type Options } from "ky"
import { API_URL, BUSINESS_API_URL } from "../constants"
import { parseOriginError, TiktokAPIException } from "../exception"
import { logger } from "./logger"

const RETRY_OPTIONS = {
  limit: 3,
  methods: ["get", "post"],
  statusCodes: [408, 429, 500, 502, 503, 504],
  backoffLimit: 1000,
} satisfies Options["retry"]

abstract class BaseTiktokHttpClient {
  protected readonly client: KyInstance

  constructor(baseUrl: string, authHeaders: Record<string, string>) {
    this.client = ky.create({
      baseUrl,
      timeout: 30_000,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      retry: RETRY_OPTIONS,
      hooks: {
        beforeError: [
          ({ error, request }) => {
            if (isHTTPError(error)) {
              logger.error(
                { url: request.url, method: request.method },
                `HTTP ${error.response.status}: ${error.response.statusText}`,
              )
            }
            return error
          },
        ],
      },
    })
  }

  private toException(error: unknown): TiktokAPIException {
    const sdkException = parseOriginError(error)
    return new TiktokAPIException(
      sdkException.message ?? "TikTok API call failed",
      sdkException.httpStatusCode,
      sdkException.code,
      sdkException.subCode,
      sdkException.type,
      error,
    )
  }

  protected async request<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call()
    } catch (error) {
      throw this.toException(error)
    }
  }

  get<T>(
    endpoint: string,
    options?: { searchParams?: Record<string, string> },
  ): Promise<T> {
    return this.request(() => this.client.get(endpoint, options).json<T>())
  }

  post<T>(endpoint: string, options?: { json?: unknown }): Promise<T> {
    return this.request(() => this.client.post(endpoint, options).json<T>())
  }
}

class TiktokHttpClient extends BaseTiktokHttpClient {
  constructor(accessToken: string) {
    super(API_URL, { Authorization: `Bearer ${accessToken}` })
  }
}

// Business API client — uses business-api.tiktok.com with Access-Token header (not Bearer)
class TiktokBusinessHttpClient extends BaseTiktokHttpClient {
  constructor(accessToken: string) {
    super(BUSINESS_API_URL, { "Access-Token": accessToken })
  }

  postFormData<T>(endpoint: string, body: FormData): Promise<T> {
    return this.request(() =>
      this.client
        .post(endpoint, {
          body,
          headers: { "Content-Type": undefined },
        })
        .json<T>(),
    )
  }
}

export const createTiktokClient = (accessToken: string): TiktokHttpClient =>
  new TiktokHttpClient(accessToken)

export const createTiktokBusinessClient = (
  accessToken: string,
): TiktokBusinessHttpClient => new TiktokBusinessHttpClient(accessToken)
