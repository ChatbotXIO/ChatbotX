import { parseBigIntId } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import AIFilesTable from "@/features/ai-files/ai-files-table"
import { listAIFiles } from "@/features/ai-files/queries"
import { AITab } from "@/features/ai-hub/ai-hub-breadcrumb"

type AIFilesPageProps = {
  params: Promise<{
    chatbotId: string
  }>
}

export default async function AIFilesPage({ params }: AIFilesPageProps) {
  const { chatbotId: chatbotIdString } = await params
  const chatbotId = parseBigIntId(chatbotIdString)
  if (!chatbotId) {
    return notFound()
  }

  const promises = Promise.all([
    listAIFiles({
      chatbotId,
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
