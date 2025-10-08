import { ChatbotMemberRole } from "@aha.chat/database"
import { z } from "zod"

export const addChatbotMemberSchema = z.object({
  chatbotId: z.cuid2(),
  userId: z.cuid2(),
  role: z.enum(ChatbotMemberRole),
  isAdmin: z.boolean(),
  enableAnalytics: z.boolean(),
  enableFlows: z.boolean(),
  enableContacts: z.boolean(),
  enableOnlyAssignedContacts: z.boolean(),
  enableEmailAndPhone: z.boolean(),
  enableBroadcast: z.boolean(),
  enableEcommerce: z.boolean(),
  permissions: z.array(z.string()).optional(),
})
