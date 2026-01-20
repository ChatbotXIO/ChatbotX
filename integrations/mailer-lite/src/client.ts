import { SdkException } from "@aha.chat/sdk"
import ky, { HTTPError, type Options } from "ky"
import type {
  MailerLiteAuthValue,
  MailerLiteField,
  MailerLiteGroup,
} from "./schemas"

const LEADING_SLASH_REGEX = /^\//

export class MailerLiteClient {
  private readonly auth: MailerLiteAuthValue
  private readonly baseUrl = "https://connect.mailerlite.com/api"

  constructor(auth: MailerLiteAuthValue) {
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
          Authorization: `Bearer ${this.auth.apiKey}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          ...options.headers,
        },
      }).json<T>()
    } catch (error) {
      if (error instanceof HTTPError) {
        const errorData = (await error.response.json().catch(() => ({}))) as {
          message?: string
          errors?: Record<string, string[]>
        }

        const message = errorData.message || error.message
        throw new SdkException(`MailerLite API Error: ${message}`)
      }
      throw error
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.request("groups", { method: "GET" })
      return true
    } catch (_error) {
      return false
    }
  }

  async getGroups(): Promise<MailerLiteGroup[]> {
    try {
      const response = await this.request<{
        data: Array<{ id: string; name: string }>
      }>("groups", { method: "GET" })
      return response.data || []
    } catch (_error) {
      return []
    }
  }

  async getFields(): Promise<MailerLiteField[]> {
    try {
      const response = await this.request<{
        data: Array<{ key: string; name: string }>
      }>("fields", { method: "GET" })
      return (
        response.data?.map((field) => ({
          id: field.key,
          name: field.name,
        })) || []
      )
    } catch (_error) {
      return []
    }
  }

  async addOrUpdateSubscriber(props: {
    email: string
    firstName?: string
    lastName?: string
    phone?: string
    groupIds?: string[]
    fields?: Record<string, string>
    status?: "active" | "unconfirmed"
    autoresponders?: boolean
  }): Promise<{ id: string; email: string }> {
    const fields: Record<string, string> = { ...props.fields }

    if (props.firstName) {
      fields.name = props.firstName
    }
    if (props.lastName) {
      fields.last_name = props.lastName
    }
    if (props.phone) {
      fields.phone = props.phone
    }

    const response = await this.request<{
      data: { id: string; email: string }
    }>("subscribers", {
      method: "POST",
      json: {
        email: props.email,
        fields,
        groups: props.groupIds,
        status: props.status,
        autoresponders: props.autoresponders,
      },
    })

    return response.data
  }
}
