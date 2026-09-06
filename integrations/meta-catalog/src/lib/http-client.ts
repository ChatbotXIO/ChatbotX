import { formatGraphError } from "@chatbotx.io/utils/graph-error"
import ky, { isHTTPError, type KyInstance } from "ky"
import { GRAPH_API_URL } from "../constants"
import { MetaCatalogException } from "../exception"

type RequestOptions = {
  searchParams?: Record<string, string>
  headers?: Record<string, string>
  json?: unknown
  /**
   * Form-encoded body. Graph edges that take composite parameters (`requests`
   * on items_batch, for one) expect them as JSON *strings* in a form body, and
   * silently do nothing when handed an equivalent JSON document.
   */
  form?: Record<string, string>
}

/**
 * Graph accepts the token either as an `access_token` query parameter or as a
 * bearer header. The header is the only one of the two that stays out of
 * request URLs, which is where proxies, access logs and error reporters read
 * from — so every call in this integration authenticates this way.
 */
export const graphAuthHeaders = (
  accessToken: string,
): Record<string, string> => ({
  Authorization: `Bearer ${accessToken}`,
})

type GraphErrorBody = {
  error?: {
    message?: string
    code?: number
    /** Graph's own end-user-facing wording, when it has one. */
    error_user_title?: string
    error_user_msg?: string
    error_subcode?: number
    fbtrace_id?: string
  }
}

export type GraphResponse<T> = {
  data: T
  businessUsageHeader: string | null
}

class MetaCatalogHttpClient {
  private readonly client: KyInstance

  constructor() {
    this.client = ky.create({
      baseUrl: GRAPH_API_URL,
      timeout: 30_000,
      retry: {
        limit: 3,
        methods: ["get"],
        statusCodes: [408, 429, 500, 502, 503, 504],
        backoffLimit: 1000,
      },
    })
  }

  private async request<T>(
    method: "get" | "post",
    url: string,
    options?: RequestOptions,
  ): Promise<GraphResponse<T>> {
    const { form, ...rest } = options ?? {}
    try {
      const response = await this.client[method](url, {
        ...rest,
        ...(form ? { body: new URLSearchParams(form) } : {}),
      })
      return {
        data: (await response.json()) as T,
        businessUsageHeader: response.headers.get("x-business-use-case-usage"),
      }
    } catch (error) {
      if (isHTTPError(error)) {
        // ky consumes the error body into `error.data` before throwing, so the
        // response can no longer be read or cloned. Reading it here would raise
        // "Body has already been consumed" and bury the real Graph error.
        const body: GraphErrorBody = isRecord(error.data) ? error.data : {}
        throw new MetaCatalogException(
          formatGraphError(body.error) ?? `Meta Graph request failed: ${url}`,
          error.response.status,
          body.error?.code,
          {
            graphSubcode: body.error?.error_subcode,
            fbTraceId: body.error?.fbtrace_id,
          },
        )
      }
      throw error
    }
  }

  get<T>(url: string, options?: RequestOptions): Promise<GraphResponse<T>> {
    return this.request("get", url, options)
  }

  post<T>(url: string, options?: RequestOptions): Promise<GraphResponse<T>> {
    return this.request("post", url, options)
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

export const metaCatalogGraphClient = new MetaCatalogHttpClient()
