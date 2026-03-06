import { initBotMessageSpooler } from "./bot-message-events-spooler"
import { initContactSpooler } from "./contact-events-spooler"
import { initConversationSpooler } from "./conversation-events-spooler"

export async function bootstrapAnalytics() {
  await initContactSpooler()
  await initBotMessageSpooler()
  await initConversationSpooler()
}
