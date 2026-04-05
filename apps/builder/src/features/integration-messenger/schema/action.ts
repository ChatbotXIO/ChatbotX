import {
  messengerConversationStarter,
  messengerGreetingMessage,
  messengerPersistentMenu,
  messengerPersona,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"

export const selectPageRequest = z.object({
  workspaceId: z.string().nullish(),
  pageId: z.string(),
  pageName: z.string(),
  accessToken: z.string(),
})
export type SelectPageRequest = z.infer<typeof selectPageRequest>

export const updateMessengerRequest = z.object({
  addLanguage: z.string().optional(),
  welcomeFlowId: zodBigintAsString().nullable(),
  greetingMessages: z.array(messengerGreetingMessage),
  persistentMenus: z.array(messengerPersistentMenu),
  personas: z.array(messengerPersona),
  conversationStarters: z.array(messengerConversationStarter),
})

export type UpdateMessengerRequest = z.infer<typeof updateMessengerRequest>
