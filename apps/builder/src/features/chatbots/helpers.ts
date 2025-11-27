import { env } from "@/env"
import type { ChatbotResource } from "./schemas/resource"

export function getChatbotLogoUrl(chatbot: ChatbotResource) {
  return chatbot.logo
    ? new URL(chatbot.logo, env.NEXT_PUBLIC_ASSET_URL).toString()
    : undefined
}
