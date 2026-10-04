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
    label: z
      .string()
      .min(1)
      .describe("Text of the suggestion button shown to the visitor."),
    type: z
      .literal(webchatConversationStarterType.enum.flow)
      .describe("Runs a flow when the visitor taps the suggestion."),
    flowId: zodBigintAsString().describe(
      "Flow to run. Get it from `flows.list`.",
    ),
  }),
  z.object({
    label: z
      .string()
      .min(1)
      .describe("Text of the suggestion button shown to the visitor."),
    type: z
      .literal(webchatConversationStarterType.enum.message)
      .describe("Sends the label text as the visitor's message when tapped."),
  }),
  z.object({
    label: z
      .string()
      .min(1)
      .describe("Text of the suggestion button shown to the visitor."),
    type: z
      .literal(webchatConversationStarterType.enum.url)
      .describe("Opens a website when the visitor taps the suggestion."),
    url: z.url().describe("Absolute URL to open, including https://."),
  }),
])
export type WebchatConversationStarter = z.infer<
  typeof webchatConversationStarter
>

export const webchatPersistentMenu = z.discriminatedUnion("type", [
  z.object({
    label: z.string().min(1).describe("Menu item text shown in the widget."),
    type: z
      .literal(webchatPersistentMenuType.enum.flow)
      .describe("Runs a flow when the visitor selects the menu item."),
    flowId: zodBigintAsString().describe(
      "Flow to run. Get it from `flows.list`.",
    ),
  }),
  z.object({
    label: z.string().min(1).describe("Menu item text shown in the widget."),
    type: z
      .literal(webchatPersistentMenuType.enum.url)
      .describe("Opens a website when the visitor selects the menu item."),
    url: z.url().describe("Absolute URL to open, including https://."),
  }),
])
export type WebchatPersistentMenu = z.infer<typeof webchatPersistentMenu>
