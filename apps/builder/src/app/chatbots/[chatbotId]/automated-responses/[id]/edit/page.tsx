import { parseBigIntId } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import EditAutomatedResponseForm from "@/features/automated-response/edit-automated-response-form"
import { findAutomatedResponse } from "@/features/automated-response/queries"

export default async function EditAutomatedResponePage({
  params,
}: {
  params: Promise<{ chatbotId: string; id: string }>
}) {
  const { chatbotId: chatbotIdString, id: idString } = await params
  const chatbotId = parseBigIntId(chatbotIdString)
  if (!chatbotId) {
    return notFound()
  }
  const id = parseBigIntId(idString)
  if (!id) {
    return notFound()
  }

  const automatedResponse = await findAutomatedResponse({ chatbotId, id })
  if (!automatedResponse) {
    return notFound()
  }

  return (
    <EditAutomatedResponseForm
      automatedResponse={automatedResponse}
      chatbotId={chatbotId}
    />
  )
}
