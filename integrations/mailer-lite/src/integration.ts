import {
  Integration,
  type IntegrationDefinition,
  SdkException,
} from "@aha.chat/sdk"
import { MailerLiteClient } from "./client"
import type {
  MailerLiteActions,
  MailerLiteAuthValue,
  MailerLiteConfig,
} from "./schemas"

const MAILER_LITE_INTEGRATION_NAME = "mailerLite"

const config: IntegrationDefinition<
  MailerLiteConfig,
  MailerLiteAuthValue,
  MailerLiteActions
> = {
  name: MAILER_LITE_INTEGRATION_NAME,
  actions: {
    testConnection: async ({ ctx }) => {
      const client = new MailerLiteClient(ctx.auth)
      return await client.testConnection()
    },
    getGroups: async ({ ctx }) => {
      const client = new MailerLiteClient(ctx.auth)
      return await client.getGroups()
    },
    getFields: async ({ ctx }) => {
      const client = new MailerLiteClient(ctx.auth)
      return await client.getFields()
    },
    addOrUpdateSubscriber: async ({ ctx, props }) => {
      const client = new MailerLiteClient(ctx.auth)
      return await client.addOrUpdateSubscriber(props)
    },
  },
  disconnect: (_props: MailerLiteAuthValue): Promise<void> => {
    return Promise.resolve()
  },
  handleRequest: (_props) => {
    return Promise.reject(
      new SdkException("MailerLite integration does not support webhooks yet."),
    )
  },
}

export const integration = new Integration(config)
