import { z } from "zod"

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
