import {
  Integration,
  type IntegrationDefinition,
  SdkException,
} from "@aha.chat/sdk"
import { DripClient } from "./client"
import type {
  DripActions,
  DripAuthValue,
  DripConfig,
  DripCustomField,
} from "./schemas"

const DRIP_INTEGRATION_NAME = "drip"

const config: IntegrationDefinition<DripConfig, DripAuthValue, DripActions> = {
  name: DRIP_INTEGRATION_NAME,
  actions: {
    testConnection: async ({ ctx }) => {
      const client = new DripClient(ctx.auth)
      return await client.testConnection()
    },
    getAccounts: async ({ ctx }) => {
      const client = new DripClient(ctx.auth)
      return await client.getAccounts()
    },
    getTags: async ({ ctx }): Promise<string[]> => {
      const client = new DripClient(ctx.auth)
      return await client.getTags()
    },
    getCustomFields: async ({ ctx }): Promise<DripCustomField[]> => {
      const client = new DripClient(ctx.auth)
      return await client.getCustomFields()
    },
    syncSubscriber: async ({ ctx, props }) => {
      const client = new DripClient(ctx.auth)
      return await client.syncSubscriber(props)
    },
  },
  disconnect: (_props: DripAuthValue): Promise<void> => {
    // No-op for Drip
    return Promise.resolve()
  },
  handleRequest: (_props) => {
    return Promise.reject(
      new SdkException("Drip does not support webhooks/callbacks yet."),
    )
  },
}

export const integration = new Integration(config)
