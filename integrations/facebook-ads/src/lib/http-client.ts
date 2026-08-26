import ky, { type KyInstance } from "ky"
import { GRAPH_API_URL } from "../constants"

type RequestOptions = {
  headers?: Record<string, string>
  searchParams?: Record<string, string>
  json?: unknown
}

class FacebookAdsHttpClient {
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

  get<T>(url: string, options?: RequestOptions): Promise<T> {
    return this.client.get(url, options).json<T>()
  }

  post<T>(url: string, options?: RequestOptions): Promise<T> {
    return this.client.post(url, options).json<T>()
  }

  /**
   * `multipart/form-data` POST — the transport Meta's Marketing API docs use
   * for every write (`-F` in every reference `curl`). ky sets the correct
   * multipart Content-Type + boundary automatically from a native `FormData`
   * body, and `timeout: false` matches the media-upload path that Meta reliably
   * accepts (a finite timeout wraps the request in a way that can drop a
   * streamed `FormData` body on some server runtimes). This is the single
   * transport for `/adimages`, `/advideos`, and every campaign/adset/creative/ad
   * create + status write.
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

  /**
   * `multipart/form-data` POST for metadata writes (campaign/adset/creative/ad
   * create + status). Builds the `FormData` from a plain record so callers keep
   * a flat params object; array/object Meta params (`special_ad_categories`,
   * `targeting`, `object_story_spec`, …) are JSON-stringified by the caller into
   * string values. Every param — including `access_token` — is a form FIELD,
   * never a query-string value, so credentials are not exposed in request URLs.
   * Keeps the default finite timeout (these are small writes on a durable path;
   * only the large binary uploads in `postForm` disable it).
   */
  postFormFields<T>(url: string, form: Record<string, string>): Promise<T> {
    const body = new FormData()
    for (const [key, value] of Object.entries(form)) {
      body.append(key, value)
    }
    return this.client.post(url, { body }).json<T>()
  }

  delete<T>(url: string, options?: RequestOptions): Promise<T> {
    return this.client.delete(url, options).json<T>()
  }
}

export const facebookAdsGraphClient = new FacebookAdsHttpClient()
