import z from "zod"

export * from "./generated/prisma/enums"
export * from "./generated/prisma/models"

export const OMNICHANNEL = "OMNICHANNEL"

export const CHAT_WIDGET_SOURCE_PREFIX = "cw:"

export const CustomFieldOperation = {
  SET: "SET",
  APPEND: "APPEND",
  PREPEND: "PREPEND",
} as const

export const ReplyType = {
  MESSAGE: "MESSAGE",
  FLOW: "FLOW",
} as const

export type ReplyMessage = {
  message: string
  type: typeof ReplyType.MESSAGE
  buttons: {
    url: string
    label: string
  }[]
}

export type ReplyFlow = {
  type: typeof ReplyType.FLOW
  flowId: string
}

export type AutomatedResponseReply = ReplyMessage | ReplyFlow

export type AIMcpServerAuthType = "NONE" | "TOKEN" | "HEADERS"

export type AIMessageRole = "user" | "assistant" | "system"

export const organizationSettingsSchema = z.object({
  whatsapp: z
    .object({
      clientId: z.string(),
      clientSecret: z.string(),
      verifyToken: z.string(),
      version: z.string(),
    })
    .optional(),
  googleSheets: z
    .object({
      clientId: z.string(),
      clientSecret: z.string(),
      verifyToken: z.string(),
    })
    .optional(),
  messenger: z
    .object({
      clientId: z.string(),
      clientSecret: z.string(),
      verifyToken: z.string(),
      version: z.string(),
    })
    .optional(),
})
export type OrganizationSettings = z.infer<typeof organizationSettingsSchema>
