import ky, { type KyInstance } from "ky"
import { API_URL } from "../constants"
import {
  MetaConversionsException,
  parseMetaConversionsOriginError,
} from "../exception"

type RequestOptions = {
  searchParams?: Record<string, string>
  headers?: Record<string, string>
  json?: unknown
}

export type GraphResponse<T> = {
  data: T
}

export const graphAuthHeaders = (
  accessToken: string,
): Record<string, string> => ({
  Authorization: `Bearer ${accessToken}`,
})

class MetaConversionsHttpClient {
  private readonly client: KyInstance

  constructor() {
    this.client = ky.create({
      baseUrl: API_URL,
      timeout: 30_000,
      retry: {
        limit: 0,
      },
    })
  }

  private async request<T>(
    method: "get" | "post",
    url: string,
    options?: RequestOptions,
  ): Promise<GraphResponse<T>> {
    try {
      const response = await this.client[method](url, options)
      return { data: (await response.json()) as T }
    } catch (error) {
      const source = parseMetaConversionsOriginError(error)
      throw new MetaConversionsException(source, undefined, error)
    }
  }

  get<T>(url: string, options?: RequestOptions): Promise<GraphResponse<T>> {
    return this.request("get", url, options)
  }

  post<T>(url: string, options?: RequestOptions): Promise<GraphResponse<T>> {
    return this.request("post", url, options)
  }
}

export const metaConversionsGraphClient = new MetaConversionsHttpClient()
