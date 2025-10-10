import { getAllChatbotMembers } from "@/features/chatbot-members/queries"
import ChatbotList from "@/features/chatbots/components/chatbot-list"
import { getCurrentUserId } from "@/lib/auth"

export default async function MainPage() {
  const userId = await getCurrentUserId()

  const { chatbots } = await getAllChatbotMembers(userId)

  return <ChatbotList chatbots={chatbots} />
}
