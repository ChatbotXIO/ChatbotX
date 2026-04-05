import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import AIFilesTable from "@/features/ai-files/ai-files-table"
import { listAIFiles } from "@/features/ai-files/queries"
import { AITab } from "@/features/ai-hub/ai-hub-breadcrumb"

type AIFilesPageProps = {
  params: Promise<{ workspaceId: string }>
}

export default async function AIFilesPage({ params }: AIFilesPageProps) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const promises = Promise.all([
    listAIFiles({
      workspaceId,
    }),
  ])

  return (
    <div className="space-y-6">
      <AITab />

      <Suspense>
        <AIFilesTable promises={promises} />
      </Suspense>
    </div>
  )
}
