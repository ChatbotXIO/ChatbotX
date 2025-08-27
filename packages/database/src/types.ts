export * from "./generated/prisma/enums"
export * from "./generated/prisma/models"

export const OMNICHANNEL = "OMNICHANNEL"

export const CHAT_WIDGET_SOURCE_PREFIX = "cw:"

export const CustomFieldOperation = {
  SET: "SET",
  APPEND: "APPEND",
  PREPEND: "PREPEND",
} as const

export type OrganizationSettings = {
  whatsappClientId: string
  whatsappClientSecret: string
  whatsappVerifyToken: string

  googleClientId: string
  googleClientSecret: string
  googleVerifyToken: string
}
