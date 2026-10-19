import { webchatConnectConfigSchema } from "@chatbotx.io/business/integration-webchat/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const createWebchatRequest = webchatConnectConfigSchema
  .omit({
    authorizedDomains: true,
  })
  .extend({
    workspaceId: zodBigintAsString().nullish(),
    authorizedDomains: z
      .array(z.object({ value: z.hostname() }))
      .describe("Domains allowed to embed this webchat widget."),
  })
export type CreateWebchatRequest = z.infer<typeof createWebchatRequest>

export const simpleCreateWebchatRequest = z.object({
  name: z.string().min(1).max(40),
})
export type SimpleCreateWebchatRequest = z.infer<
  typeof simpleCreateWebchatRequest
>

// `createWebchatRequest.partial()` alone would still backfill a defaulted
// field (e.g. `enable`, `showLogo`) whenever a PATCH omits it — Zod resolves
// `.default()` through `.optional()` wrapping, not just on a bare required
// field. A partial update must leave an omitted defaulted field genuinely
// `undefined` so it isn't clobbered, so those fields are re-overridden here
// with their default stripped before being made optional.
export const updateWebchatRequest = createWebchatRequest.partial().extend({
  brandColor: webchatConnectConfigSchema.shape.brandColor
    .removeDefault()
    .optional(),
  conversationStarters: webchatConnectConfigSchema.shape.conversationStarters
    .removeDefault()
    .optional(),
  persistentMenus: webchatConnectConfigSchema.shape.persistentMenus
    .removeDefault()
    .optional(),
  enable: webchatConnectConfigSchema.shape.enable.removeDefault().optional(),
  hideHeader: webchatConnectConfigSchema.shape.hideHeader
    .removeDefault()
    .optional(),
  hideMessageInput: webchatConnectConfigSchema.shape.hideMessageInput
    .removeDefault()
    .optional(),
  showLogo: webchatConnectConfigSchema.shape.showLogo
    .removeDefault()
    .optional(),
  markReadOnOutbound: z.boolean().optional(),
})
export type UpdateWebchatRequest = z.infer<typeof updateWebchatRequest>
