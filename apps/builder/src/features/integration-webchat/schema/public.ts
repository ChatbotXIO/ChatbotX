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

// `createWebchatPublicRequest` carries `.default(...)` on `hideHeader`,
// `showLogo`, `hideMessageInput`, and `enable` so a create request that omits
// them still gets sensible values. `.partial()` alone does NOT strip those
// defaults — zod still fills them in for an omitted key — which would make
// every partial update silently reset those four fields to their create-time
// defaults. Re-declare them here as plain optional (no default) so an
// omitted key stays omitted and the service leaves the existing value alone.
export const updateWebchatPublicRequest = createWebchatPublicRequest
  .partial()
  .extend({
    hideHeader: z.boolean().optional(),
    showLogo: z.boolean().optional(),
    hideMessageInput: z.boolean().optional(),
    enable: z.boolean().optional(),
  })
export type UpdateWebchatPublicRequest = z.infer<
  typeof updateWebchatPublicRequest
>
