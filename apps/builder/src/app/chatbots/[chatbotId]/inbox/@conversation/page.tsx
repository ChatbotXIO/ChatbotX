import ConversationList from "@/features/conversations/conversation-list";
import type { SearchParams } from "nuqs/server";
import { getConversations } from "@/features/conversations/queries";
import { Suspense } from "react";

export default async function ConversationsPage(props: {
  params: Promise<{ chatbotId: string }>,
  searchParams: Promise<SearchParams>
}) {
  const params = await props.params

  const promises = getConversations({
    chatbotId: params.chatbotId,
  })

  return (
    <Suspense>
      <ConversationList chatbotId={params.chatbotId} promises={promises}/>
    </Suspense>
  )
}
