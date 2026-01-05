import { z } from "zod"

export const chatbotMemberPermissions = {
  superAdmin: "superAdmin",
  analytics: "analytics",
  flows: "flows",
  contacts: "contacts",
  onlyAssignedContacts: "onlyAssignedContacts",
  emailAndPhone: "emailAndPhone",
  broadcast: "broadcast",
  ecommerce: "ecommerce",
} as const

export const chatbotMemberNotificationTypes = {
  notifyAdmin: "notifyAdmin",
  newMessageToHuman: "newMessageToHuman",
  newOrder: "newOrder",
} as const

export const chatbotMemberNotificationChannels = {
  messenger: "messenger",
  email: "email",
  telegram: "telegram",
  browser: "browser",
} as const

export const inviteChatbotMemberRequest = z.object({
  permissions: z
    .object({
      superAdmin: z.boolean(),
      analytics: z.boolean(),
      flows: z.boolean(),
      contacts: z.boolean(),
      onlyAssignedContacts: z.boolean(),
      emailAndPhone: z.boolean(),
      broadcast: z.boolean(),
      ecommerce: z.boolean(),
    })
    .refine((val) => Object.values(val).some(Boolean), {
      message: "At least one permission must be selected.",
      path: ["permissions"],
    }),
})
export type InviteChatbotMemberRequest = z.infer<
  typeof inviteChatbotMemberRequest
>

export const updateChatbotMemberRequest = inviteChatbotMemberRequest.extend({
  notificationTypes: z.object({
    notifyAdmin: z.boolean(),
    newMessageToHuman: z.boolean(),
    newOrder: z.boolean(),
  }),
  notificationChannels: z.object({
    messenger: z.boolean(),
    email: z.boolean(),
    telegram: z.boolean(),
    browser: z.boolean(),
  }),
})
export type UpdateChatbotMemberRequest = z.infer<
  typeof updateChatbotMemberRequest
>
