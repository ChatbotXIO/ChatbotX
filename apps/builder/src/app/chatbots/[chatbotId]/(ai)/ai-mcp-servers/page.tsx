import { parseBigIntId } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { AITab } from "@/features/ai-hub/ai-hub-breadcrumb"
import AIMcpServersTable from "@/features/ai-mcp-servers/ai-mcp-servers-table"
import { listAIMcpServers } from "@/features/ai-mcp-servers/queries"

type AIMcpServersPageProps = {
  params: Promise<{
    chatbotId: string
  }>
}

export default async function AIMcpServersPage({
  params,
}: AIMcpServersPageProps) {
  const { chatbotId: chatbotIdString } = await params
  const chatbotId = parseBigIntId(chatbotIdString)
  if (!chatbotId) {
    return notFound()
  }

  const promises = Promise.all([
    listAIMcpServers({
      chatbotId,
    }),
  ])

  return (
    <div className="space-y-6">
      <AITab />
      <Suspense>
        <AIMcpServersTable chatbotId={chatbotId} promises={promises} />
      </Suspense>
    </div>
  )
}
