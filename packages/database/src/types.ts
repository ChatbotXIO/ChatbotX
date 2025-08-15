export * from "./generated/prisma/models"
export * from "./generated/prisma/enums"

export const OMNICHANNEL = "OMNICHANNEL"

export enum CustomFieldOperation {
  SET = "SET",
  APPEND = "APPEND",
  PREPEND = "PREPEND",
}

export interface OrganizationSettings {
  whatsappClientId: string
  whatsappClientSecret: string
  whatsappVerifyToken: string

  googleClientId: string
  googleClientSecret: string
  googleVerifyToken: string
}
