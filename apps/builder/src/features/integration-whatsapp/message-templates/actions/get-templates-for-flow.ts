"use server"

import { getTemplatesForChatbot } from "../queries"

export async function getTemplatesForFlow(chatbotId: string) {
  return await getTemplatesForChatbot(chatbotId, "APPROVED")
}
