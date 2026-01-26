import {
  Integration,
  type IntegrationDefinition,
  SdkException,
} from "@aha.chat/sdk"
import { MoosendClient } from "./client"
import type { MoosendActions, MoosendAuthValue, MoosendConfig } from "./schemas"

const MOOSEND_INTEGRATION_NAME = "moosend"

const config: IntegrationDefinition<
  MoosendConfig,
  MoosendAuthValue,
  MoosendActions
> = {
  name: MOOSEND_INTEGRATION_NAME,
  actions: {
    testConnection: async ({ ctx }) => {
      const client = new MoosendClient(ctx.auth)
      return await client.testConnection()
    },
    getLists: async ({ ctx }) => {
      const client = new MoosendClient(ctx.auth)
      return await client.getLists()
    },
    createContact: async ({ ctx, props }) => {
      const client = new MoosendClient(ctx.auth)
      return await client.createContact(props)
    },
  },
  disconnect: (_props: MoosendAuthValue): Promise<void> => {
    return Promise.resolve()
  },
  handleRequest: (_props) => {
    return Promise.reject(
      new SdkException("Moosend integration does not support webhooks yet."),
    )
  },
}

export const integration = new Integration(config)
