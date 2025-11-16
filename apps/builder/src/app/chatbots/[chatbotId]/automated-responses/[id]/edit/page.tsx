import { notFound } from "next/navigation"
import EditAutomatedResponseForm from "@/features/automated-response/edit-automated-response-form"
import { findAutomatedResponse } from "@/features/automated-response/queries"
import { getFlows } from "@/features/flows/queries"
import { listFlowsSearchParams } from "@/features/flows/schemas/get-flows-schema"

export default async function EditAutomatedResponePage({
  params,
}: {
  params: Promise<{ chatbotId: string; id: string }>
}) {
  const { chatbotId, id } = await params
  const automatedResponse = await findAutomatedResponse({ chatbotId, id })
  const promises = Promise.all([
    getFlows({
      chatbotId,
      ...listFlowsSearchParams.parse({
        active: "1",
        perPage: "1000",
      }),
    }),
  ])
  if (!automatedResponse) {
    return notFound()
  }

  return (
    <EditAutomatedResponseForm
      automatedResponse={automatedResponse}
      chatbotId={chatbotId}
      promises={promises}
    />
  )
}
