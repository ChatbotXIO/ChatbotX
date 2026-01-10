import {
  AuthType,
  type BaseAuthValue,
  type Context,
  type Handler,
} from "@aha.chat/sdk"
import { z } from "zod"

export const activeCampaignAuthValueSchema = z.object({
  apiUrl: z.string().url(),
  apiKey: z.string().min(1),
  authType: z.literal(AuthType.secretText).default(AuthType.secretText),
})

export type ActiveCampaignAuthValue = BaseAuthValue &
  z.infer<typeof activeCampaignAuthValueSchema>

export type ActiveCampaignConfig = {
  chatbotId: string
}

export type ActiveCampaignActions = {
  testConnection: Handler<
    { ctx: Context<ActiveCampaignAuthValue>; props: Record<string, never> },
    { success: boolean; message?: string }
  >
  getLists: Handler<
    { ctx: Context<ActiveCampaignAuthValue>; props: Record<string, never> },
    ActiveCampaignList[]
  >
  getTags: Handler<
    { ctx: Context<ActiveCampaignAuthValue>; props: Record<string, never> },
    ActiveCampaignTag[]
  >
  getCustomFields: Handler<
    { ctx: Context<ActiveCampaignAuthValue>; props: Record<string, never> },
    ActiveCampaignCustomField[]
  >
  getAutomations: Handler<
    { ctx: Context<ActiveCampaignAuthValue>; props: Record<string, never> },
    ActiveCampaignAutomation[]
  >
  syncContact: Handler<
    {
      ctx: Context<ActiveCampaignAuthValue>
      props: {
        email: string
        firstName?: string
        lastName?: string
        phone?: string
        fieldValues?: { field: string; value: string }[]
      }
    },
    { contact: { id: string } }
  >
  addContactToAutomation: Handler<
    {
      ctx: Context<ActiveCampaignAuthValue>
      props: { contactId: string; automationId: string }
    },
    unknown
  >
  updateContactLists: Handler<
    {
      ctx: Context<ActiveCampaignAuthValue>
      props: { contactId: string; listId: string; status: number }
    },
    unknown
  >
  updateContactTags: Handler<
    {
      ctx: Context<ActiveCampaignAuthValue>
      props: { contactId: string; tagId: string }
    },
    unknown
  >
}

export type ActiveCampaignList = {
  id: string
  name: string
}

export type ActiveCampaignTag = {
  id: string
  tag: string
}

export type ActiveCampaignCustomField = {
  id: string
  title: string
}

export type ActiveCampaignAutomation = {
  id: string
  name: string
}
