import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import AIFunctionsTable from "@/features/ai-functions/ai-functions-table"
import { listAIFunctions } from "@/features/ai-functions/queries"
import { AITab } from "@/features/ai-hub/ai-hub-breadcrumb"
import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"

type AIFunctionsPageProps = {
  params: Promise<{ chatbotId: string }>
}

export default async function AIFunctionsPage({
  params,
}: AIFunctionsPageProps) {
  const chatbotId = getIdFromParams(await params, "chatbotId")
  if (!chatbotId) {
    return notFound()
  }

  const promises = Promise.all([
    listAIFunctions({
      chatbotId,
    }),
  ])

  return (
    <div className="space-y-6">
      <AITab />

      <Suspense>
        <FlowStoreProvider chatbotId={chatbotId}>
          <CustomFieldStoreProvider chatbotId={chatbotId}>
            <AIFunctionsTable chatbotId={chatbotId} promises={promises} />
          </CustomFieldStoreProvider>
        </FlowStoreProvider>
      </Suspense>
    </div>
  )
}
