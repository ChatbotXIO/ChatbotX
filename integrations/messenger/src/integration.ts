import {
  HandleRequestType,
  Integration,
  type IntegrationDefinition,
} from "@chatbotx.io/sdk"
import {
  type CloneMessengerTemplateProps,
  clonePageMessageTemplate,
  listPageMessageTemplates,
} from "./apis/message-templates"
import { syncPersonas, unsubscribePageFromAppWebhook } from "./apis/page"
import { getPostDetails } from "./apis/post"
import { MessengerAPIException } from "./exception"
import { botHandlers } from "./handlers/bot"
import { commentHandlers } from "./handlers/comment"
import { contactHandlers } from "./handlers/contact"
import { conversationHandlers } from "./handlers/conversation"
import { messageHandlers } from "./handlers/message"
import { webhookHandler } from "./handlers/webhook"
import type {
  MessengerActions,
  MessengerAuthValue,
  MessengerConfig,
} from "./schema"

const config: IntegrationDefinition<
  MessengerConfig,
  MessengerAuthValue,
  MessengerActions
> = {
  name: "messenger",
  channels: {
    channel: {
      message: messageHandlers,
      comment: commentHandlers,
      conversation: conversationHandlers,
      contact: contactHandlers,
      bot: botHandlers,
    },
  },
  actions: {
    syncPersonas,
    getPostDetails,
    listMessageTemplates: async ({ ctx, input }) =>
      listPageMessageTemplates(ctx.auth, input),
    cloneMessageTemplate: async ({
      ctx,
      input,
    }: {
      ctx: { auth: MessengerAuthValue }
      input: CloneMessengerTemplateProps
    }) => clonePageMessageTemplate(ctx.auth, input),
  },
  handleRequest: async (props) => {
    const segments = new URL(props.req.url).pathname.split("/")
    const action = segments.pop()

    switch (action) {
      case HandleRequestType.webhook:
        return await webhookHandler(props)
      default:
        throw new MessengerAPIException(
          `${props.req.method} ${props.req.url} is not implemented`,
        )
    }
  },
  disconnect: async (auth: MessengerAuthValue): Promise<void> => {
    await unsubscribePageFromAppWebhook(auth)
  },
}

export const integration = new Integration<
  IntegrationDefinition<MessengerConfig, MessengerAuthValue, MessengerActions>
>(config)
