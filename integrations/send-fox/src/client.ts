import { SdkException } from "@aha.chat/sdk"
import ky, { HTTPError, type Options } from "ky"
import type { SendFoxAuthValue, SendFoxList } from "./schemas"

const LEADING_SLASH_REGEX = /^\//

export class SendFoxClient {
  private readonly auth: SendFoxAuthValue
  private readonly baseUrl = "https://api.sendfox.com"

  constructor(auth: SendFoxAuthValue) {
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
          Authorization: `Bearer ${this.auth.accessToken}`,
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
        throw new SdkException(`SendFox API Error: ${message}`)
      }
      throw error
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      // Documentation: GET /me
      await this.request("me", { method: "GET" })
      return true
    } catch (_error) {
      return false
    }
  }

  async getLists(): Promise<SendFoxList[]> {
    try {
      // Documentation: GET /lists
      const response = await this.request<{
        data: Array<{ id: number; name: string }>
      }>("lists", { method: "GET" })
      return response.data || []
    } catch (error) {
      if (error instanceof SdkException) {
        throw error
      }
      throw new SdkException(`Failed to get lists: ${error}`)
    }
  }

  async createContact(props: {
    email: string
    firstName?: string
    lastName?: string
    listIds?: number[]
  }): Promise<{ id: number; email: string }> {
    const body: {
      email: string
      first_name?: string
      last_name?: string
      lists?: number[]
    } = {
      email: props.email,
    }

    if (props.firstName) {
      body.first_name = props.firstName
    }
    if (props.lastName) {
      body.last_name = props.lastName
    }
    if (props.listIds && props.listIds.length > 0) {
      body.lists = props.listIds
    }

    // Documentation: POST /contacts
    const response = await this.request<{ id: number; email: string }>(
      "contacts",
      {
        method: "POST",
        json: body,
      },
    )

    return response
  }
}
