import { SdkException } from "@aha.chat/sdk"
import ky, { HTTPError, type Options } from "ky"
import type { SendGridAuthValue } from "./schemas"

const LEADING_SLASH_REGEX = /^\//

export class SendGridClient {
  private readonly auth: SendGridAuthValue
  private readonly baseUrl = "https://api.sendgrid.com/v3"

  constructor(auth: SendGridAuthValue) {
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
          errors?: Array<{ message: string }>
        }

        const message = errorData.errors?.[0]?.message || error.message
        throw new SdkException(`SendGrid API Error: ${message}`)
      }
      throw error
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      // Documentation: GET /v3/scopes
      await this.request("scopes", { method: "GET" })
      return true
    } catch (_error) {
      return false
    }
  }

  async getLists(): Promise<Array<{ id: string; name: string }>> {
    try {
      const response = await this.request<{
        result: Array<{ id: string; name: string }>
      }>("marketing/lists", { method: "GET" })
      return response.result || []
    } catch (_error) {
      return []
    }
  }

  async getCustomFields(): Promise<Array<{ id: string; name: string }>> {
    try {
      const response = await this.request<{
        custom_fields: Array<{ id: string; name: string }>
      }>("marketing/field_definitions", { method: "GET" })
      return response.custom_fields || []
    } catch (_error) {
      return []
    }
  }

  async addOrUpdateContact(props: {
    email: string
    firstName?: string
    lastName?: string
    phone?: string
    listIds?: string[]
    customFields?: Record<string, string>
  }): Promise<{ job_id: string }> {
    const contactData: Record<string, unknown> = {
      email: props.email,
    }

    if (props.firstName) {
      contactData.first_name = props.firstName
    }
    if (props.lastName) {
      contactData.last_name = props.lastName
    }
    if (props.phone) {
      contactData.phone_number = props.phone
    }
    if (props.customFields && Object.keys(props.customFields).length > 0) {
      contactData.custom_fields = props.customFields
    }

    return await this.request("marketing/contacts", {
      method: "PUT",
      json: {
        list_ids: props.listIds || [],
        contacts: [contactData],
      },
    })
  }
}
