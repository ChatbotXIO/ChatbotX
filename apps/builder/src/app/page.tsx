import { notFound } from "next/navigation"
import WorkspacesList from "@/features/workspaces/components/chatbot-list"
import { getCurrentUserAndAllLinkedChatbots } from "@/lib/auth/utils"

export default async function MainPage() {
  const userAndChatbots = await getCurrentUserAndAllLinkedChatbots()
  if (!userAndChatbots) {
    return notFound()
  }

  return <WorkspacesList workspaces={userAndChatbots.allChatbots} />
}
