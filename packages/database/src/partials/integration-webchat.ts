import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const webchatConversationStarterType = z.enum(["flow", "message", "url"])
export type WebchatConversationStarterType = z.infer<
  typeof webchatConversationStarterType
>
export const webchatPersistentMenuType = z.enum(["flow", "url"])
export type WebchatPersistentMenuType = z.infer<
  typeof webchatPersistentMenuType
>

export const webchatConversationStarter = z.discriminatedUnion("type", [
  z.object({
    label: z.string().min(1),
    type: z.literal(webchatConversationStarterType.enum.flow),
    flowId: zodBigintAsString(),
  }),
  z.object({
    label: z.string().min(1),
    type: z.literal(webchatConversationStarterType.enum.message),
  }),
  z.object({
    label: z.string().min(1),
    type: z.literal(webchatConversationStarterType.enum.url),
    url: z.url(),
  }),
])
export type WebchatConversationStarter = z.infer<
  typeof webchatConversationStarter
>

export const webchatPersistentMenu = z.discriminatedUnion("type", [
  z.object({
    label: z.string().min(1),
    type: z.literal(webchatPersistentMenuType.enum.flow),
    flowId: zodBigintAsString(),
  }),
  z.object({
    label: z.string().min(1),
    type: z.literal(webchatPersistentMenuType.enum.url),
    url: z.url(),
  }),
])
export type WebchatPersistentMenu = z.infer<typeof webchatPersistentMenu>
