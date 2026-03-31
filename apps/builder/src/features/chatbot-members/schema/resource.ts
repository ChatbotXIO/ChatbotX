import {
  chatbotMemberModel,
  createSelectSchema,
} from "@aha.chat/database/schema"
import { z } from "zod"

export const chatbotMemberPermissions = z.enum([
  "superAdmin",
  "analytics",
  "flows",
  "contacts",
  "onlyAssignedContacts",
  "emailAndPhone",
  "broadcast",
  "ecommerce",
])

export const chatbotMemberNotificationTypes = z.enum([
  "notifyAdmin",
  "newMessageToHuman",
  "newOrder",
])

export const chatbotMemberNotificationChannels = z.enum([
  "messenger",
  "email",
  "telegram",
  "browser",
])

export const chatbotMemberResource = createSelectSchema(chatbotMemberModel)
export type ChatbotMemberResource = z.infer<typeof chatbotMemberResource>
