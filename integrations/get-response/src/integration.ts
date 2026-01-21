import {
  Integration,
  type IntegrationDefinition,
  SdkException,
} from "@aha.chat/sdk"
import { GetResponseClient } from "./client"
import type {
  GetResponseActions,
  GetResponseAuthValue,
  GetResponseConfig,
} from "./schemas"

const GET_RESPONSE_INTEGRATION_NAME = "getResponse"

const config: IntegrationDefinition<
  GetResponseConfig,
  GetResponseAuthValue,
  GetResponseActions
> = {
  name: GET_RESPONSE_INTEGRATION_NAME,
  actions: {
    testConnection: async ({ ctx }) => {
      const client = new GetResponseClient(ctx.auth)
      return await client.testConnection()
    },
    getCampaigns: async ({ ctx }) => {
      const client = new GetResponseClient(ctx.auth)
      return await client.getCampaigns()
    },
    getTags: async ({ ctx }) => {
      const client = new GetResponseClient(ctx.auth)
      return await client.getTags()
    },
    addOrUpdateContact: async ({ ctx, props }) => {
      const client = new GetResponseClient(ctx.auth)
      return await client.addOrUpdateContact(props)
    },
  },
  disconnect: (_props: GetResponseAuthValue): Promise<void> => {
    return Promise.resolve()
  },
  handleRequest: (_props) => {
    return Promise.reject(
      new SdkException(
        "GetResponse integration does not support webhooks yet.",
      ),
    )
  },
}

export const integration = new Integration(config)
