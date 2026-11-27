import ky from "ky"
import { z } from "zod"
import {
  WOOCOMMERCE_HTTP_TIMEOUT_MS,
  WOOCOMMERCE_PAGE_SIZE,
  woocommerceApiUrl,
} from "./constants"
import { WooCommerceApiError } from "./error"

/**
 * What every REST call needs: the store and its REST API keys. `authMode`
 * says how the keys travel; see `woocommerceAuthModes`.
 */
export type WooCommerceCredentials = {
  siteUrl: string
  consumerKey: string
  consumerSecret: string
  authMode: "header" | "query"
}

type Query = Record<string, string | number | boolean | undefined>

const restErrorSchema = z
  .object({ code: z.string().optional(), message: z.string().optional() })
  .loose()

const parseRetryAfter = (value: string | null): number | undefined => {
  if (!value) {
    return
  }
  const seconds = Number.parseFloat(value)
  return Number.isFinite(seconds) && seconds >= 0
    ? Math.ceil(seconds)
    : undefined
}

const HTML_TAGS = /<[^>]*>/g

/** WooCommerce's messages may carry HTML (links to settings pages). */
const plainText = (value: string) => value.replace(HTML_TAGS, "").trim()

const toSearchParams = (
  credentials: WooCommerceCredentials,
  query: Query | undefined,
) => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      params.set(key, String(value))
    }
  }
  if (credentials.authMode === "query") {
    params.set("consumer_key", credentials.consumerKey)
    params.set("consumer_secret", credentials.consumerSecret)
  }
  return params
}

const authHeaders = (
  credentials: WooCommerceCredentials,
): Record<string, string> =>
  credentials.authMode === "header"
    ? {
        Authorization: `Basic ${btoa(
          `${credentials.consumerKey}:${credentials.consumerSecret}`,
        )}`,
      }
    : {}

export type WooCommerceResponse<T> = {
  data: T
  /** `X-WP-TotalPages` of a list, 1 when absent. */
  totalPages: number
}

/**
 * Runs one REST call and parses the body with `schema`. Redirects are not
 * followed: the keys must only go to the address the merchant entered, and a
 * redirect usually means the address is not the store's canonical one.
 */
export async function woocommerceRequest<T>(
  credentials: WooCommerceCredentials,
  input: {
    method: "get" | "post" | "put" | "delete"
    path: string
    query?: Query
    json?: unknown
  },
  schema: z.ZodType<T>,
): Promise<WooCommerceResponse<T>> {
  const url = `${woocommerceApiUrl(credentials.siteUrl)}${input.path}`
  const response = await ky(url, {
    method: input.method,
    searchParams: toSearchParams(credentials, input.query),
    json: input.json,
    headers: { Accept: "application/json", ...authHeaders(credentials) },
    redirect: "manual",
    retry: 0,
    throwHttpErrors: false,
    timeout: WOOCOMMERCE_HTTP_TIMEOUT_MS,
  })

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("Location")
    throw new WooCommerceApiError({
      message: location
        ? `The store redirected to ${location.split("?")[0]}; connect with that address instead.`
        : "The store answered with a redirect.",
      statusCode: 400,
      code: "redirect",
    })
  }

  const payload: unknown = await response.json().catch(() => undefined)
  if (!response.ok) {
    const parsed = restErrorSchema.safeParse(payload)
    const code = parsed.success ? (parsed.data.code ?? null) : null
    throw new WooCommerceApiError({
      message:
        parsed.success && parsed.data.message
          ? plainText(parsed.data.message)
          : `WooCommerce REST API returned ${response.status}`,
      statusCode: response.status,
      code,
      retryAfterSeconds: parseRetryAfter(response.headers.get("Retry-After")),
    })
  }
  if (payload === undefined) {
    // A WordPress page instead of JSON: the REST API is not where we called.
    throw new WooCommerceApiError({
      message:
        "The store did not answer as a WooCommerce REST API. Check the address, and that WordPress permalinks are not set to Plain.",
      statusCode: 404,
      code: "not_rest_api",
    })
  }
  const totalPages = Number.parseInt(
    response.headers.get("X-WP-TotalPages") ?? "1",
    10,
  )
  return {
    data: schema.parse(payload),
    totalPages: Number.isFinite(totalPages) && totalPages > 0 ? totalPages : 1,
  }
}

/** Every page of a list, read one after the other. */
export async function woocommerceListAll<T>(
  credentials: WooCommerceCredentials,
  input: { path: string; query?: Query },
  itemSchema: z.ZodType<T>,
  onPage: (items: T[]) => Promise<void>,
): Promise<void> {
  // The first page is always read; it tells how many there are.
  for (let page = 1, totalPages = 1; page <= totalPages; page++) {
    const response = await woocommerceRequest(
      credentials,
      {
        method: "get",
        path: input.path,
        query: { ...input.query, page, per_page: WOOCOMMERCE_PAGE_SIZE },
      },
      z.array(itemSchema),
    )
    await onPage(response.data)
    totalPages = response.totalPages
  }
}
