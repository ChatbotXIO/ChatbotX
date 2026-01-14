import { SdkException } from "@aha.chat/sdk"
import ky, { HTTPError, type Options } from "ky"
import type { DripAuthValue, DripCustomField } from "./schemas"

const LEADING_SLASH_REGEX = /^\//

export class DripClient {
  private readonly auth: DripAuthValue
  private readonly baseUrl = "https://api.getdrip.com/v2"

  constructor(auth: DripAuthValue) {
    this.auth = auth
  }

  private async request<T>(
    endpoint: string,
    options: Options = {},
    useAccountId = true,
  ): Promise<T> {
    const cleanEndpoint = endpoint.replace(LEADING_SLASH_REGEX, "")
    const url = useAccountId
      ? `${this.baseUrl}/${this.auth.accountId}/${cleanEndpoint}`
      : `${this.baseUrl}/${cleanEndpoint}`

    try {
      const token = Buffer.from(`${this.auth.apiToken}:`).toString("base64")

      return await ky(url, {
        ...options,
        headers: {
          Authorization: `Basic ${token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          ...options.headers,
        },
      }).json<T>()
    } catch (error) {
      if (error instanceof HTTPError) {
        const errorData = (await error.response.json().catch(() => ({}))) as {
          errors?: Array<{ message: string }>
        }

        const message = errorData.errors?.[0]?.message || error.message
        throw new SdkException(`Drip API Error: ${message}`)
      }
      throw error
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      // Documentation: GET /v2/accounts/:account_id
      await this.request(
        `accounts/${this.auth.accountId}`,
        { method: "GET" },
        false,
      )
      return true
    } catch (_error) {
      return false
    }
  }

  async getAccounts(): Promise<Array<{ id: string; name: string }>> {
    try {
      // Documentation: GET /v2/accounts
      const response = await this.request<{
        accounts: Array<{ id: string; name: string }>
      }>("accounts", { method: "GET" }, false)

      return response.accounts || []
    } catch (error) {
      if (error instanceof SdkException) {
        throw error
      }
      throw new SdkException(`Failed to get accounts: ${error}`)
    }
  }

  async getTags(): Promise<string[]> {
    const response = await this.request<{ tags: string[] }>("tags", {
      method: "GET",
    })
    return response.tags || []
  }

  async getCustomFields(): Promise<DripCustomField[]> {
    const response = await this.request<{
      custom_field_identifiers: string[]
    }>("custom_field_identifiers", {
      method: "GET",
    })

    return (
      response.custom_field_identifiers?.map((identifier, index) => ({
        id: `${index}`,
        identifier,
        label: identifier,
      })) || []
    )
  }

  async syncSubscriber(props: {
    email: string
    firstName?: string
    lastName?: string
    phone?: string
    tags?: string[]
    customFields?: Record<string, string>
  }): Promise<{ subscriber: { id: string; email: string } }> {
    const subscriberData: Record<string, unknown> = {
      email: props.email,
    }

    if (props.firstName || props.lastName) {
      subscriberData.first_name = props.firstName
      subscriberData.last_name = props.lastName
    }

    if (props.phone) {
      subscriberData.phone = props.phone
    }

    if (props.tags && props.tags.length > 0) {
      subscriberData.tags = props.tags
    }

    if (props.customFields && Object.keys(props.customFields).length > 0) {
      subscriberData.custom_fields = props.customFields
    }

    const response = await this.request<{
      subscribers: Array<{ id: string; email: string }>
    }>("subscribers", {
      method: "POST",
      json: {
        subscribers: [subscriberData],
      },
    })

    const subscriber = response.subscribers?.[0]
    if (!subscriber) {
      throw new SdkException("Failed to sync subscriber")
    }

    return { subscriber }
  }
}
