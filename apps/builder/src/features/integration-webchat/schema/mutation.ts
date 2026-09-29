import {
  webchatConversationStarter,
  webchatPersistentMenu,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const createWebchatRequest = z.object({
  name: z.string().min(1).max(40).describe("Webchat display name."),
  workspaceId: zodBigintAsString().nullish(),
  welcomeFlowId: zodBigintAsString()
    .nullish()
    .describe(
      "Flow to trigger when a visitor opens the widget, or null for none.",
    ),
  authorizedDomains: z
    .array(
      z.object({
        value: z.hostname(),
      }),
    )
    .describe("Domains allowed to embed this webchat widget."),
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
  hideHeader: z
    .boolean()
    .default(false)
    .describe("Whether to hide the widget's header bar."),
  showLogo: z
    .boolean()
    .default(true)
    .describe("Whether to show the brand logo in the widget."),
  hideMessageInput: z
    .boolean()
    .default(false)
    .describe("Whether to hide the message input box."),
  customCss: z
    .string()
    .max(20_000)
    .optional()
    .describe("Custom CSS applied to the widget."),
  enable: z
    .boolean()
    .default(true)
    .describe("Whether the webchat widget is active."),
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
