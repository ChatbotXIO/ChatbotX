import botFieldChatbotTokenAPIs from "@/features/bot-fields/api/chatbot-token"
import { broadcastChatbotTokenAPIs } from "@/features/broadcasts/api/chatbot-token"
import contactChatbotTokenAPIs from "@/features/contacts/api/chatbot-token"
import customFieldChatbotTokenAPIs from "@/features/custom-fields/api/chatbot-token"
import flowChatbotTokenAPIs from "@/features/flows/api/chatbot-token"
import tagChatbotTokenAPIs from "@/features/tags/api/chatbot-token"

export const publicRouter = {
  ...contactChatbotTokenAPIs,
  ...customFieldChatbotTokenAPIs,
  ...tagChatbotTokenAPIs,
  ...flowChatbotTokenAPIs,
  ...botFieldChatbotTokenAPIs,
  ...broadcastChatbotTokenAPIs,
}
