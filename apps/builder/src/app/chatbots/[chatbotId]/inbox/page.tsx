import { cookies } from "next/headers"
import { ChatLayout } from "@/features/chat/chat-layout"
import { ChatStoreProvider } from "@/features/chat/store/chat-store-provider"
import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
import { InboxStoreProvider } from "@/features/inboxes/provider/inbox-store-context"
import { UserStoreProvider } from "@/features/users/provider/user-store-context"

type InboxPageProps = {
  params: Promise<{ chatbotId: string }>
}

export default async function InboxPage({ params }: InboxPageProps) {
  const layout = (await cookies()).get("csm:layout:inbox")
  const savedLayout = layout ? JSON.parse(layout.value) : [25, 50, 25]
  const { chatbotId } = await params

  return (
    <ChatStoreProvider>
      <InboxStoreProvider chatbotId={chatbotId}>
        <UserStoreProvider chatbotId={chatbotId}>
          <CustomFieldStoreProvider chatbotId={chatbotId}>
            <ChatLayout layout={savedLayout} />
          </CustomFieldStoreProvider>
        </UserStoreProvider>
      </InboxStoreProvider>
    </ChatStoreProvider>
  )
}
