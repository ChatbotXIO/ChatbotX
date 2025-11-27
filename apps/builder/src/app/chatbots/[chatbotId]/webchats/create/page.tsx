import { Suspense } from "react"
import { getFlows } from "@/features/flows/queries"
import { listFlowsSearchParams } from "@/features/flows/schemas/get-flows-schema"
import { CreateWebchatForm } from "@/features/webchat/components/create-webchat-form"

export default async function CreateWebchatPage({
  params,
}: {
  params: Promise<{ chatbotId: string }>
}) {
  const { chatbotId } = await params
  const promises = Promise.all([
    getFlows({
      chatbotId,
      ...listFlowsSearchParams.parse({
        active: "1",
      }),
    }),
  ])
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CreateWebchatForm promises={promises} />
    </Suspense>
  )
}
