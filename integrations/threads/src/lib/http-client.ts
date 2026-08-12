import ky, { type KyInstance } from "ky"
import { THREADS_GRAPH_API_URL, THREADS_OAUTH_URL } from "../constants"

class ThreadsHttpClient {
  private readonly client: KyInstance

  constructor(baseUrl: string) {
    this.client = ky.create({
      baseUrl,
      timeout: 30_000,
    })
  }

  get<T>(url: string, options?: Parameters<KyInstance["get"]>[1]): Promise<T> {
    return this.client.get(url, options).json<T>()
  }

  post<T>(
    url: string,
    options?: Parameters<KyInstance["post"]>[1],
  ): Promise<T> {
    return this.client.post(url, options).json<T>()
  }
}

export const threadsGraphClient = new ThreadsHttpClient(THREADS_GRAPH_API_URL)
export const threadsOAuthClient = new ThreadsHttpClient(THREADS_OAUTH_URL)
