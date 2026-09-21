import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { AIFunctionsTable } from "@/features/ai-functions/ai-functions-table"
import { listAIFunctions } from "@/features/ai-functions/queries"
import { AITab } from "@/features/ai-hub/ai-hub-breadcrumb"

type AIFunctionsPageProps = {
  params: Promise<{ workspaceId: string }>
}

export default async function AIFunctionsPage({
  params,
}: AIFunctionsPageProps) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const promises = Promise.all([
    listAIFunctions({
      workspaceId,
    }),
  ])

  return (
    <div className="space-y-6">
      <AITab />

      <Suspense>
        <AIFunctionsTable promises={promises} workspaceId={workspaceId} />
      </Suspense>
    </div>
  )
}
