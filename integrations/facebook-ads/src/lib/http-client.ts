import ky, { type KyInstance } from "ky"
import { GRAPH_API_URL } from "../constants"
import { facebookAdsLogger } from "../logger"

type RequestOptions = {
  headers?: Record<string, string>
  searchParams?: Record<string, string>
  json?: unknown
}

/** Safe diagnostic fields only; creative payloads may contain user-provided PII. */
const WIRE_DEBUG_FIELD_NAMES = new Set([
  "adset_id",
  "buying_type",
  "campaign_id",
  "daily_budget",
  "destination_type",
  "name",
  "objective",
  "special_ad_categories",
  "special_ad_category_country",
  "status",
])

/**
 * Opt-in wire debug for the Meta write path — set `FACEBOOK_ADS_WIRE_DEBUG=1`
 * to log a POST's route and safe diagnostic fields (for example
 * `special_ad_categories`) when diagnosing a `#100`. Logs from the plain request
 * object at the CALL SITE, before the request is built.
 *
 * IMPORTANT: this deliberately never reads the outgoing `Request` body stream.
 * The previous version cloned the request and read its body inside a ky
 * `beforeRequest` hook — harmless on raw undici, but under Next.js's patched
 * `fetch` that body read left the request Meta actually received EMPTY, so Meta
 * reported the (correctly-supplied) `special_ad_categories` as missing
 * (`(#100) … is required`). Reading only the plain object here can never disturb
 * the request. Credentials and creative payloads (possible PII) are excluded.
 */
function logWireDebug(url: string, body: Record<string, unknown>): void {
  if (process.env.FACEBOOK_ADS_WIRE_DEBUG !== "1") {
    return
  }
  const fields: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(body)) {
    if (WIRE_DEBUG_FIELD_NAMES.has(key)) {
      fields[key] = value
    }
  }
  facebookAdsLogger.warn(
    { body: fields, fieldNames: Object.keys(body), url },
    "[FB-WIRE]",
  )
}

/**
 * ky always calls `fetch` with a `Request` object. Next.js patches global
 * `fetch` (`next/dist/server/lib/patch-fetch`) and, for a Request input,
 * rebuilds it from `reqInput._ogBody || reqInput.body`. A Request that Next
 * itself created carries `_ogBody`; one ky created does NOT, so Next falls back
 * to `reqInput.body` — a consumed/locked `ReadableStream` — and the request Meta
 * receives has an EMPTY body, so it rejects the (correctly-supplied)
 * `special_ad_categories` with `(#100) … is required`.
 *
 * Fix: tag the call with `next.internal`. Next's patched fetcher short-circuits
 * `if (init?.next?.internal === true) return originFetch(input, init)` before any
 * of its Request-reconstruction / caching logic, delegating straight to the
 * original `fetch`, which sends the intact body. Outside Next there is no patch
 * and the flag is ignored, so this is a no-op everywhere else. We also never
 * want Next to cache these external Graph API writes.
 */
function nextSafeFetch(
  input: Request | string | URL,
  init?: RequestInit,
): Promise<Response> {
  return globalThis.fetch(input, {
    ...init,
    // `next` is Next.js-specific and absent from the DOM `RequestInit` type.
    next: { internal: true },
  } as RequestInit)
}

class FacebookAdsHttpClient {
  private readonly client: KyInstance

  constructor() {
    this.client = ky.create({
      baseUrl: GRAPH_API_URL,
      fetch: nextSafeFetch,
      timeout: 30_000,
      retry: {
        limit: 3,
        methods: ["get"],
        statusCodes: [408, 429, 500, 502, 503, 504],
        backoffLimit: 1000,
      },
    })
  }

  get<T>(url: string, options?: RequestOptions): Promise<T> {
    return this.client.get(url, options).json<T>()
  }

  post<T>(url: string, options?: RequestOptions): Promise<T> {
    return this.client.post(url, options).json<T>()
  }

  /**
   * JSON POST for Graph metadata writes (campaign / ad set / creative / ad
   * create + status). Verified against Meta v23 (FB-WIRE diagnosis + a live
   * `act_.../campaigns` create): a native JSON body with `special_ad_categories`
   * as a real array is accepted. Multipart (`postForm`) stays reserved for the
   * binary `/adimages` and `/advideos` uploads.
   */
  postJsonFields<T>(url: string, body: Record<string, unknown>): Promise<T> {
    logWireDebug(url, body)
    return this.client.post(url, { json: body }).json<T>()
  }

  /**
   * `multipart/form-data` POST — the transport Meta's Marketing API docs use
   * for every write (`-F` in every reference `curl`). ky sets the correct
   * multipart Content-Type + boundary automatically from a native `FormData`
   * body, and `timeout: false` matches the media-upload path that Meta reliably
   * accepts (a finite timeout wraps the request in a way that can drop a
   * streamed `FormData` body on some server runtimes). This transport is only
   * for the binary `/adimages` and `/advideos` upload endpoints.
   */
  postForm<T>(
    url: string,
    options: { searchParams?: Record<string, string>; body: FormData },
  ): Promise<T> {
    return this.client
      .post(url, {
        searchParams: options.searchParams,
        body: options.body,
        timeout: false,
      })
      .json<T>()
  }

  delete<T>(url: string, options?: RequestOptions): Promise<T> {
    return this.client.delete(url, options).json<T>()
  }
}

export const facebookAdsGraphClient = new FacebookAdsHttpClient()
