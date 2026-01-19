import {
  Integration,
  type IntegrationDefinition,
  SdkException,
} from "@aha.chat/sdk"
import { SendGridClient } from "./client"
import type {
  SendGridActions,
  SendGridAuthValue,
  SendGridConfig,
} from "./schemas"

const SENDGRID_INTEGRATION_NAME = "sendgrid"

const config: IntegrationDefinition<
  SendGridConfig,
  SendGridAuthValue,
  SendGridActions
> = {
  name: SENDGRID_INTEGRATION_NAME,
  actions: {
    testConnection: async ({ ctx }) => {
      const client = new SendGridClient(ctx.auth)
      return await client.testConnection()
    },
    getLists: async ({ ctx }) => {
      const client = new SendGridClient(ctx.auth)
      return await client.getLists()
    },
    getCustomFields: async ({ ctx }) => {
      const client = new SendGridClient(ctx.auth)
      return await client.getCustomFields()
    },
    addOrUpdateContact: async ({ ctx, props }) => {
      const client = new SendGridClient(ctx.auth)
      return await client.addOrUpdateContact(props)
    },
  },
  disconnect: (_props: SendGridAuthValue): Promise<void> => {
    return Promise.resolve()
  },
  handleRequest: (_props) => {
    return Promise.reject(
      new SdkException("SendGrid integration does not support webhooks yet."),
    )
  },
}

export const integration = new Integration(config)
