import {
  Integration,
  type IntegrationDefinition,
  SdkException,
} from "@aha.chat/sdk"
import { SendFoxClient } from "./client"
import type { SendFoxActions, SendFoxAuthValue, SendFoxConfig } from "./schemas"

const SENDFOX_INTEGRATION_NAME = "sendFox"

const config: IntegrationDefinition<
  SendFoxConfig,
  SendFoxAuthValue,
  SendFoxActions
> = {
  name: SENDFOX_INTEGRATION_NAME,
  actions: {
    testConnection: async ({ ctx }) => {
      const client = new SendFoxClient(ctx.auth)
      return await client.testConnection()
    },
    getLists: async ({ ctx }) => {
      const client = new SendFoxClient(ctx.auth)
      return await client.getLists()
    },
    createContact: async ({ ctx, props }) => {
      const client = new SendFoxClient(ctx.auth)
      return await client.createContact(props)
    },
  },
  disconnect: (_props: SendFoxAuthValue): Promise<void> => {
    return Promise.resolve()
  },
  handleRequest: (_props) => {
    return Promise.reject(
      new SdkException("SendFox integration does not support webhooks yet."),
    )
  },
}

export const integration = new Integration(config)
