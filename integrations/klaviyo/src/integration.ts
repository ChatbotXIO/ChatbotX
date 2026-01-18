import {
  Integration,
  type IntegrationDefinition,
  SdkException,
} from "@aha.chat/sdk"
import { KlaviyoClient } from "./client"
import type {
  KlaviyoActions,
  KlaviyoAuthValue,
  KlaviyoConfig,
  KlaviyoField,
  KlaviyoList,
  KlaviyoTag,
} from "./schemas"

const KLAVIYO_INTEGRATION_NAME = "klaviyo"

const config: IntegrationDefinition<
  KlaviyoConfig,
  KlaviyoAuthValue,
  KlaviyoActions
> = {
  name: KLAVIYO_INTEGRATION_NAME,
  actions: {
    testConnection: async ({ ctx }) => {
      const client = new KlaviyoClient(ctx.auth)
      return await client.testConnection()
    },
    getLists: async ({ ctx }): Promise<KlaviyoList[]> => {
      const client = new KlaviyoClient(ctx.auth)
      return await client.getLists()
    },
    getTags: async ({ ctx }): Promise<KlaviyoTag[]> => {
      const client = new KlaviyoClient(ctx.auth)
      return await client.getTags()
    },
    getFields: async ({ ctx }): Promise<KlaviyoField[]> => {
      const client = new KlaviyoClient(ctx.auth)
      return await client.getFields()
    },
    syncProfile: async ({ ctx, props }) => {
      const client = new KlaviyoClient(ctx.auth)
      return await client.syncProfile(props)
    },
  },
  disconnect: (_props: KlaviyoAuthValue): Promise<void> => {
    // No-op for Klaviyo
    return Promise.resolve()
  },
  handleRequest: (_props) => {
    return Promise.reject(
      new SdkException("Klaviyo does not support webhooks/callbacks yet."),
    )
  },
}

export const integration = new Integration(config)
