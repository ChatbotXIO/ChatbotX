import { SdkException } from "@aha.chat/sdk"
import ky, { HTTPError, type Options } from "ky"
import type { ActiveCampaignAuthValue } from "./schemas"

const TRAILING_SLASH_REGEX = /\/$/
const LEADING_SLASH_REGEX = /^\//

export class ActiveCampaignClient {
  private readonly auth: ActiveCampaignAuthValue

  constructor(auth: ActiveCampaignAuthValue) {
    this.auth = auth
  }

  private async request<T>(
    endpoint: string,
    options: Options = {},
  ): Promise<T> {
    const apiUrl = this.auth.apiUrl.replace(TRAILING_SLASH_REGEX, "")
    const url = `api/3/${endpoint.replace(LEADING_SLASH_REGEX, "")}`

    try {
      const response = await ky(url, {
        ...options,
        prefixUrl: apiUrl,
        headers: {
          ...options.headers,
          "Api-Token": this.auth.apiKey,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      }).json<T>()

      return response
    } catch (error) {
      if (error instanceof HTTPError) {
        const status = error.response.status
        const statusText = error.response.statusText
        const errorData = await error.response.json().catch(() => ({}))
        const errorMessage =
          typeof errorData === "object" && errorData !== null
            ? JSON.stringify(errorData)
            : String(errorData)

        throw new SdkException(
          `ActiveCampaign API Error: ${status} ${statusText}. ${errorMessage}`,
        )
      }
      throw error
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.request("accounts", { method: "GET" })
      return true
    } catch (_error) {
      return false
    }
  }
}
