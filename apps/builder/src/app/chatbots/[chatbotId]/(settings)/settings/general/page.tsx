import { notFound } from "next/navigation"
import { UpdateChatbotForm } from "@/features/chatbot/update-chatbot-form"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import { getCurrentUserAndTargetChatbot } from "@/lib/auth/utils"

export default async function GeneralPage(props: {
  params: Promise<{ chatbotId: string }>
}) {
  const { chatbotId } = await props.params
  const currentUserAndTargetChatbot =
    await getCurrentUserAndTargetChatbot(chatbotId)
  if (!currentUserAndTargetChatbot) {
    return notFound()
  }

  return (
    <FlowStoreProvider chatbotId={chatbotId}>
      <UpdateChatbotForm chatbot={currentUserAndTargetChatbot.targetChatbot} />
    </FlowStoreProvider>
  )
}
