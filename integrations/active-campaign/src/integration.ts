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
