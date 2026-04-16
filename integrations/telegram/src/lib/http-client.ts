import ky, { isHTTPError, type KyInstance } from "ky"
import { TelegramAPIException } from "../exception"
import { logger } from "./logger"

class TelegramHttpClient {
  private readonly client: KyInstance

  constructor(botToken: string) {
    this.client = ky.create({
      baseUrl: `https://api.telegram.org/bot${botToken}/`,
      timeout: 30_000,
      retry: {
        limit: 3,
        methods: ["get", "post"],
        statusCodes: [408, 413, 429, 500, 502, 503, 504],
        backoffLimit: 1000,
      },
      hooks: {
        beforeError: [
          ({error, request}) => {
            if (isHTTPError(error)) {
              logger.error(
                {
                  url: request.url,
                  method: request.method,
                },
                `HTTP ${error.response.status}: ${error.response.statusText}`,
              )
            }
            return error
          },
        ],
      },
    })
  }

  async post<T>(endpoint: string, options?: { json?: unknown }): Promise<T> {
    try {
      return await this.client.post(endpoint, options).json<T>()
    } catch (error) {
      throw new TelegramAPIException(
        `POST ${endpoint} failed: ${String(error)}`,
        endpoint,
      )
    }
  }

  async get<T>(
    endpoint: string,
    options?: { searchParams?: Record<string, string> },
  ): Promise<T> {
    try {
      return await this.client.get(endpoint, options).json<T>()
    } catch (error) {
      throw new TelegramAPIException(
        `GET ${endpoint} failed: ${String(error)}`,
        endpoint,
      )
    }
  }
}

export const createTelegramClient = (botToken: string): TelegramHttpClient =>
  new TelegramHttpClient(botToken)
