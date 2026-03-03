import { notFound } from "next/navigation"
import EditAutomatedResponseForm from "@/features/automated-response/edit-automated-response-form"
import { findAutomatedResponse } from "@/features/automated-response/queries"

export default async function EditAutomatedResponePage({
  params,
}: {
  params: Promise<{ chatbotId: string; id: string }>
}) {
  const { chatbotId, id } = await params

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
