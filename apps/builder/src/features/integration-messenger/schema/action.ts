import {
  messengerConversationStarterSchema,
  messengerPersistentMenuSchema,
  messengerPersonaSchema,
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
  welcomeFlowId: zodBigintAsString().nullable(),
  persistentMenus: z.array(messengerPersistentMenuSchema),
  personas: z.array(messengerPersonaSchema),
  conversationStarters: z.array(messengerConversationStarterSchema),
})

export type UpdateMessengerRequest = z.infer<typeof updateMessengerRequest>
