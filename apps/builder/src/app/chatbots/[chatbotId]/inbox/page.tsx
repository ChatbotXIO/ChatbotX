import { cookies } from "next/headers"
import { ChatLayout } from "@/features/chat/chat-layout"
import { ChatStoreProvider } from "@/features/chat/store/chat-store-provider"
import { getAgents } from "@/features/chatbot-members/queries"
import { getChatbotMembersSearchParamsCache } from "@/features/chatbot-members/schemas/get-chatbot-members.request"
import { listInboxes } from "@/features/inboxes/queries"

export default async function InboxPage({
  params,
}: {
  params: Promise<{ chatbotId: string }>
}) {
  const layout = (await cookies()).get("csm:layout:inbox")
  const savedLayout = layout ? JSON.parse(layout.value) : [25, 50, 25]
  const { chatbotId } = await params

  const promises = Promise.all([
    getAgents({
      chatbotId,
      ...getChatbotMembersSearchParamsCache.parse({}),
    }),
    listInboxes({
      chatbotId,
      includes: ["integration"],
    }),
  ])

  return (
    <ChatStoreProvider>
      <ChatLayout layout={savedLayout} promises={promises} />
    </ChatStoreProvider>
  )
}
