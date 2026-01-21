import { SdkException } from "@aha.chat/sdk"
import ky, { HTTPError, type Options } from "ky"
import type { GetResponseAuthValue } from "./schemas"

const LEADING_SLASH_REGEX = /^\//

export class GetResponseClient {
  private readonly auth: GetResponseAuthValue
  private readonly baseUrl = "https://api.getresponse.com/v3"

  constructor(auth: GetResponseAuthValue) {
    this.auth = auth
  }

  private async request<T>(
    endpoint: string,
    options: Options = {},
  ): Promise<T> {
    const cleanEndpoint = endpoint.replace(LEADING_SLASH_REGEX, "")
    const url = `${this.baseUrl}/${cleanEndpoint}`

    try {
      return await ky(url, {
        ...options,
        headers: {
          "X-Auth-Token": `api-key ${this.auth.apiKey}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          ...options.headers,
        },
      }).json<T>()
    } catch (error) {
      if (error instanceof HTTPError) {
        const errorData = (await error.response.json().catch(() => ({}))) as {
          message?: string
          errors?: Array<{ message: string }>
          context?: unknown
        }

        const message =
          errorData.message || errorData.errors?.[0]?.message || error.message
        const context = errorData.context
          ? JSON.stringify(errorData.context)
          : ""
        throw new SdkException(`GetResponse API Error: ${message} ${context}`)
      }
      throw error
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      // Documentation: GET /v3/accounts
      await this.request("accounts", { method: "GET" })
      return true
    } catch (_error) {
      return false
    }
  }

  async getCampaigns(): Promise<Array<{ id: string; name: string }>> {
    try {
      // Documentation: GET /v3/campaigns
      const response = await this.request<
        Array<{ campaignId: string; name: string }>
      >("campaigns", { method: "GET" })
      return (
        response.map((campaign) => ({
          id: campaign.campaignId,
          name: campaign.name,
        })) || []
      )
    } catch (_error) {
      return []
    }
  }

  async getTags(): Promise<Array<{ tagId: string; name: string }>> {
    try {
      // Documentation: GET /v3/tags
      const response = await this.request<
        Array<{ tagId: string; name: string }>
      >("tags", { method: "GET" })
      return response || []
    } catch (_error) {
      return []
    }
  }

  async addOrUpdateContact(props: {
    email: string
    name?: string
    campaignId?: string
    dayOfCycle?: string
    tags?: string[]
  }): Promise<{ contactId: string }> {
    const contactData: Record<string, unknown> = {
      email: props.email,
    }

    if (props.name) {
      contactData.name = props.name
    }

    if (props.campaignId) {
      contactData.campaign = {
        campaignId: props.campaignId,
      }
    }

    if (props.dayOfCycle !== undefined && props.dayOfCycle.trim() !== "") {
      contactData.dayOfCycle = Number(props.dayOfCycle)
    }

    if (props.tags && props.tags.length > 0) {
      contactData.tags = props.tags.map((tagId) => ({ tagId }))
    }

    // Documentation: POST /v3/contacts
    const response = await this.request<{ contactId: string }>("contacts", {
      method: "POST",
      json: contactData,
    })

    return { contactId: response.contactId }
  }
}
