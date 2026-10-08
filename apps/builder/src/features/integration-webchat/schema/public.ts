import { webchatConnectConfigSchema } from "@chatbotx.io/business"
import {
  webchatConversationStarter,
  webchatPersistentMenu,
} from "@chatbotx.io/database/partials"
import {
  createSelectSchema,
  integrationWebchatModel,
} from "@chatbotx.io/database/schema"
import { z } from "zod"

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

export const createWebchatPublicRequest = webchatConnectConfigSchema.extend({
  conversationStarters: z
    .array(webchatConversationStarter)
    .describe("Suggested opening messages shown to visitors."),
  persistentMenus: z
    .array(webchatPersistentMenu)
    .describe("Quick-access menu items shown in the widget."),
  brandColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Invalid color format")
    .describe("Widget accent color as a 6-digit hex code."),
})
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
    hideHeader: z
      .boolean()
      .optional()
      .describe("Whether to hide the widget's header bar."),
    showLogo: z
      .boolean()
      .optional()
      .describe("Whether to show the brand logo in the widget."),
    hideMessageInput: z
      .boolean()
      .optional()
      .describe("Whether to hide the message input box."),
    enable: z
      .boolean()
      .optional()
      .describe("Whether the webchat widget is active."),
  })
export type UpdateWebchatPublicRequest = z.infer<
  typeof updateWebchatPublicRequest
>
