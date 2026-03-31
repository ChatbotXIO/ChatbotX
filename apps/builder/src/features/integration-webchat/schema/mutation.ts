import {
  webchatConversationStarter,
  webchatPersistentMenu,
} from "@aha.chat/database/schema"
import { z } from "zod"

export const createWebchatRequest = z.object({
  name: z.string().min(1).max(40),
  chatbotId: z.bigint().nullish(),
  welcomeFlowId: z.bigint().nullish(),
  authorizedDomains: z.array(
    z.object({
      value: z.hostname(),
    }),
  ),
  conversationStarters: z.array(webchatConversationStarter),
  persistentMenus: z.array(webchatPersistentMenu),
  brandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Invalid color format"),
  hideHeader: z.boolean().default(true),
  showLogo: z.boolean().default(false),
  hideMessageInput: z.boolean().default(true),
  customCss: z.string().optional(),
  enable: z.boolean().default(true),
})
export type CreateWebchatRequest = z.infer<typeof createWebchatRequest>

export const simpleCreateWebchatRequest = z.object({
  name: z.string().min(1).max(40),
})
export type SimpleCreateWebchatRequest = z.infer<
  typeof simpleCreateWebchatRequest
>

export const updateWebchatRequest = createWebchatRequest.partial()
export type UpdateWebchatRequest = z.infer<typeof updateWebchatRequest>
