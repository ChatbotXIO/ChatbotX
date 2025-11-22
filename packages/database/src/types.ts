import z from "zod"

export * from "./generated/prisma/enums"
export * from "./generated/prisma/models"

export const Omnichannel = "omnichannel"

export const WEBCHAT_SOURCE_PREFIX = "cw:"

/**
 * Maximum value for a 32-bit signed integer (2^31 - 1) = 2,147,483,647
 *
 * This is the limit for PostgreSQL INTEGER type (32-bit signed integer).
 * Unlike Number.MAX_SAFE_INTEGER (2^53 - 1) which is JavaScript's limit,
 * this constant represents the database constraint.
 *
 * Note: JavaScript/TypeScript doesn't have this constant built-in because
 * JS numbers are 64-bit floating point, not 32-bit integers.
 */
export const MAX_32_BIT_SIGNED_INTEGER = 2_147_483_647

export const FieldOperationType = {
  set: "O01",
  append: "O02",
  prepend: "O03",
} as const

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

export const AI_PROVIDERS = {
  OPENAI: "openai",
  GEMINI: "gemini",
  CLAUDE: "claude",
  DEEPSEEK: "deepseek",
} as const

export type AIProvider = (typeof AI_PROVIDERS)[keyof typeof AI_PROVIDERS]

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
