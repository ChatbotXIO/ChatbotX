import { webchatConnectConfigSchema } from "@chatbotx.io/business/integration-webchat/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const createWebchatRequest = webchatConnectConfigSchema
  .omit({
    authorizedDomains: true,
    brandColor: true,
    conversationStarters: true,
    enable: true,
    hideHeader: true,
    hideMessageInput: true,
    persistentMenus: true,
    showLogo: true,
  })
  .extend({
    workspaceId: zodBigintAsString().nullish(),
    authorizedDomains: z
      .array(z.object({ value: z.hostname() }))
      .describe("Domains allowed to embed this webchat widget."),
    brandColor: webchatConnectConfigSchema.shape.brandColor.removeDefault(),
    conversationStarters:
      webchatConnectConfigSchema.shape.conversationStarters.removeDefault(),
    persistentMenus:
      webchatConnectConfigSchema.shape.persistentMenus.removeDefault(),
    enable: webchatConnectConfigSchema.shape.enable.removeDefault(),
    hideHeader: webchatConnectConfigSchema.shape.hideHeader.removeDefault(),
    hideMessageInput:
      webchatConnectConfigSchema.shape.hideMessageInput.removeDefault(),
    showLogo: webchatConnectConfigSchema.shape.showLogo.removeDefault(),
  })
export type CreateWebchatRequest = z.infer<typeof createWebchatRequest>

export const simpleCreateWebchatRequest = z.object({
  name: z.string().min(1).max(40),
})
export type SimpleCreateWebchatRequest = z.infer<
  typeof simpleCreateWebchatRequest
>

export const updateWebchatRequest = createWebchatRequest.partial().extend({
  markReadOnOutbound: z.boolean().optional(),
})
export type UpdateWebchatRequest = z.infer<typeof updateWebchatRequest>
