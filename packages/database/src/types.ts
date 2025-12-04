import z from "zod"

export * from "./generated/prisma/enums"
export * from "./generated/prisma/models"

export const Omnichannel = "omnichannel"

export const WEBCHAT_SOURCE_PREFIX = "cw:"

export const ReplyType = {
  Message: "R01",
  Flow: "R02",
} as const

export type ReplyMessage = {
  message: string
  type: typeof ReplyType.Message
  buttons: {
    url: string
    label: string
  }[]
}

export type ReplyFlow = {
  type: typeof ReplyType.Flow
  flowId: string
}

export const UploadMode = {
  link: "link",
  file: "file",
} as const
export type UploadMode = (typeof UploadMode)[keyof typeof UploadMode]

export const CardLayout = {
  vertical: "ver",
  horizontal: "hor",
} as const
export type CardLayout = (typeof CardLayout)[keyof typeof CardLayout]

export type AutomatedResponseReply = ReplyMessage | ReplyFlow

export const AIMcpServerAuthType = {
  none: "none",
  token: "token",
  header: "header",
} as const
export type AIMcpServerAuthType =
  (typeof AIMcpServerAuthType)[keyof typeof AIMcpServerAuthType]

export const AIMessageRole = {
  user: "user",
  assistant: "assistant",
  system: "system",
  developer: "developer",
} as const
export type AIMessageRole = (typeof AIMessageRole)[keyof typeof AIMessageRole]

export const organizationSettingsSchema = z.object({
  whatsapp: z
    .object({
      clientId: z.string(),
      clientSecret: z.string(),
      verifyToken: z.string(),
      version: z.string(),
      configId: z.string(),
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
  zalo: z
    .object({
      clientId: z.string(),
      clientSecret: z.string(),
      verifyToken: z.string(),
      version: z.string(),
    })
    .optional(),
  giphy: z
    .object({
      apiKey: z.string(),
    })
    .optional(),
})
export type OrganizationSettings = z.infer<typeof organizationSettingsSchema>

export type AIAgentProvider = {
  provider: "openAI" | "gemini"
  model: string
}

export const ConversationStarterType = {
  flow: "C01",
  message: "C02",
  website: "C03",
} as const
export type ConversationStarterType =
  (typeof ConversationStarterType)[keyof typeof ConversationStarterType]

export const PersistentMenuType = {
  flow: "P01",
  website: "P02",
} as const
export type PersistentMenuType =
  (typeof PersistentMenuType)[keyof typeof PersistentMenuType]

export const WhatsappTemplateCategory = {
  marketing: "MARKETING",
  utility: "UTILITY",
} as const
export type WhatsappTemplateCategory =
  (typeof WhatsappTemplateCategory)[keyof typeof WhatsappTemplateCategory]

export const reservedCustomFieldNames = {
  first_name: "first_name",
  last_name: "last_name",
  full_name: "full_name",
  email: "email",
  phone_number: "phone_number",
  avatar: "avatar",
  locale: "locale",
  gender: "gender",
  timezone: "timezone",
  user_id: "user_id",
  user_tags: "user_tags",
  account_name: "account_name",
  account_id: "account_id",
  page_user_name: "page_user_name",
  last_input: "last_input",
  current_time: "current_time",
} as const
export type ReservedCustomFieldNames =
  (typeof reservedCustomFieldNames)[keyof typeof reservedCustomFieldNames]

export const chatbotMemberPermissionsSchema = z.object({
  superAdmin: z.boolean(),
  analytics: z.boolean(),
  flows: z.boolean(),
  contacts: z.boolean(),
  onlyAssignedContacts: z.boolean(),
  emailAndPhone: z.boolean(),
  broadcast: z.boolean(),
  ecommerce: z.boolean(),
})
export type ChatbotMemberPermissions = z.infer<
  typeof chatbotMemberPermissionsSchema
>

export const chatbotMemberNotificationTypesSchema = z.object({
  notifyAdmin: z.boolean(),
  newMessageToHuman: z.boolean(),
  newOrder: z.boolean(),
})
export type ChatbotMemberNotificationTypes = z.infer<
  typeof chatbotMemberNotificationTypesSchema
>

export const chatbotMemberNotificationChannelsSchema = z.object({
  messenger: z.boolean(),
  email: z.boolean(),
  telegram: z.boolean(),
  browser: z.boolean(),
})
export type ChatbotMemberNotificationChannels = z.infer<
  typeof chatbotMemberNotificationChannelsSchema
>
