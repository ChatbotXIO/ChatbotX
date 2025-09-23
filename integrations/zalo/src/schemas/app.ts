import type {
  ContactEntity,
  Context,
  ConversationEntity,
  Handler,
  MessageEntity,
  Oauth2AuthValue,
  Oauth2Config,
  SendMessageProps,
} from "@aha.chat/sdk"
import z from "zod"
import type { ZaloWebhookEvent } from "./webhook"

export const ZALO_MESSAGE_METADATA = "SENT_FROM_AHACHATAI"

export type ZaloConfig = Oauth2Config & {
  oaSecretKey: string
  version: string
  stateParams: {
    chatbotId: string
  }
}

export type ZaloAuthValue = Oauth2AuthValue & {
  oaId: string
  metadata: {
    OAName: string
  }
}

export type ZaloActions = {
  receiveMessage: Handler<
    {
      ctx: Context<ZaloAuthValue>
      data: ZaloWebhookEvent
    },
    {
      message: MessageEntity
      conversation: ConversationEntity
      postbackAction?: { flowVersionId: string; buttonId: string } | null
    }
  >
  sendMessage: (props: SendMessageProps<ZaloAuthValue>) => Promise<void>
  getUserProfile: (props: {
    ctx: Context<ZaloAuthValue>
    uid: string
  }) => Promise<ContactEntity>
}

export const zaloTokens = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.string(),
})
export type ZaloTokens = z.infer<typeof zaloTokens>

export const OAProfile = z.object({
  oa_id: z.string(),
  name: z.string(),
  description: z.string(),
  avatar: z.string().url(),
})
export type zaloOAProfile = z.infer<typeof OAProfile>
