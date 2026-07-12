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

  delete<T>(url: string, options?: RequestOptions): Promise<T> {
    return this.client.delete(url, options).json<T>()
  }
}

export const facebookAdsGraphClient = new FacebookAdsHttpClient()
