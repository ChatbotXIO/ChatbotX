import { Suspense } from "react"
import AIFilesTable from "@/features/ai-files/ai-files-table"
import { listAIFiles } from "@/features/ai-files/queries"
import { AIHubBreadcrumb } from "@/features/ai-hub/ai-hub-breadcrumb"

type AIFilesPageProps = {
  params: Promise<{
    chatbotId: string
  }>
}

export default async function AIFilesPage({ params }: AIFilesPageProps) {
  const { chatbotId } = await params

  const promises = Promise.all([
    listAIFiles({
      chatbotId,
    }),
  ])

  return (
    <div className="space-y-6">
      <AIHubBreadcrumb />

      <Suspense>
        <AIFilesTable promises={promises} />
      </Suspense>
    </div>
  )
}
