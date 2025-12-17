import { cookies } from "next/headers"
import { ChatLayout } from "@/features/chat/chat-layout"
import { ChatStoreProvider } from "@/features/chat/store/chat-store-provider"
import { InboxStoreProvider } from "@/features/inboxes/provider/inbox-store-context"
import { UserStoreProvider } from "@/features/users/provider/user-store-context"

export default async function InboxPage({
  params,
}: {
  params: Promise<{ chatbotId: string }>
}) {
  const layout = (await cookies()).get("csm:layout:inbox")
  const savedLayout = layout ? JSON.parse(layout.value) : [25, 50, 25]
  const { chatbotId } = await params

  return (
    <ChatStoreProvider>
      <InboxStoreProvider chatbotId={chatbotId}>
        <UserStoreProvider
          autoInitializeAgentsAndInboxTeams={true}
          chatbotId={chatbotId}
        >
          <ChatLayout layout={savedLayout} />
        </UserStoreProvider>
      </InboxStoreProvider>
    </ChatStoreProvider>
  )
}
