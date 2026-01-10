import { SdkException } from "@aha.chat/sdk"
import ky, { HTTPError, type Options } from "ky"
import type {
  ActiveCampaignAuthValue,
  ActiveCampaignAutomation,
  ActiveCampaignCustomField,
  ActiveCampaignList,
  ActiveCampaignTag,
} from "./schemas"

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

  async getLists(): Promise<ActiveCampaignList[]> {
    const response = await this.request<{ lists: ActiveCampaignList[] }>(
      "lists",
      {
        method: "GET",
      },
    )
    return response.lists
  }

  async getTags(): Promise<ActiveCampaignTag[]> {
    const response = await this.request<{ tags: ActiveCampaignTag[] }>("tags", {
      method: "GET",
    })
    return response.tags
  }

  async getCustomFields(): Promise<ActiveCampaignCustomField[]> {
    const response = await this.request<{
      fields: ActiveCampaignCustomField[]
    }>("fields", { method: "GET" })
    return response.fields
  }

  async getAutomations(): Promise<ActiveCampaignAutomation[]> {
    const response = await this.request<{
      automations: ActiveCampaignAutomation[]
    }>("automations", { method: "GET" })
    return response.automations
  }

  async syncContact(props: {
    email: string
    firstName?: string
    lastName?: string
    phone?: string
    fieldValues?: { field: string; value: string }[]
  }): Promise<{ contact: { id: string } }> {
    return await this.request<{ contact: { id: string } }>("contact/sync", {
      method: "POST",
      json: {
        contact: props,
      },
    })
  }

  async addContactToAutomation(props: {
    contactId: string
    automationId: string
  }): Promise<unknown> {
    return await this.request("contactAutomations", {
      method: "POST",
      json: {
        contactAutomation: {
          contact: props.contactId,
          automation: props.automationId,
        },
      },
    })
  }

  async updateContactList(props: {
    contactId: string
    listId: string
    status: number
  }): Promise<unknown> {
    return await this.request("contactLists", {
      method: "POST",
      json: {
        contactList: {
          list: props.listId,
          contact: props.contactId,
          status: props.status,
        },
      },
    })
  }

  async addContactTag(props: {
    contactId: string
    tagId: string
  }): Promise<unknown> {
    return await this.request("contactTags", {
      method: "POST",
      json: {
        contactTag: {
          contact: props.contactId,
          tag: props.tagId,
        },
      },
    })
  }
}
