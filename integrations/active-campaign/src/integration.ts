import {
  Integration,
  type IntegrationDefinition,
  SdkException,
} from "@aha.chat/sdk"
import { ActiveCampaignClient } from "./client"
import type {
  ActiveCampaignActions,
  ActiveCampaignAuthValue,
  ActiveCampaignConfig,
} from "./schemas"

const config: IntegrationDefinition<
  ActiveCampaignConfig,
  ActiveCampaignAuthValue,
  ActiveCampaignActions
> = {
  name: "activeCampaign",
  actions: {
    testConnection: async ({
      ctx,
    }): Promise<{ success: boolean; message?: string }> => {
      const client = new ActiveCampaignClient(ctx.auth)
      const success = await client.testConnection()
      return {
        success,
      }
    },
    getLists: async ({ ctx }) => {
      const client = new ActiveCampaignClient(ctx.auth)
      return await client.getLists()
    },
    getTags: async ({ ctx }) => {
      const client = new ActiveCampaignClient(ctx.auth)
      return await client.getTags()
    },
    getCustomFields: async ({ ctx }) => {
      const client = new ActiveCampaignClient(ctx.auth)
      return await client.getCustomFields()
    },
    getAutomations: async ({ ctx }) => {
      const client = new ActiveCampaignClient(ctx.auth)
      return await client.getAutomations()
    },
    syncContact: async ({ ctx, props }) => {
      const client = new ActiveCampaignClient(ctx.auth)
      return await client.syncContact(props)
    },
    addContactToAutomation: async ({ ctx, props }) => {
      const client = new ActiveCampaignClient(ctx.auth)
      return await client.addContactToAutomation(props)
    },
    updateContactLists: async ({ ctx, props }) => {
      const client = new ActiveCampaignClient(ctx.auth)
      return await client.updateContactList(props)
    },
    updateContactTags: async ({ ctx, props }) => {
      const client = new ActiveCampaignClient(ctx.auth)
      return await client.addContactTag(props)
    },
  },
  handleRequest: () => {
    return Promise.reject(
      new SdkException(
        "ActiveCampaign does not support webhooks/callbacks yet via this handler.",
      ),
    )
  },
  disconnect: () => {
    return Promise.resolve()
  },
}

export const integration = new Integration(config)
