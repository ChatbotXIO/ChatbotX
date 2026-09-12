import {
  webchatConversationStarter,
  webchatPersistentMenu,
} from "@chatbotx.io/database/partials"
import {
  createSelectSchema,
  integrationWebchatModel,
} from "@chatbotx.io/database/schema"
import { z } from "zod"
import { createWebchatRequest } from "./mutation"

export const webchatPublicResource = createSelectSchema(
  integrationWebchatModel,
  {
    id: z.string(),
    inboxId: z.string(),
    welcomeFlowId: z.string().nullable(),
    conversationStarters: z.array(webchatConversationStarter),
    persistentMenus: z.array(webchatPersistentMenu),
  },
).omit({ workspaceId: true, auth: true })
export type WebchatPublicResource = z.infer<typeof webchatPublicResource>

export const createWebchatPublicRequest = createWebchatRequest
  .omit({ workspaceId: true, authorizedDomains: true })
  .extend({ authorizedDomains: z.array(z.hostname()).default([]) })
export type CreateWebchatPublicRequest = z.infer<
  typeof createWebchatPublicRequest
>

export const updateWebchatPublicRequest = createWebchatPublicRequest.partial()
export type UpdateWebchatPublicRequest = z.infer<
  typeof updateWebchatPublicRequest
>
