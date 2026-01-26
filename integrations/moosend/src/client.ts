import { SdkException } from "@aha.chat/sdk"
import ky, { HTTPError, type Options } from "ky"
import type { MoosendAuthValue, MoosendList } from "./schemas"

export class MoosendClient {
  private readonly auth: MoosendAuthValue
  private readonly baseUrl = "https://api.moosend.com/v3"

  constructor(auth: MoosendAuthValue) {
    this.auth = auth
  }

  private async request<T>(
    endpoint: string,
    options: Options = {},
  ): Promise<T> {
    // Moosend API usually takes apiKey as a query parameter
    const url = `${this.baseUrl}/${endpoint}.json?apikey=${this.auth.apiKey}`

    try {
      const response = await ky(url, {
        ...options,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...options.headers,
        },
      }).json<
        T & {
          Code?: number
          Error?: string | null
          ErrorMessage?: string | null
        }
      >()

      if (response && typeof response === "object") {
        const res = response as {
          Code?: number
          Error?: string | null
          ErrorMessage?: string | null
        }
        const code = res.Code
        const error = res.Error || res.ErrorMessage

        if ((code !== 0 && code !== undefined) || error) {
          throw new SdkException(
            `Moosend API Error: ${error || "Unknown Error"}`,
          )
        }
      }

      return response as T
    } catch (error) {
      if (error instanceof SdkException) {
        throw error
      }
      if (error instanceof HTTPError) {
        const errorData = (await error.response.json().catch(() => ({}))) as {
          Error?: string
          ErrorMessage?: string
          Code?: number
        }

        const message =
          errorData.Error || errorData.ErrorMessage || error.message
        throw new SdkException(`Moosend API Error: ${message}`)
      }
      throw error
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      // Try to get mailing lists to verify API key
      await this.request("lists", { method: "GET" })
      return true
    } catch (_error) {
      return false
    }
  }

  async getLists(): Promise<MoosendList[]> {
    try {
      const response = await this.request<{
        Context: {
          MailingLists: Array<{ ID: string; Name: string }>
        }
      }>("lists", { method: "GET" })

      return (response.Context?.MailingLists || []).map((list) => ({
        id: list.ID,
        name: list.Name,
      }))
    } catch (error) {
      if (error instanceof SdkException) {
        throw error
      }
      throw new SdkException(`Failed to get lists: ${error}`)
    }
  }

  async createContact(props: {
    email: string
    name?: string
    listId: string
  }): Promise<{ id: string; email: string }> {
    const body = {
      Email: props.email,
      Name: props.name,
    }

    const response = await this.request<{
      Context: { ID: string; Email: string }
    }>(`subscribers/${props.listId}/subscribe`, {
      method: "POST",
      json: body,
    })

    return {
      id: response.Context.ID,
      email: response.Context.Email,
    }
  }
}
