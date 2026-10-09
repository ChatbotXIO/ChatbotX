import ky, { type KyInstance } from "ky"
import {
  DATA_MANAGER_API_URL,
  GOOGLE_ADS_API_URL,
  HTTP_TIMEOUT_MS,
} from "../constants"

export type RequestOptions = {
  searchParams?: Record<string, string>
  headers: Record<string, string>
  json?: unknown
}

// Retries are owned by BullMQ (`retry.limit: 0`), never by the HTTP client.
const createClient = (baseUrl: string): KyInstance =>
  ky.create({ baseUrl, timeout: HTTP_TIMEOUT_MS, retry: { limit: 0 } })

const googleAdsClient = createClient(GOOGLE_ADS_API_URL)
const dataManagerClient = createClient(DATA_MANAGER_API_URL)

/**
 * ky resolves `url` against `baseUrl` with `new URL(url, baseUrl)`, so a path
 * whose first segment contains a colon (`events:ingest`,
 * `customers:listAccessibleCustomers`) is parsed as an absolute URL with an
 * unknown scheme and the request never leaves the process. Anchoring every path
 * with `./` keeps it relative to the (trailing-slash) base URL.
 */
const toRelativePath = (url: string): string =>
  url.startsWith("./") ? url : `./${url}`

const send = async <T>(
  client: KyInstance,
  method: "get" | "post",
  url: string,
  options: RequestOptions,
): Promise<T> =>
  (await client[method](toRelativePath(url), options).json()) as T

export type GoogleAdsCredentials = {
  accessToken: string
  /** Optional: the header is omitted when absent. */
  developerToken?: string
  /** Manager account the user reaches the customer through (omit for direct access). */
  loginCustomerId?: string | null
}

export const adsHeaders = ({
  accessToken,
  developerToken,
  loginCustomerId,
}: GoogleAdsCredentials): Record<string, string> => ({
  Authorization: `Bearer ${accessToken}`,
  ...(developerToken ? { "developer-token": developerToken } : {}),
  ...(loginCustomerId ? { "login-customer-id": loginCustomerId } : {}),
})

export const bearerHeaders = (accessToken: string): Record<string, string> => ({
  Authorization: `Bearer ${accessToken}`,
})

export const googleAdsHttp = {
  get: <T>(url: string, options: RequestOptions) =>
    send<T>(googleAdsClient, "get", url, options),
  post: <T>(url: string, options: RequestOptions) =>
    send<T>(googleAdsClient, "post", url, options),
}

export const dataManagerHttp = {
  get: <T>(url: string, options: RequestOptions) =>
    send<T>(dataManagerClient, "get", url, options),
  post: <T>(url: string, options: RequestOptions) =>
    send<T>(dataManagerClient, "post", url, options),
}
