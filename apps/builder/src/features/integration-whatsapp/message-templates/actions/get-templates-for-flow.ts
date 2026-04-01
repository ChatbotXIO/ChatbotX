"use server"

import { getTemplatesForChatbot } from "../queries"

export async function getTemplatesForFlow(chatbotId: bigint) {
  return await getTemplatesForChatbot(chatbotId, "APPROVED")
}
