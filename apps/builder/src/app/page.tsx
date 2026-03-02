import { notFound } from "next/navigation"
import ChatbotList from "@/features/chatbots/components/chatbot-list"
import { getCurrentUserAndAllLinkedChatbots } from "@/lib/auth/utils"

export default async function MainPage() {
  const userAndChatbots = await getCurrentUserAndAllLinkedChatbots()
  if (!userAndChatbots) {
    return notFound()
  }

  return <ChatbotList chatbots={userAndChatbots.allChatbots} />
}
