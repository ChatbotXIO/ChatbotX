import { CreateAutomatedResponseForm } from "@/features/automated-response/create-automated-response-form"
import { getFlows } from "@/features/flows/queries"
import { listFlowsSearchParams } from "@/features/flows/schemas/get-flows-schema"

export default async function CreateAutomatedResponePage({
  params,
  searchParams,
}: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<{ folderId: string | null }>
}) {
  const { chatbotId } = await params
  const { folderId } = await searchParams
  const promises = Promise.all([
    getFlows({
      chatbotId,
      ...listFlowsSearchParams.parse({
        active: "1",
        perPage: "1000",
      }),
    }),
  ])

  return (
    <CreateAutomatedResponseForm
      chatbotId={chatbotId}
      folderId={folderId ?? null}
      promises={promises}
    />
  )
}
